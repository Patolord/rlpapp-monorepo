import { v } from "convex/values";
import { engineeringMutation } from "./lib/rbac";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));

function autoUnitLabel(floor: number, final: number): string {
  return `${floor}${String(final).padStart(2, "0")}`;
}

export const upsert = engineeringMutation({
  args: {
    // Quando ausente, cria; quando presente, atualiza.
    unitId: v.optional(v.id("projectUnits")),
    projectId: v.id("projects"),
    floor: v.number(),
    final: v.number(),
    label: v.optional(v.string()),
    type: unitTypeValidator,
    floorSpan: v.optional(v.number()),
    deadline: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("projectUnits"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");

    const floor = Math.floor(args.floor);
    const final = Math.max(1, Math.floor(args.final));
    const floorSpan = Math.max(1, Math.floor(args.floorSpan ?? 1));
    const label = args.label?.trim() || autoUnitLabel(floor, final);

    if (args.unitId) {
      const unit = await ctx.db.get("projectUnits", args.unitId);
      if (!unit) throw new Error("Apartamento não encontrado");
      await ctx.db.patch("projectUnits", args.unitId, {
        floor,
        final,
        label,
        type: args.type,
        floorSpan,
        deadline:
          args.deadline === null ? undefined : args.deadline ?? unit.deadline,
      });
      return args.unitId;
    }

    return await ctx.db.insert("projectUnits", {
      projectId: args.projectId,
      floor,
      final,
      label,
      type: args.type,
      floorSpan,
      deadline: args.deadline ?? undefined,
    });
  },
});

export const setDeadline = engineeringMutation({
  args: {
    unitId: v.id("projectUnits"),
    deadline: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("projectUnits", args.unitId);
    if (!unit) throw new Error("Apartamento não encontrado");
    await ctx.db.patch("projectUnits", args.unitId, {
      deadline: args.deadline ?? undefined,
    });
    return null;
  },
});

export const remove = engineeringMutation({
  args: { unitId: v.id("projectUnits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .collect();
    for (const item of items) {
      if (item.linkedEquipmentId) {
        await ctx.db.patch("equipment", item.linkedEquipmentId, {
          projectEquipmentId: undefined,
        });
      }
      await ctx.db.delete("projectEquipment", item._id);
    }
    await ctx.db.delete("projectUnits", args.unitId);
    return null;
  },
});
