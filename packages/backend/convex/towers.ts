import { v } from "convex/values";
import {
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import {
  createTower,
  duplicateTower,
  listTowersWithFloorCounts,
  removeTower,
  updateTower,
} from "./model/engineering/buildingStructure";

// Lista as torres de uma obra, ordenadas.
export const list = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("towers"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      name: v.string(),
      order: v.number(),
      createdAt: v.number(),
      floorCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listTowersWithFloorCounts(ctx, args.projectId);
  },
});

export const create = obrasMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    order: v.optional(v.number()),
  },
  returns: v.id("towers"),
  handler: async (ctx, args) => await createTower(ctx, ctx.user, args),
});

export const update = obrasMutation({
  args: {
    towerId: v.id("towers"),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateTower(ctx, ctx.user, args);
    return null;
  },
});

// Remove uma torre em cascata: andares, ambientes e equipamentos vinculados.
export const remove = obrasMutation({
  args: { towerId: v.id("towers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeTower(ctx, ctx.user, args.towerId);
    return null;
  },
});

// Duplica uma torre com todos os andares, ambientes e equipamentos planejados.
export const duplicate = obrasMutation({
  args: {
    towerId: v.id("towers"),
    name: v.optional(v.string()),
  },
  returns: v.id("towers"),
  handler: async (ctx, args) => {
    return await duplicateTower(ctx, ctx.user, args);
  },
});
