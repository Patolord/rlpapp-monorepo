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

export type StockHealthCounts = {
  critical: number;
  reorder: number;
  healthy: number;
  unconfigured: number;
};

/**
 * Saúde do estoque central (decisão 22): materiais ativos com política,
 * contados por estado de reposição (rótulos do web: Crítico · Repor · OK),
 * mais os saldos sem política. Usada no topo do Estoque central e no resumo
 * diário (aviso N13).
 */
export async function centralStockHealth(ctx: QueryCtx): Promise<StockHealthCounts> {
  const counts: StockHealthCounts = { critical: 0, reorder: 0, healthy: 0, unconfigured: 0 };
  const central = await ctx.db
    .query("inventoryLocations")
    .withIndex("by_type", (q) => q.eq("type", "central"))
    .first();
  if (!central) return counts;

  const policies = await ctx.db
    .query("inventoryStockPolicies")
    .withIndex("by_location", (q) => q.eq("locationId", central._id))
    .take(5000);
  const withPolicy = new Set<string>();
  for (const policy of policies) {
    const material = await ctx.db.get("materials", policy.materialId);
    if (!material?.active) continue;
    withPolicy.add(policy.materialId);
    const balance = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location_material", (q) =>
        q.eq("locationId", central._id).eq("materialId", policy.materialId)
      )
      .unique();
    const { state } = computeReplenishmentState(balance?.quantity ?? 0, policy);
    if (state === "below_minimum") counts.critical += 1;
    else if (state === "reorder") counts.reorder += 1;
    else counts.healthy += 1;
  }
  const balances = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_location", (q) => q.eq("locationId", central._id))
    .take(10000);
  counts.unconfigured = balances.filter((b) => !withPolicy.has(b.materialId)).length;
  return counts;
}

