import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  computeReplenishmentState,
  validateStockPolicyQuantities,
} from "../compras/catalog";

export { computeReplenishmentState, validateStockPolicyQuantities };

export async function getStockPolicy(
  ctx: QueryCtx | MutationCtx,
  locationId: Id<"inventoryLocations">,
  materialId: Id<"materials">
): Promise<Doc<"inventoryStockPolicies"> | null> {
  return await ctx.db
    .query("inventoryStockPolicies")
    .withIndex("by_location_material", (q) =>
      q.eq("locationId", locationId).eq("materialId", materialId)
    )
    .unique();
}

export async function enrichBalanceWithReplenishment(
  ctx: QueryCtx,
  balance: Doc<"inventoryBalances">,
  material: Doc<"materials"> | null
) {
  const policy = await getStockPolicy(ctx, balance.locationId, balance.materialId);
  const replenishment = computeReplenishmentState(balance.quantity, policy);
  return {
    materialSku: material?.sku ?? null,
    replenishmentState: replenishment.state,
    suggestedOrderQuantity: replenishment.suggestedOrderQuantity,
    minimumQuantity: policy?.minimumQuantity ?? null,
    reorderPoint: policy?.reorderPoint ?? null,
    targetQuantity: policy?.targetQuantity ?? null,
    leadTimeDays: policy?.leadTimeDays ?? null,
  };
}

/** Estoque Central: Estoque, Compras, admin e diretor. Engenharia só vê obras. */
export function canViewCentralInventory(user: Doc<"users">): boolean {
  if (user.role === "director" || user.role === "admin") return true;
  return user.department === "compras" || user.department === "estoque";
}

export function canManageStockPolicy(user: Doc<"users">): boolean {
  return canViewCentralInventory(user);
}

export async function upsertStockPolicyInternal(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    locationId: Id<"inventoryLocations">;
    materialId: Id<"materials">;
    minimumQuantity: number;
    reorderPoint: number;
    targetQuantity: number;
    leadTimeDays?: number;
  }
): Promise<Id<"inventoryStockPolicies">> {
  validateStockPolicyQuantities(args);

  const location = await ctx.db.get("inventoryLocations", args.locationId);
  if (!location) throw new Error("Local de estoque não encontrado");

  const material = await ctx.db.get("materials", args.materialId);
  if (!material) throw new Error("Material não encontrado");

  const now = Date.now();
  const existing = await getStockPolicy(
    ctx,
    args.locationId,
    args.materialId
  );

  if (existing) {
    await ctx.db.patch("inventoryStockPolicies", existing._id, {
      minimumQuantity: args.minimumQuantity,
      reorderPoint: args.reorderPoint,
      targetQuantity: args.targetQuantity,
      leadTimeDays: args.leadTimeDays,
      updatedAt: now,
      updatedByUserId: user._id,
    });
    return existing._id;
  }

  return await ctx.db.insert("inventoryStockPolicies", {
    locationId: args.locationId,
    materialId: args.materialId,
    minimumQuantity: args.minimumQuantity,
    reorderPoint: args.reorderPoint,
    targetQuantity: args.targetQuantity,
    leadTimeDays: args.leadTimeDays,
    updatedAt: now,
    updatedByUserId: user._id,
  });
}
