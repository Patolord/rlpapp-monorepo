import { v } from "convex/values";
import { authedMutation, engineeringMutation } from "./lib/rbac";
import { equipmentStatusValidator } from "./equipment";
import { logEquipmentHistory } from "./lib/audit";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const locationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

// Mantém qrCodes.projectId (denormalizado) em sincronia com o vínculo
// equipamento ↔ item planejado. `projectId: undefined` limpa o campo.
async function syncQrProjectId(
  ctx: MutationCtx,
  equipmentId: Id<"equipment">,
  projectId: Id<"projects"> | undefined
) {
  const qrCodes = await ctx.db
    .query("qrCodes")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .collect();
  for (const qr of qrCodes) {
    if (qr.projectId !== projectId) {
      await ctx.db.patch("qrCodes", qr._id, { projectId });
    }
  }
}

// Ações de campo do técnico (via QR): Instalar, Testar, Finalizar.
// Sempre registra usuário, data/hora, observação e GPS (estrutura pronta).
// authedMutation permite que qr_operator execute após escanear.
export const fieldAction = authedMutation({
  args: {
    itemId: v.id("projectEquipment"),
    action: v.union(
      v.literal("install"),
      v.literal("test"),
      v.literal("finalize")
    ),
    notes: v.optional(v.string()),
    location: v.optional(locationValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento não encontrado");

    const now = Date.now();
    const previousStatus = item.status;
    const patch: Record<string, unknown> = {};
    let newStatus: typeof item.status = item.status;

    if (args.action === "install") {
      newStatus = "installing";
      patch.installationDate = item.installationDate ?? now;
      patch.installedAt = item.installedAt ?? now;
    } else if (args.action === "test") {
      newStatus = "warning";
      patch.testDate = item.testDate ?? now;
    } else {
      newStatus = "operational";
      patch.installationDate = item.installationDate ?? now;
      patch.installedAt = item.installedAt ?? now;
    }
    patch.status = newStatus;

    await ctx.db.patch("projectEquipment", args.itemId, patch);
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        status: newStatus,
      });
    }
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.itemId,
      action:
        args.action === "install"
          ? "installed"
          : args.action === "test"
            ? "tested"
            : "finalized",
      previousValue: previousStatus,
      newValue: newStatus,
      notes: args.notes?.trim() || undefined,
      location: args.location,
    });
    return null;
  },
});

const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

// Cria/atualiza um equipamento planejado dentro de um AMBIENTE (hierarquia nova).
// O equipamento pertence a um sistema da obra (systems); o nome do sistema é
// denormalizado no campo `system`. Diferente de `upsert`, que opera sobre o
// caminho legado de apartamentos.
export const upsertInEnvironment = engineeringMutation({
  args: {
    itemId: v.optional(v.id("projectEquipment")),
    environmentId: v.id("environments"),
    systemId: v.id("systems"),
    ambiente: v.optional(v.string()),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    obs: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
    scheduledDate: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    const env = await ctx.db.get("environments", args.environmentId);
    if (!env) throw new Error("Ambiente não encontrado");

    const system = await ctx.db.get("systems", args.systemId);
    if (!system) throw new Error("Sistema não encontrado");
    if (system.projectId !== env.projectId) {
      throw new Error("O sistema não pertence à mesma obra do ambiente");
    }

    const base = {
      system: system.name,
      systemId: args.systemId,
      ambiente: args.ambiente?.trim() || env.name,
      kind: args.kind,
      modelo: args.modelo?.trim() ?? "",
      capacidade: args.capacidade?.trim() ?? "",
      serialNumber: args.serialNumber?.trim() || undefined,
      obs: args.obs === null ? undefined : args.obs?.trim() || undefined,
      deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
      scheduledDate:
        args.scheduledDate === null ? undefined : args.scheduledDate ?? undefined,
    };

    if (args.itemId) {
      const item = await ctx.db.get("projectEquipment", args.itemId);
      if (!item) throw new Error("Equipamento não encontrado");
      await ctx.db.patch("projectEquipment", args.itemId, {
        ...base,
        environmentId: args.environmentId,
        towerId: env.towerId,
        floorId: env.floorId,
        status: args.status ?? item.status,
      });
      return args.itemId;
    }

    const itemId = await ctx.db.insert("projectEquipment", {
      projectId: env.projectId,
      environmentId: args.environmentId,
      towerId: env.towerId,
      floorId: env.floorId,
      ...base,
      status: args.status ?? "installing",
    });
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: itemId,
      action: "created",
      newValue: base.system,
    });
    return itemId;
  },
});

export const upsert = engineeringMutation({
  args: {
    itemId: v.optional(v.id("projectEquipment")),
    projectId: v.id("projects"),
    unitId: v.id("projectUnits"),
    system: v.string(),
    ambiente: v.string(),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    obs: v.optional(v.union(v.string(), v.null())),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("projectUnits", args.unitId);
    if (!unit) throw new Error("Apartamento não encontrado");

    const base = {
      system: args.system.trim() || "Split",
      ambiente: args.ambiente.trim() || "Ambiente",
      kind: args.kind,
      modelo: args.modelo?.trim() ?? "",
      capacidade: args.capacidade?.trim() ?? "",
      obs: args.obs === null ? undefined : args.obs?.trim() || undefined,
      deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
    };

    if (args.itemId) {
      const item = await ctx.db.get("projectEquipment", args.itemId);
      if (!item) throw new Error("Equipamento não encontrado");
      await ctx.db.patch("projectEquipment", args.itemId, {
        ...base,
        status: args.status ?? item.status,
      });
      return args.itemId;
    }

    return await ctx.db.insert("projectEquipment", {
      projectId: args.projectId,
      unitId: args.unitId,
      ...base,
      status: args.status ?? "installing",
    });
  },
});

export const setStatus = engineeringMutation({
  args: {
    itemId: v.id("projectEquipment"),
    status: equipmentStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento não encontrado");
    if (item.status === args.status) return null;

    const now = Date.now();
    await ctx.db.patch("projectEquipment", args.itemId, {
      status: args.status,
      installedAt:
        args.status === "operational" ? item.installedAt ?? now : item.installedAt,
      installationDate:
        args.status === "operational"
          ? item.installationDate ?? now
          : item.installationDate,
    });
    // Reflete no equipamento real vinculado, se houver.
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        status: args.status,
      });
    }
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.itemId,
      action: "status_changed",
      previousValue: item.status,
      newValue: args.status,
    });
    return null;
  },
});

export const remove = engineeringMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) return null;
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        projectEquipmentId: undefined,
      });
      await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
    }
    await ctx.db.delete("projectEquipment", args.itemId);
    return null;
  },
});

// Anexa fotos/vídeos a um equipamento planejado (upload feito via Convex storage).
// authedMutation: técnicos em campo (qr_operator) também podem anexar.
export const addMedia = authedMutation({
  args: {
    itemId: v.id("projectEquipment"),
    photoIds: v.optional(v.array(v.id("_storage"))),
    videoIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento não encontrado");

    const patch: Record<string, unknown> = {};
    if (args.photoIds && args.photoIds.length > 0) {
      patch.photoIds = [...(item.photoIds ?? []), ...args.photoIds];
    }
    if (args.videoIds && args.videoIds.length > 0) {
      patch.videoIds = [...(item.videoIds ?? []), ...args.videoIds];
    }
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch("projectEquipment", args.itemId, patch);
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.itemId,
      action: "media_added",
      newValue: `${args.photoIds?.length ?? 0} foto(s), ${
        args.videoIds?.length ?? 0
      } vídeo(s)`,
    });
    return null;
  },
});

// Vincula um equipamento real (QR) a um item planejado → verde/instalado.
export const linkEquipment = engineeringMutation({
  args: {
    itemId: v.id("projectEquipment"),
    equipmentId: v.id("equipment"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento planejado não encontrado");

    const equipment = await ctx.db.get("equipment", args.equipmentId);
    if (!equipment) throw new Error("Equipamento não encontrado");
    if (
      equipment.projectEquipmentId &&
      equipment.projectEquipmentId !== args.itemId
    ) {
      throw new Error("Este equipamento já está vinculado a outro item");
    }

    // Desvincula o equipamento anterior, se houver.
    if (item.linkedEquipmentId && item.linkedEquipmentId !== args.equipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        projectEquipmentId: undefined,
      });
      await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
    }

    await ctx.db.patch("projectEquipment", args.itemId, {
      linkedEquipmentId: args.equipmentId,
      status: "operational",
      installedAt: item.installedAt ?? Date.now(),
    });
    await ctx.db.patch("equipment", args.equipmentId, {
      projectEquipmentId: args.itemId,
    });
    await syncQrProjectId(ctx, args.equipmentId, item.projectId);
    return null;
  },
});

export const unlinkEquipment = engineeringMutation({
  args: { itemId: v.id("projectEquipment") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento planejado não encontrado");
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        projectEquipmentId: undefined,
      });
      await syncQrProjectId(ctx, item.linkedEquipmentId, undefined);
    }
    await ctx.db.patch("projectEquipment", args.itemId, {
      linkedEquipmentId: undefined,
      status: "installing",
      installedAt: undefined,
    });
    return null;
  },
});

// Criação em lote (usada pelo assistente de IA após aprovação do usuário).
// Cria apartamentos e seus itens em uma única transação.
export const bulkCreate = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    units: v.array(
      v.object({
        floor: v.number(),
        final: v.number(),
        label: v.optional(v.string()),
        type: v.union(v.literal("vrf"), v.literal("split")),
        floorSpan: v.optional(v.number()),
        deadline: v.optional(v.number()),
        equipment: v.array(
          v.object({
            system: v.string(),
            ambiente: v.string(),
            kind: equipKindValidator,
            modelo: v.optional(v.string()),
            capacidade: v.optional(v.string()),
            obs: v.optional(v.string()),
          })
        ),
      })
    ),
  },
  returns: v.object({ units: v.number(), items: v.number() }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    let unitCount = 0;
    let itemCount = 0;

    for (const u of args.units) {
      const floor = Math.floor(u.floor);
      const final = Math.max(1, Math.floor(u.final));
      const unitId = await ctx.db.insert("projectUnits", {
        projectId: args.projectId,
        floor,
        final,
        label: u.label?.trim() || `${floor}${String(final).padStart(2, "0")}`,
        type: u.type,
        floorSpan: Math.max(1, Math.floor(u.floorSpan ?? 1)),
        deadline: u.deadline ?? undefined,
      });
      unitCount++;

      for (const e of u.equipment) {
        await ctx.db.insert("projectEquipment", {
          projectId: args.projectId,
          unitId,
          system: e.system.trim() || "Split",
          ambiente: e.ambiente.trim() || "Ambiente",
          kind: e.kind,
          modelo: e.modelo?.trim() ?? "",
          capacidade: e.capacidade?.trim() ?? "",
          obs: e.obs?.trim() || undefined,
          status: "installing",
        });
        itemCount++;
      }
    }

    return { units: unitCount, items: itemCount };
  },
});
