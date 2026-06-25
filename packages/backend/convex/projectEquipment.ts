import { v } from "convex/values";
import { engineeringMutation } from "./lib/functions";
import { equipmentStatusValidator } from "./equipment";

const equipKindValidator = v.union(
  v.literal("condensadora"),
  v.literal("evaporadora")
);

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
    await ctx.db.patch("projectEquipment", args.itemId, {
      status: args.status,
      installedAt:
        args.status === "operational"
          ? item.installedAt ?? Date.now()
          : item.installedAt,
    });
    // Reflete no equipamento real vinculado, se houver.
    if (item.linkedEquipmentId) {
      await ctx.db.patch("equipment", item.linkedEquipmentId, {
        status: args.status,
      });
    }
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
    }
    await ctx.db.delete("projectEquipment", args.itemId);
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
    }

    await ctx.db.patch("projectEquipment", args.itemId, {
      linkedEquipmentId: args.equipmentId,
      status: "operational",
      installedAt: item.installedAt ?? Date.now(),
    });
    await ctx.db.patch("equipment", args.equipmentId, {
      projectEquipmentId: args.itemId,
    });
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
