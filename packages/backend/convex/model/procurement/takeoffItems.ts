import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { takeoffItemStatus } from "../../schema/procurement";
import { sanitizeDimensions, type MaterialDimensions } from "./catalog";
import { computePriceChange } from "./priceHistory";
import { isUsablePriceEvent } from "./priceSelection";
import {
  normalizeText,
  priceFreshness,
  suggestedUnitPriceCents,
} from "./pricing";
import { promoteTakeoffItem } from "./takeoffPromotion";

/** Linhas de um takeoff: visão com preços e cotações, e a edição manual. */

async function resolveItemQuotes(
  ctx: { db: QueryCtx["db"] },
  item: {
    _id: Id<"takeoffItems">;
    estimatedUnitPriceCents?: number;
    updatedAt?: number;
    createdAt: number;
  }
) {
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_takeoff_item", (q) => q.eq("takeoffItemId", item._id))
    .collect();
  const out = [];
  for (const event of events) {
    if (!isUsablePriceEvent(event)) continue;
    let supplierName = event.supplierNameRaw ?? "Fornecedor";
    if (event.supplierId) {
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      if (supplier) supplierName = supplier.name;
    }
    out.push({
      _id: event._id,
      supplierId: event.supplierId ?? null,
      supplierName,
      unitPriceCents: event.unitPriceCents,
      unit: event.unit ?? null,
      occurredAt: event.occurredAt,
      validUntil: event.validUntil ?? null,
      source: event.source,
      versusEstimate:
        item.estimatedUnitPriceCents !== undefined
          ? computePriceChange(event, {
              unitPriceCents: item.estimatedUnitPriceCents,
              occurredAt: item.updatedAt ?? item.createdAt,
            })
          : null,
    });
  }
  return out.sort((a, b) => b.occurredAt - a.occurredAt);
}

/**
 * Leituras de preço reaproveitadas entre as linhas de um mesmo takeoff:
 * orçamentos do desktop têm centenas de linhas, e a busca por descrição (sem
 * material) lê os eventos recentes uma vez só.
 */
export type PriceLookupCache = {
  recent?: Doc<"priceEvents">[];
  byMaterial?: Map<string, Doc<"priceEvents">[]>;
};

async function resolveLatestPrices(
  ctx: { db: QueryCtx["db"] },
  params: {
    materialId?: Id<"materials">;
    rawDescription: string;
    now: number;
  },
  cache: PriceLookupCache = {}
) {
  const materialId = params.materialId;
  let events: Doc<"priceEvents">[] = [];
  if (materialId) {
    cache.byMaterial ??= new Map();
    const cached = cache.byMaterial.get(materialId);
    if (cached) {
      events = cached;
    } else {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", materialId))
        .order("desc")
        .take(50);
      cache.byMaterial.set(materialId, events);
    }
  }

  let filtered = events.filter(
    (e) => e.reviewStatus !== "ignored" && e.reviewStatus !== "duplicate"
  );

  if (filtered.length === 0 && params.rawDescription.trim()) {
    const term = normalizeText(params.rawDescription);
    cache.recent ??= await ctx.db
      .query("priceEvents")
      .order("desc")
      .take(200);
    const all = cache.recent;
    filtered = all.filter(
      (e) =>
        e.reviewStatus !== "ignored" &&
        e.reviewStatus !== "duplicate" &&
        e.rawDescription &&
        normalizeText(e.rawDescription).includes(term)
    );
  }

  const bySupplier = new Map<string, (typeof filtered)[number]>();
  for (const event of filtered) {
    const key = event.supplierId ?? event.supplierNameRaw ?? event._id;
    if (!bySupplier.has(key)) bySupplier.set(key, event);
  }

  const results = [];
  for (const event of bySupplier.values()) {
    let supplierName = event.supplierNameRaw ?? "Fornecedor";
    if (event.supplierId) {
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      if (supplier) supplierName = supplier.name;
    }
    const freshness = priceFreshness(event.occurredAt, params.now);
    results.push({
      supplierId: event.supplierId ?? null,
      supplierName,
      unitPriceCents: event.unitPriceCents,
      unit: event.unit ?? null,
      occurredAt: event.occurredAt,
      source: event.source,
      freshness,
      suggestedUnitPriceCents: suggestedUnitPriceCents(
        event.unitPriceCents,
        freshness
      ),
    });
  }

  return results.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 5);
}

function itemWarnings(item: {
  materialId?: Id<"materials">;
  unit?: string;
  estimatedUnitPriceCents?: number;
}): string[] {
  const warnings: string[] = [];
  if (!item.materialId) warnings.push("Sem material vinculado");
  if (!item.unit?.trim()) warnings.push("Unidade ausente");
  if (item.estimatedUnitPriceCents === undefined) {
    warnings.push("Sem preço estimado");
  }
  return warnings;
}

/** Linha como a tela do takeoff a mostra: material, avisos, preços e cotações. */
export async function toTakeoffItemView(
  ctx: { db: QueryCtx["db"] },
  item: Doc<"takeoffItems">,
  now: number,
  priceCache: PriceLookupCache
) {
  let materialName: string | null = null;
  if (item.materialId) {
    const material = await ctx.db.get("materials", item.materialId);
    materialName = material?.name ?? null;
  }
  const [latestPrices, quotes] = await Promise.all([
    resolveLatestPrices(
      ctx,
      {
        materialId: item.materialId,
        rawDescription: item.rawDescription,
        now,
      },
      priceCache
    ),
    resolveItemQuotes(ctx, item),
  ]);
  return {
    _id: item._id,
    _creationTime: item._creationTime,
    takeoffId: item.takeoffId,
    projectId: item.projectId ?? null,
    rawDescription: item.rawDescription,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    materialId: item.materialId ?? null,
    materialName,
    customDimensions: item.customDimensions ?? null,
    customSpecification: item.customSpecification ?? null,
    estimatedUnitPriceCents: item.estimatedUnitPriceCents ?? null,
    notes: item.notes ?? null,
    status: item.status ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? null,
    externalLineId: item.externalLineId ?? null,
    sheet: item.sheet ?? null,
    section: item.section ?? null,
    laborUnitPriceCents: item.laborUnitPriceCents ?? null,
    materialTotalCents: item.materialTotalCents ?? null,
    laborTotalCents: item.laborTotalCents ?? null,
    sortOrder: item.sortOrder ?? null,
    externalRemovedAt: item.externalRemovedAt ?? null,
    warnings: itemWarnings(item),
    latestPrices,
    quotes,
  };
}

export type AddTakeoffItemInput = {
  takeoffId: Id<"takeoffs">;
  rawDescription: string;
  quantity?: number;
  unit?: string;
  materialId?: Id<"materials">;
  customDimensions?: MaterialDimensions;
  customSpecification?: string;
  estimatedUnitPriceCents?: number;
  notes?: string;
};

export async function addTakeoffItem(
  ctx: MutationCtx,
  input: AddTakeoffItemInput
): Promise<Id<"takeoffItems">> {
  const takeoff = await ctx.db.get("takeoffs", input.takeoffId);
  if (!takeoff) throw new Error("Takeoff não encontrado");

  const rawDescription = input.rawDescription.trim();
  if (!rawDescription) throw new Error("Informe a descrição do item");

  const now = Date.now();
  const customDimensions = sanitizeDimensions(input.customDimensions);
  const itemId = await ctx.db.insert("takeoffItems", {
    takeoffId: input.takeoffId,
    projectId: takeoff.projectId,
    rawDescription,
    quantity: input.quantity,
    unit: input.unit?.trim() || undefined,
    materialId: input.materialId,
    customDimensions,
    customSpecification: input.customSpecification?.trim() || undefined,
    estimatedUnitPriceCents: input.estimatedUnitPriceCents,
    notes: input.notes?.trim() || undefined,
    status: input.materialId ? "matched" : "draft",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch("takeoffs", input.takeoffId, { updatedAt: now });
  return itemId;
}

export type UpdateTakeoffItemInput = {
  itemId: Id<"takeoffItems">;
  rawDescription?: string;
  quantity?: number;
  unit?: string;
  materialId?: Id<"materials">;
  customDimensions?: MaterialDimensions;
  customSpecification?: string;
  estimatedUnitPriceCents?: number;
  notes?: string;
  status?: Infer<typeof takeoffItemStatus>;
};

export async function updateTakeoffItem(
  ctx: MutationCtx,
  input: UpdateTakeoffItemInput
): Promise<void> {
  const item = await ctx.db.get("takeoffItems", input.itemId);
  if (!item) throw new Error("Item não encontrado");

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (input.rawDescription !== undefined) {
    const desc = input.rawDescription.trim();
    if (!desc) throw new Error("Informe a descrição do item");
    updates.rawDescription = desc;
  }
  if (input.quantity !== undefined) updates.quantity = input.quantity;
  // Totais publicados pelo desktop deixam de valer quando a conta muda.
  if (input.quantity !== undefined && input.quantity !== item.quantity) {
    updates.materialTotalCents = undefined;
    updates.laborTotalCents = undefined;
  }
  if (
    input.estimatedUnitPriceCents !== undefined &&
    input.estimatedUnitPriceCents !== item.estimatedUnitPriceCents
  ) {
    updates.materialTotalCents = undefined;
  }
  if (input.unit !== undefined) updates.unit = input.unit.trim() || undefined;
  if (input.materialId !== undefined) {
    updates.materialId = input.materialId;
    if (input.materialId && !input.status) updates.status = "matched";
  }
  if (input.customDimensions !== undefined) {
    updates.customDimensions = sanitizeDimensions(input.customDimensions);
  }
  if (input.customSpecification !== undefined) {
    updates.customSpecification =
      input.customSpecification.trim() || undefined;
  }
  if (input.estimatedUnitPriceCents !== undefined) {
    updates.estimatedUnitPriceCents = input.estimatedUnitPriceCents;
  }
  if (input.notes !== undefined) updates.notes = input.notes.trim() || undefined;
  if (input.status !== undefined) updates.status = input.status;

  await ctx.db.patch("takeoffItems", input.itemId, updates);
  await ctx.db.patch("takeoffs", item.takeoffId, { updatedAt: Date.now() });
}

/** Cadastra no catálogo o material de uma linha que ainda não tem um. */
export async function promoteTakeoffItemToMaterial(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { itemId: Id<"takeoffItems">; familyName?: string; category?: string }
): Promise<{ materialId: Id<"materials">; created: boolean }> {
  const item = await ctx.db.get("takeoffItems", input.itemId);
  if (!item) throw new Error("Item não encontrado");
  if (item.materialId) {
    return { materialId: item.materialId, created: false };
  }

  const promoted = await promoteTakeoffItem(ctx, user, item, {
    familyName: input.familyName,
    category: input.category,
  });
  return { materialId: promoted.materialId, created: promoted.created };
}

export async function removeTakeoffItem(
  ctx: MutationCtx,
  itemId: Id<"takeoffItems">
): Promise<void> {
  const item = await ctx.db.get("takeoffItems", itemId);
  if (!item) throw new Error("Item não encontrado");
  await ctx.db.delete("takeoffItems", itemId);
  await ctx.db.patch("takeoffs", item.takeoffId, { updatedAt: Date.now() });
}

export async function applySuggestedTakeoffItemPrice(
  ctx: MutationCtx,
  input: { itemId: Id<"takeoffItems">; unitPriceCents: number }
): Promise<void> {
  const item = await ctx.db.get("takeoffItems", input.itemId);
  if (!item) throw new Error("Item não encontrado");
  await ctx.db.patch("takeoffItems", input.itemId, {
    estimatedUnitPriceCents: input.unitPriceCents,
    // o total publicado pelo desktop era do preço anterior, que pode ter
    // frações de centavo mesmo quando arredonda para este mesmo valor
    materialTotalCents: undefined,
    updatedAt: Date.now(),
  });
}
