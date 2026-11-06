import { v } from "convex/values";
import { obrasMutation, obrasQuery } from "./lib/rbac";
import { replicateFloor } from "./model/engineering/floorReplication";
import {
  createTowerFloors,
  listTowerFloors,
  removeFloor,
  updateFloor,
} from "./model/engineering/floors";

// Lista os andares de uma torre (ordenados do mais alto para o mais baixo).
export const listByTower = obrasQuery({
  args: { towerId: v.id("towers") },
  returns: v.array(
    v.object({
      _id: v.id("floors"),
      towerId: v.id("towers"),
      projectId: v.id("projects"),
      number: v.number(),
      label: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listTowerFloors(ctx, args.towerId);
  },
});

// Cria um ou mais andares numa torre.
export const create = obrasMutation({
  args: {
    towerId: v.id("towers"),
    floors: v.array(
      v.object({
        number: v.number(),
        label: v.optional(v.string()),
      })
    ),
  },
  returns: v.array(v.id("floors")),
  handler: async (ctx, args) => {
    return await createTowerFloors(ctx, ctx.user, args);
  },
});

export const update = obrasMutation({
  args: {
    floorId: v.id("floors"),
    label: v.optional(v.string()),
    number: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateFloor(ctx, args);
    return null;
  },
});

// Replica um andar típico para outros andares vazios da mesma obra
// (ambientes, sistemas novos e equipamentos planejados); ver `replicateFloor`.
export const replicate = obrasMutation({
  args: {
    sourceFloorId: v.id("floors"),
    targetFloorIds: v.array(v.id("floors")),
    renames: v.array(
      v.object({
        sourceEnvironmentId: v.id("environments"),
        targetFloorId: v.id("floors"),
        name: v.string(),
      })
    ),
  },
  returns: v.object({
    floors: v.number(),
    environments: v.number(),
    systems: v.number(),
    items: v.number(),
  }),
  handler: async (ctx, args) => {
    return await replicateFloor(ctx, ctx.user, args);
  },
});

export const remove = obrasMutation({
  args: { floorId: v.id("floors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeFloor(ctx, ctx.user, args.floorId);
    return null;
  },
});
