import { v } from "convex/values";
import {
  inventoryMutation,
  inventoryQuery,
  purchasingMutation,
  staffMutation,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { inventoryLocationType } from "./schema";
import {
  canManageStockPolicy,
  canViewCentralInventory,
  getStockPolicy,
  upsertStockPolicyInternal,
} from "./lib/inventory/stockPolicy";
import { getOrCreateCentralLocation } from "./lib/inventory/operations";

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
  handler: async (ctx) => {
    const canViewCentral = canViewCentralInventory(ctx.user);
    const locations = await ctx.db.query("inventoryLocations").collect();
    return locations
      .filter((location) => location.active)
      .filter(
        (location) =>
          canViewCentral ||
          location.type !== "central"
      )
      .map((location) => ({
        _id: location._id,
        name: location.name,
        type: location.type,
        projectId: location.projectId ?? null,
      }));
  },
});

/** Garante que o estoque central exista antes de configurar políticas. */
export const ensureCentralLocation = staffMutation({
  args: {},
  returns: v.id("inventoryLocations"),
  handler: async (ctx) => {
    if (!canManageStockPolicy(ctx.user)) {
      throw new Error(
        "Apenas Compras, Estoque ou administradores podem configurar políticas"
      );
    }
    const location = await getOrCreateCentralLocation(ctx);
    return location._id;
  },
});

export const listForMaterial = inventoryQuery({
  args: { materialId: v.id("materials") },
  returns: v.array(stockPolicyRowValidator),
  handler: async (ctx, args) => {
    const canViewCentral = canViewCentralInventory(ctx.user);
    const policies = await ctx.db
      .query("inventoryStockPolicies")
      .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
      .collect();

    const rows = await Promise.all(
      policies.map(async (policy) => {
        const location = await ctx.db.get(
          "inventoryLocations",
          policy.locationId
        );
        if (!location) return null;
        if (!canViewCentral && location.type === "central") return null;
        return {
          _id: policy._id,
          locationId: policy.locationId,
          locationName: location.name,
          materialId: policy.materialId,
          minimumQuantity: policy.minimumQuantity,
          reorderPoint: policy.reorderPoint,
          targetQuantity: policy.targetQuantity,
          leadTimeDays: policy.leadTimeDays ?? null,
          updatedAt: policy.updatedAt,
        };
      })
    );
    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

export const getForLocation = inventoryQuery({
  args: {
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
  },
  returns: v.union(stockPolicyRowValidator, v.null()),
  handler: async (ctx, args) => {
    const location = await ctx.db.get("inventoryLocations", args.locationId);
    if (!location) return null;
    if (
      location.type === "central" &&
      !canViewCentralInventory(ctx.user)
    ) {
      throw new Error("A Engenharia só pode consultar estoques de obras");
    }
    const policy = await getStockPolicy(
      ctx,
      args.locationId,
      args.materialId
    );
    if (!policy) return null;
    return {
      _id: policy._id,
      locationId: policy.locationId,
      locationName: location.name,
      materialId: policy.materialId,
      minimumQuantity: policy.minimumQuantity,
      reorderPoint: policy.reorderPoint,
      targetQuantity: policy.targetQuantity,
      leadTimeDays: policy.leadTimeDays ?? null,
      updatedAt: policy.updatedAt,
    };
  },
});

export const upsert = purchasingMutation({
  args: {
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    minimumQuantity: v.number(),
    reorderPoint: v.number(),
    targetQuantity: v.number(),
    leadTimeDays: v.optional(v.number()),
  },
  returns: v.id("inventoryStockPolicies"),
  handler: async (ctx, args) => {
    if (!canManageStockPolicy(ctx.user)) {
      throw new Error("Apenas Compras, Estoque ou administradores podem configurar políticas");
    }
    const policyId = await upsertStockPolicyInternal(ctx, ctx.user, args);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "inventoryStockPolicies",
      recordId: policyId,
    });
    return policyId;
  },
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
  handler: async (ctx, args) => {
    if (!canManageStockPolicy(ctx.user)) {
      throw new Error("Apenas Compras, Estoque ou administradores podem configurar políticas");
    }
    const policyId = await upsertStockPolicyInternal(ctx, ctx.user, args);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "inventoryStockPolicies",
      recordId: policyId,
    });
    return policyId;
  },
});
