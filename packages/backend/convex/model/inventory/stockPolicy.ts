import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { hasPermission } from "../../lib/rbac";
import {
  computeReplenishmentState,
  validateStockPolicyQuantities,
} from "../procurement/catalog";
import { getOrCreateCentralLocation } from "./locations";

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
  return hasPermission(user, "estoque.central.read");
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

// ---------------------------------------------------------------------------
// Tela de políticas (`convex/inventoryStockPolicies.ts`)
// ---------------------------------------------------------------------------

const MANAGE_POLICY_DENIED =
  "Apenas Compras, Estoque ou administradores podem configurar políticas";

function toStockPolicyRow(
  policy: Doc<"inventoryStockPolicies">,
  location: Doc<"inventoryLocations">
) {
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
}

/** Locais ativos que o usuário enxerga (o central só com `estoque.central.read`). */
export async function listVisibleStockLocations(ctx: QueryCtx, user: Doc<"users">) {
  const canViewCentral = canViewCentralInventory(user);
  const locations = await ctx.db.query("inventoryLocations").collect();
  return locations
    .filter((location) => location.active)
    .filter((location) => canViewCentral || location.type !== "central")
    .map((location) => ({
      _id: location._id,
      name: location.name,
      type: location.type,
      projectId: location.projectId ?? null,
    }));
}

/** Garante que o estoque central exista antes de configurar políticas. */
export async function ensureCentralStockLocation(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<Id<"inventoryLocations">> {
  if (!canManageStockPolicy(user)) {
    throw new Error(MANAGE_POLICY_DENIED);
  }
  const location = await getOrCreateCentralLocation(ctx);
  return location._id;
}

/** Políticas de um material nos locais que o usuário enxerga. */
export async function listStockPoliciesForMaterial(
  ctx: QueryCtx,
  user: Doc<"users">,
  materialId: Id<"materials">
) {
  const canViewCentral = canViewCentralInventory(user);
  const policies = await ctx.db
    .query("inventoryStockPolicies")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .collect();

  const rows = await Promise.all(
    policies.map(async (policy) => {
      const location = await ctx.db.get("inventoryLocations", policy.locationId);
      if (!location) return null;
      if (!canViewCentral && location.type === "central") return null;
      return toStockPolicyRow(policy, location);
    })
  );
  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}

/** Política de um material num local; o central exige `estoque.central.read`. */
export async function getStockPolicyRow(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { locationId: Id<"inventoryLocations">; materialId: Id<"materials"> }
) {
  const location = await ctx.db.get("inventoryLocations", input.locationId);
  if (!location) return null;
  if (location.type === "central" && !canViewCentralInventory(user)) {
    throw new Error("A Engenharia só pode consultar estoques de obras");
  }
  const policy = await getStockPolicy(ctx, input.locationId, input.materialId);
  if (!policy) return null;
  return toStockPolicyRow(policy, location);
}

/** Cria ou atualiza a política (Compras, Estoque ou admin), com registro na auditoria. */
export async function saveStockPolicy(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Parameters<typeof upsertStockPolicyInternal>[2]
): Promise<Id<"inventoryStockPolicies">> {
  if (!canManageStockPolicy(user)) {
    throw new Error(MANAGE_POLICY_DENIED);
  }
  const policyId = await upsertStockPolicyInternal(ctx, user, input);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "inventoryStockPolicies",
    recordId: policyId,
  });
  return policyId;
}

export type StockHealthCounts = {
  critical: number;
  reorder: number;
  healthy: number;
  unconfigured: number;
};

/**
 * Saúde do estoque central: materiais ativos com política, contados por estado
 * de reposição (rótulos do web: Crítico · Repor · OK), mais os saldos sem
 * política. Usada no topo do Estoque central e no resumo diário (aviso N13).
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

/** Contagens do topo do Estoque central, para quem enxerga o central. */
export async function getCentralStockHealth(
  ctx: QueryCtx,
  user: Doc<"users">
): Promise<StockHealthCounts> {
  if (!canViewCentralInventory(user)) {
    throw new Error("A Engenharia só pode consultar estoques de obras");
  }
  return await centralStockHealth(ctx);
}
