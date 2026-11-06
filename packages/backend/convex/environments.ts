import { v } from "convex/values";
import {
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import {
  createEnvironment,
  removeEnvironment,
  updateEnvironment,
} from "./model/engineering/buildingStructure";

/** Segmento extra de um ambiente não-retangular (posições relativas). */
const segmentValidator = v.object({
  colOffset: v.number(),
  colSpan: v.optional(v.number()),
  rowOffset: v.optional(v.number()),
  rowSpan: v.optional(v.number()),
});

// Lista os ambientes de um andar (ordenados).
export const listByFloor = obrasQuery({
  args: { floorId: v.id("floors") },
  returns: v.array(
    v.object({
      _id: v.id("environments"),
      floorId: v.id("floors"),
      towerId: v.id("towers"),
      projectId: v.id("projects"),
      name: v.string(),
      type: v.union(v.string(), v.null()),
      order: v.number(),
      col: v.union(v.number(), v.null()),
      colSpan: v.union(v.number(), v.null()),
      rowSpan: v.union(v.number(), v.null()),
      segments: v.union(v.array(segmentValidator), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", args.floorId))
      .collect();
    return environments
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        _id: e._id,
        floorId: e.floorId,
        towerId: e.towerId,
        projectId: e.projectId,
        name: e.name,
        type: e.type ?? null,
        order: e.order,
        col: e.col ?? null,
        colSpan: e.colSpan ?? null,
        rowSpan: e.rowSpan ?? null,
        segments: e.segments ?? null,
        createdAt: e.createdAt,
      }));
  },
});

export const create = obrasMutation({
  args: {
    floorId: v.id("floors"),
    name: v.string(),
    type: v.optional(v.string()),
    order: v.optional(v.number()),
    col: v.optional(v.number()),
    colSpan: v.optional(v.number()),
    rowSpan: v.optional(v.number()),
    segments: v.optional(v.array(segmentValidator)),
  },
  returns: v.id("environments"),
  handler: async (ctx, args) => {
    return await createEnvironment(ctx, ctx.user, args);
  },
});

export const update = obrasMutation({
  args: {
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    type: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
    // null limpa o campo (volta ao padrão de auto-posicionamento).
    col: v.optional(v.union(v.number(), v.null())),
    colSpan: v.optional(v.union(v.number(), v.null())),
    rowSpan: v.optional(v.union(v.number(), v.null())),
    segments: v.optional(v.union(v.array(segmentValidator), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateEnvironment(ctx, args);
    return null;
  },
});

export const remove = obrasMutation({
  args: { environmentId: v.id("environments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeEnvironment(ctx, ctx.user, args.environmentId);
    return null;
  },
});
