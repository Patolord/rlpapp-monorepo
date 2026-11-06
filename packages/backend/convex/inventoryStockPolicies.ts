import { v } from "convex/values";
import {
  inventoryMutation,
  inventoryQuery,
  materiaisMutation,
  staffMutation,
} from "./lib/rbac";
import { inventoryLocationType } from "./schema/inventory";
import {
  ensureCentralStockLocation,
  getStockPolicyRow,
  listStockPoliciesForMaterial,
  listVisibleStockLocations,
  saveStockPolicy,
} from "./model/inventory/stockPolicy";

const stockPolicyRowValidator = v.object({
  _id: v.id("inventoryStockPolicies"),
  locationId: v.id("inventoryLocations"),
  locationName: v.string(),
  materialId: v.id("materials"),
  minimumQuantity: v.number(),
  reorderPoint: v.number(),
  targetQuantity: v.number(),
  leadTimeDays: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

export const listLocations = inventoryQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("inventoryLocations"),
      name: v.string(),
      type: inventoryLocationType,
      projectId: v.union(v.id("projects"), v.null()),
    })
  ),
  handler: async (ctx) => await listVisibleStockLocations(ctx, ctx.user),
});

/** Garante que o estoque central exista antes de configurar políticas. */
export const ensureCentralLocation = staffMutation({
  args: {},
  returns: v.id("inventoryLocations"),
  handler: async (ctx) => await ensureCentralStockLocation(ctx, ctx.user),
});

export const listForMaterial = inventoryQuery({
  args: { materialId: v.id("materials") },
  returns: v.array(stockPolicyRowValidator),
  handler: async (ctx, args) =>
    await listStockPoliciesForMaterial(ctx, ctx.user, args.materialId),
});

export const getForLocation = inventoryQuery({
  args: {
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
  },
  returns: v.union(stockPolicyRowValidator, v.null()),
  handler: async (ctx, args) =>
    await getStockPolicyRow(ctx, ctx.user, {
      locationId: args.locationId,
      materialId: args.materialId,
    }),
});

export const upsert = materiaisMutation({
  args: {
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    minimumQuantity: v.number(),
    reorderPoint: v.number(),
    targetQuantity: v.number(),
    leadTimeDays: v.optional(v.number()),
  },
  returns: v.id("inventoryStockPolicies"),
  handler: async (ctx, args) => await saveStockPolicy(ctx, ctx.user, args),
});

export const upsertFromWarehouse = inventoryMutation({
  args: {
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    minimumQuantity: v.number(),
    reorderPoint: v.number(),
    targetQuantity: v.number(),
    leadTimeDays: v.optional(v.number()),
  },
  returns: v.id("inventoryStockPolicies"),
  handler: async (ctx, args) => await saveStockPolicy(ctx, ctx.user, args),
});
