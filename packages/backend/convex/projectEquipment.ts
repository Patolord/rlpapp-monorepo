import { v } from "convex/values";
import {
  authedMutation,
  engineeringMutation,
  engineeringQuery,
} from "./lib/rbac";
import { equipmentStatusValidator } from "./equipment";
import { generateQrForItem, getBatchDestination } from "./qrCodes";
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
// denormalizado no campo `system`. O sistema é opcional: itens sem sistema são
// permitidos (exibem alerta na UI até serem atribuídos a um sistema).
// Diferente de `upsert`, que opera sobre o caminho legado de apartamentos.
export const upsertInEnvironment = engineeringMutation({
  args: {
    itemId: v.optional(v.id("projectEquipment")),
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
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

    let systemName = "";
    if (args.systemId) {
      const system = await ctx.db.get("systems", args.systemId);
      if (!system) throw new Error("Sistema não encontrado");
      if (system.projectId !== env.projectId) {
        throw new Error("O sistema não pertence à mesma obra do ambiente");
      }
      systemName = system.name;
    }

    const base = {
      system: systemName,
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

// Criação em massa de equipamentos planejados em vários ambientes de uma vez
// (painel de cadastro rápido). Para cada ambiente × item × qty insere um
// registro com os mesmos defaults de `upsertInEnvironment`. Opcionalmente gera
// um QR novo para cada item criado.
export const bulkAddToEnvironments = engineeringMutation({
  args: {
    environmentIds: v.array(v.id("environments")),
    systemId: v.optional(v.id("systems")),
    items: v.array(
      v.object({
        kind: equipKindValidator,
        qty: v.number(),
        modelo: v.optional(v.string()),
        capacidade: v.optional(v.string()),
      })
    ),
    generateQr: v.boolean(),
  },
  returns: v.object({
    created: v.number(),
    items: v.array(
      v.object({
        itemId: v.id("projectEquipment"),
        environmentId: v.id("environments"),
        token: v.union(v.string(), v.null()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    if (args.environmentIds.length === 0) {
      throw new Error("Selecione pelo menos um ambiente");
    }

    const totalPerEnv = args.items.reduce(
      (sum, item) => sum + Math.max(0, Math.floor(item.qty)),
      0
    );
    if (totalPerEnv === 0) {
      throw new Error("Informe a quantidade de equipamentos");
    }
    const total = totalPerEnv * args.environmentIds.length;
    if (total > 500) {
      throw new Error(
        `Limite de 500 equipamentos por operação excedido (${total})`
      );
    }

    // Carrega e valida os ambientes (todos da mesma obra, sem duplicatas).
    const envIds = Array.from(new Set(args.environmentIds));
    const environments = [];
    for (const envId of envIds) {
      const env = await ctx.db.get("environments", envId);
      if (!env) throw new Error("Ambiente não encontrado");
      environments.push(env);
    }
    const projectId = environments[0].projectId;
    if (environments.some((env) => env.projectId !== projectId)) {
      throw new Error("Todos os ambientes devem pertencer à mesma obra");
    }

    let systemName = "";
    if (args.systemId) {
      const system = await ctx.db.get("systems", args.systemId);
      if (!system) throw new Error("Sistema não encontrado");
      if (system.projectId !== projectId) {
        throw new Error("O sistema não pertence à mesma obra dos ambientes");
      }
      systemName = system.name;
    }

    const results: {
      itemId: Id<"projectEquipment">;
      environmentId: Id<"environments">;
      token: string | null;
    }[] = [];

    for (const env of environments) {
      for (const item of args.items) {
        const qty = Math.max(0, Math.floor(item.qty));
        for (let i = 0; i < qty; i++) {
          const itemId = await ctx.db.insert("projectEquipment", {
            projectId,
            environmentId: env._id,
            towerId: env.towerId,
            floorId: env.floorId,
            system: systemName,
            systemId: args.systemId,
            ambiente: env.name,
            kind: item.kind,
            modelo: item.modelo?.trim() ?? "",
            capacidade: item.capacidade?.trim() ?? "",
            status: "installing",
          });
          await logEquipmentHistory(ctx, ctx.user, {
            equipmentId: itemId,
            action: "created",
            newValue: systemName || "(sem sistema)",
          });

          let token: string | null = null;
          if (args.generateQr) {
            const inserted = await ctx.db.get("projectEquipment", itemId);
            if (inserted) {
              const qr = await generateQrForItem(ctx, ctx.user, inserted);
              token = qr.token;
            }
          }

          results.push({ itemId, environmentId: env._id, token });
        }
      }
    }

    return { created: results.length, items: results };
  },
});

// --- Pool de equipamentos não atribuídos (sem ambiente) ---

const unassignedItemValidator = v.object({
  _id: v.id("projectEquipment"),
  system: v.string(),
  systemId: v.union(v.id("systems"), v.null()),
  kind: equipKindValidator,
  modelo: v.string(),
  capacidade: v.string(),
  serialNumber: v.union(v.string(), v.null()),
  status: equipmentStatusValidator,
  deadline: v.union(v.number(), v.null()),
});

// Lista itens planejados da obra que ainda não estão em nenhum ambiente
// (pool de "não atribuídos" do painel lateral). Itens legados de apartamentos
// (unitId) ficam fora do pool.
export const listUnassigned = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(unassignedItemValidator),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return items
      .filter((item) => !item.environmentId && !item.unitId)
      .sort(
        (a, b) =>
          a.system.localeCompare(b.system) ||
          a.modelo.localeCompare(b.modelo) ||
          a._creationTime - b._creationTime
      )
      .map((item) => ({
        _id: item._id,
        system: item.system,
        systemId: item.systemId ?? null,
        kind: item.kind,
        modelo: item.modelo,
        capacidade: item.capacidade,
        serialNumber: item.serialNumber ?? null,
        status: item.status,
        deadline: item.deadline ?? null,
      }));
  },
});

// Cria um item planejado sem ambiente (vai para o pool de não atribuídos).
// Sistema é opcional: itens sem sistema exibem alerta na UI.
export const createUnassigned = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    systemId: v.optional(v.id("systems")),
    kind: equipKindValidator,
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectEquipment"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    let systemName = "";
    if (args.systemId) {
      const system = await ctx.db.get("systems", args.systemId);
      if (!system) throw new Error("Sistema não encontrado");
      if (system.projectId !== args.projectId) {
        throw new Error("O sistema não pertence a esta obra");
      }
      systemName = system.name;
    }

    const itemId = await ctx.db.insert("projectEquipment", {
      projectId: args.projectId,
      system: systemName,
      systemId: args.systemId,
      ambiente: "",
      kind: args.kind,
      modelo: args.modelo?.trim() ?? "",
      capacidade: args.capacidade?.trim() ?? "",
      serialNumber: args.serialNumber?.trim() || undefined,
      deadline: args.deadline === null ? undefined : args.deadline ?? undefined,
      status: "installing",
    });
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: itemId,
      action: "created",
      newValue: systemName || "(sem sistema)",
    });
    return itemId;
  },
});

// Atribui um item do pool de não atribuídos a um ambiente. Pode opcionalmente
// definir/alterar o sistema no mesmo passo; itens sem sistema continuam
// permitidos (alerta na UI).
export const assignToEnvironment = engineeringMutation({
  args: {
    itemId: v.id("projectEquipment"),
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("projectEquipment", args.itemId);
    if (!item) throw new Error("Equipamento não encontrado");

    const env = await ctx.db.get("environments", args.environmentId);
    if (!env) throw new Error("Ambiente não encontrado");
    if (env.projectId !== item.projectId) {
      throw new Error("O ambiente não pertence à mesma obra do equipamento");
    }

    const systemId = args.systemId ?? item.systemId;
    let systemName = item.system;
    if (args.systemId) {
      const system = await ctx.db.get("systems", args.systemId);
      if (!system) throw new Error("Sistema não encontrado");
      if (system.projectId !== item.projectId) {
        throw new Error("O sistema não pertence a esta obra");
      }
      systemName = system.name;
    }

    await ctx.db.patch("projectEquipment", args.itemId, {
      environmentId: args.environmentId,
      towerId: env.towerId,
      floorId: env.floorId,
      ambiente: item.ambiente.trim() || env.name,
      system: systemName,
      systemId,
    });
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.itemId,
      action: "assigned",
      newValue: env.name,
    });
    return null;
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

// Cria um item planejado diretamente a partir de um equipamento já cadastrado
// pelo técnico (QR + equipment sem item planejado), em um passo único: insere
// o projectEquipment no ambiente/sistema e vincula o equipamento existente,
// preservando descrição/fotos do cadastro de campo. Não força "operational"
// (atribuir à obra não significa instalado).
export const createFromRegisteredEquipment = engineeringMutation({
  args: {
    environmentId: v.id("environments"),
    systemId: v.optional(v.id("systems")),
    kind: equipKindValidator,
    equipmentId: v.optional(v.id("equipment")),
    token: v.optional(v.string()),
    modelo: v.optional(v.string()),
    capacidade: v.optional(v.string()),
  },
  returns: v.object({
    itemId: v.id("projectEquipment"),
    token: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const env = await ctx.db.get("environments", args.environmentId);
    if (!env) throw new Error("Ambiente não encontrado");

    let systemName = "";
    if (args.systemId) {
      const system = await ctx.db.get("systems", args.systemId);
      if (!system) throw new Error("Sistema não encontrado");
      if (system.projectId !== env.projectId) {
        throw new Error("O sistema não pertence à mesma obra do ambiente");
      }
      systemName = system.name;
    }

    // Resolve o equipamento cadastrado: por id direto ou pelo token bipado.
    let equipment = null;
    let qrCode = null;
    if (args.token) {
      const token = args.token.trim().toUpperCase();
      if (!token) throw new Error("Informe o token do QR");
      qrCode = await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (!qrCode) throw new Error(`QR "${token}" não encontrado`);
      if (qrCode.status !== "active") {
        throw new Error(`QR "${token}" está inativo`);
      }
      if (!qrCode.equipmentId) {
        throw new Error(
          `QR "${token}" ainda não foi cadastrado pelo técnico`
        );
      }
      equipment = await ctx.db.get("equipment", qrCode.equipmentId);
    } else if (args.equipmentId) {
      equipment = await ctx.db.get("equipment", args.equipmentId);
      if (equipment) {
        qrCode = await ctx.db
          .query("qrCodes")
          .withIndex("by_equipment", (q) => q.eq("equipmentId", equipment!._id))
          .order("desc")
          .first();
      }
    } else {
      throw new Error("Informe o token do QR ou o equipamento");
    }

    if (!equipment) throw new Error("Equipamento não encontrado");
    if (equipment.projectEquipmentId) {
      throw new Error("Este equipamento já está vinculado a um item da obra");
    }

    // Se o lote da etiqueta tem obra de destino, valida contra a obra do ambiente.
    if (qrCode) {
      const destination = await getBatchDestination(ctx, qrCode.batchId);
      if (destination && destination.projectId !== env.projectId) {
        throw new Error(
          `QR "${qrCode.token}" pertence ao lote destinado à obra "${destination.projectName}"`
        );
      }
    }

    const itemId = await ctx.db.insert("projectEquipment", {
      projectId: env.projectId,
      environmentId: args.environmentId,
      towerId: env.towerId,
      floorId: env.floorId,
      system: systemName,
      systemId: args.systemId,
      ambiente: env.name,
      kind: args.kind,
      modelo: args.modelo?.trim() ?? "",
      capacidade: args.capacidade?.trim() ?? "",
      status: equipment.status,
      linkedEquipmentId: equipment._id,
    });
    await ctx.db.patch("equipment", equipment._id, {
      projectEquipmentId: itemId,
    });
    await syncQrProjectId(ctx, equipment._id, env.projectId);

    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: itemId,
      action: "created",
      newValue: systemName || "(sem sistema)",
    });
    if (qrCode) {
      await logEquipmentHistory(ctx, ctx.user, {
        equipmentId: itemId,
        action: "qr_linked",
        newValue: qrCode.token,
      });
    }

    return { itemId, token: qrCode?.token ?? null };
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
