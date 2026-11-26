import { v } from "convex/values";
import {
  obrasMutation,
} from "./lib/rbac";
import {
  removeProjectUnit,
  upsertProjectUnit,
} from "./model/engineering/projectUnitEquipment";
import { notFound } from "./lib/domainErrors";

const unitTypeValidator = v.union(v.literal("vrf"), v.literal("split"));

export const upsert = obrasMutation({
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
    return await upsertProjectUnit(ctx, args);
  },
});

export const setDeadline = obrasMutation({
  args: {
    unitId: v.id("projectUnits"),
    deadline: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const unit = await ctx.db.get("projectUnits", args.unitId);
    if (!unit) throw notFound("Apartamento não encontrado");
    await ctx.db.patch("projectUnits", args.unitId, {
      deadline: args.deadline ?? undefined,
    });
    return null;
  },
});

export const remove = obrasMutation({
  args: { unitId: v.id("projectUnits") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeProjectUnit(ctx, args.unitId);
    return null;
  },
});
