import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { findInventoryLocation } from "./locations";
import {
  canViewCentralInventory,
  enrichBalanceWithReplenishment,
} from "./stockPolicy";
import type { legacyInventoryEventType } from "./validators";

/**
 * Saldos e histórico de eventos de um estoque (central ou de obra), o adaptador
 * do histórico para a tela nativa antiga e o endereço físico no central.
 */

export type ListInventoryLocationPageInput = {
  projectId?: Id<"projects">;
  paginationOpts: PaginationOptions;
};

export type ListInventoryBalancesInput = ListInventoryLocationPageInput & {
  /** Busca no estoque inteiro por nome, SKU ou variação; vem numa página só. */
  search?: string;
};

const BALANCE_SEARCH_LIMIT = 50;

export type ListLegacyInventoryEventsInput = {
  type?: Infer<typeof legacyInventoryEventType>;
  limit?: number;
};

export type UpdateInventoryAddressInput = {
  balanceId: Id<"inventoryBalances">;
  physicalAddress: string;
};

function assertCanViewLocation(
  user: Doc<"users">,
  projectId: Id<"projects"> | undefined
): void {
  if (!projectId && !canViewCentralInventory(user)) {
    throw new Error("A Engenharia só pode consultar estoques de obras");
  }
}

export async function listInventoryBalances(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: ListInventoryBalancesInput
) {
  assertCanViewLocation(user, input.projectId);
  const location = await findInventoryLocation(ctx, input.projectId);
  if (!location) {
    return { page: [], isDone: true, continueCursor: "" };
  }
  const search = input.search?.trim();
  let results: PaginationResult<Doc<"inventoryBalances">>;
  if (search) {
    const materials = await ctx.db
      .query("materials")
      .withSearchIndex("search_text", (q) => q.search("searchText", search))
      .take(BALANCE_SEARCH_LIMIT);
    const page: Doc<"inventoryBalances">[] = [];
    for (const material of materials) {
      const balance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q.eq("locationId", location._id).eq("materialId", material._id)
        )
        .unique();
      if (balance) page.push(balance);
    }
    results = { page, isDone: true, continueCursor: "" };
  } else {
    results = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location", (q) => q.eq("locationId", location._id))
      .paginate(input.paginationOpts);
  }
  return {
    ...results,
    page: await Promise.all(
      results.page.map(async (balance) => {
        const material = await ctx.db.get(
          "materials",
          balance.materialId
        );
        const replenishment = await enrichBalanceWithReplenishment(
          ctx,
          balance,
          material
        );
        return {
          _id: balance._id,
          locationId: location._id,
          locationName: location.name,
          materialId: balance.materialId,
          materialName: material?.name ?? "Material removido",
          variantLabel: material?.variantLabel ?? null,
          materialSku: replenishment.materialSku,
          category: material?.category ?? null,
          unit: material?.unit ?? null,
          quantity: balance.quantity,
          physicalAddress: balance.physicalAddress ?? null,
          replenishmentState: replenishment.replenishmentState,
          suggestedOrderQuantity: replenishment.suggestedOrderQuantity,
          minimumQuantity: replenishment.minimumQuantity,
          reorderPoint: replenishment.reorderPoint,
          targetQuantity: replenishment.targetQuantity,
          leadTimeDays: replenishment.leadTimeDays,
          updatedAt: balance.updatedAt,
        };
      })
    ),
  };
}

export async function listInventoryEventsPage(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: ListInventoryLocationPageInput
) {
  assertCanViewLocation(user, input.projectId);
  const location = await findInventoryLocation(ctx, input.projectId);
  if (!location) {
    return { page: [], isDone: true, continueCursor: "" };
  }
  const results = await ctx.db
    .query("inventoryEvents")
    .withIndex("by_location", (q) => q.eq("locationId", location._id))
    .order("desc")
    .paginate(input.paginationOpts);
  return {
    ...results,
    page: await Promise.all(
      results.page.map(async (event) => {
        const material = await ctx.db.get("materials", event.materialId);
        return {
          _id: event._id,
          type: event.type,
          documentId: event.documentId,
          materialId: event.materialId,
          materialName: material?.name ?? "Material removido",
          unit: material?.unit ?? null,
          locationName: location.name,
          quantityDelta: event.quantityDelta,
          createdAt: event.createdAt,
        };
      })
    ),
  };
}

/**
 * Compatibilidade com a tela nativa existente: histórico global do central,
 * limitado a 200 eventos. O web usa `listInventoryEventsPage` (por obra).
 */
export async function listLegacyInventoryEvents(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: ListLegacyInventoryEventsInput
) {
  // Legacy/nativo: histórico global do central. Obra → listEventsPaginated + projectId.
  if (!canViewCentralInventory(user)) {
    throw new Error("A Engenharia só pode consultar estoques de obras");
  }
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), 200);
  const events = await ctx.db
    .query("inventoryEvents")
    .order("desc")
    .take(limit);
  const rows = await Promise.all(
    events.map(async (event) => {
      const [material, document] = await Promise.all([
        ctx.db.get("materials", event.materialId),
        ctx.db.get("inventoryDocuments", event.documentId),
      ]);
      const type =
        event.type === "in"
          ? ("RegisteredIn" as const)
          : event.type === "out"
            ? ("RegisteredOut" as const)
            : event.type === "adjustment"
              ? ("InventoryAdjust" as const)
              : ("Reversal" as const);
      const refType =
        document?.type === "entry"
          ? ("receipt" as const)
          : document?.type === "adjustment"
            ? ("adjustment" as const)
            : ("shipment" as const);
      return {
        _id: event._id,
        type,
        qtyDelta: event.quantityDelta,
        product: material
          ? { name: material.name, unit: material.unit ?? null }
          : null,
        refType,
        refId: event.documentId,
        createdAt: event.createdAt,
      };
    })
  );
  return input.type ? rows.filter((row) => row.type === input.type) : rows;
}

export async function updateInventoryAddress(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateInventoryAddressInput
): Promise<void> {
  const balance = await ctx.db.get("inventoryBalances", input.balanceId);
  if (!balance) throw new Error("Saldo não encontrado");
  const location = await ctx.db.get(
    "inventoryLocations",
    balance.locationId
  );
  if (!location || location.type !== "central") {
    throw new Error("O endereço físico só pode ser definido no estoque central");
  }
  const physicalAddress = input.physicalAddress.trim();
  await ctx.db.patch("inventoryBalances", input.balanceId, {
    physicalAddress: physicalAddress || undefined,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update_address",
    tableName: "inventoryBalances",
    recordId: input.balanceId,
    details: physicalAddress,
  });
}
