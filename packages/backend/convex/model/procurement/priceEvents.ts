import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { MaterialDimensions } from "./catalog";
import { buildPriceHistory, type PriceChange } from "./priceHistory";
import { isUsablePriceEvent } from "./priceSelection";
import {
  normalizeText,
  priceAgeDays,
  priceFreshness,
  suggestedUnitPriceCents,
} from "./pricing";

/** Leitura de eventos de preço: listas, último preço por fornecedor, histórico. */

type PriceEventForView = {
  _id: Id<"priceEvents">;
  _creationTime: number;
  rawDescription?: string;
  materialId?: Id<"materials">;
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
  unitPriceCents: number;
  unit?: string;
  quantity?: number;
  source:
    | "manual"
    | "quote"
    | "purchase"
    | "invoice"
    | "whatsapp"
    | "supplier_form"
    | "excel_import";
  occurredAt: number;
  validUntil?: number;
  projectId?: Id<"projects">;
  takeoffId?: Id<"takeoffs">;
  takeoffItemId?: Id<"takeoffItems">;
  dimensions?: MaterialDimensions;
  notes?: string;
  reviewStatus?: "unreviewed" | "reviewed" | "ignored" | "duplicate";
  needsReview: boolean;
  createdAt: number;
};

/** Evento como a UI o mostra: nomes resolvidos, idade, frescor e avisos. */
export async function enrichPriceEvent(
  ctx: { db: QueryCtx["db"] },
  event: PriceEventForView,
  now: number
) {
  let materialName: string | null = null;
  if (event.materialId) {
    const material = await ctx.db.get("materials", event.materialId);
    materialName = material?.name ?? null;
  }

  let supplierName = event.supplierNameRaw ?? "Fornecedor desconhecido";
  if (event.supplierId) {
    const supplier = await ctx.db.get("suppliers", event.supplierId);
    if (supplier) supplierName = supplier.name;
  }

  const freshness = priceFreshness(event.occurredAt, now);
  const warnings: string[] = [];
  if (event.needsReview) warnings.push("Precisa revisão");
  if (!event.materialId) warnings.push("Sem material vinculado");
  if (!event.supplierId && !event.supplierNameRaw?.trim()) {
    warnings.push("Sem fornecedor vinculado");
  }
  if (!event.unit?.trim()) warnings.push("Unidade ausente");
  if (freshness === "old") warnings.push("Preço antigo — use com cautela");
  if (freshness === "stale") warnings.push("Preço obsoleto — solicite cotação");

  return {
    _id: event._id,
    _creationTime: event._creationTime,
    rawDescription: event.rawDescription ?? null,
    materialId: event.materialId ?? null,
    materialName,
    supplierId: event.supplierId ?? null,
    supplierName,
    unitPriceCents: event.unitPriceCents,
    unit: event.unit ?? null,
    quantity: event.quantity ?? null,
    source: event.source,
    occurredAt: event.occurredAt,
    validUntil: event.validUntil ?? null,
    projectId: event.projectId ?? null,
    takeoffId: event.takeoffId ?? null,
    takeoffItemId: event.takeoffItemId ?? null,
    dimensions: event.dimensions ?? null,
    notes: event.notes ?? null,
    reviewStatus: event.reviewStatus ?? null,
    needsReview: event.needsReview,
    createdAt: event.createdAt,
    ageDays: priceAgeDays(event.occurredAt, now),
    freshness,
    suggestedUnitPriceCents: suggestedUnitPriceCents(
      event.unitPriceCents,
      freshness
    ),
    warnings,
  };
}

export type ListPriceEventsInput = {
  now: number;
  materialId?: Id<"materials">;
  projectId?: Id<"projects">;
  takeoffId?: Id<"takeoffs">;
  limit?: number;
};

export async function listPriceEvents(
  ctx: QueryCtx,
  input: ListPriceEventsInput
) {
  const limit = input.limit ?? 100;
  let events;

  if (input.materialId) {
    events = await ctx.db
      .query("priceEvents")
      .withIndex("by_material", (q) => q.eq("materialId", input.materialId))
      .order("desc")
      .take(limit);
  } else if (input.projectId) {
    events = await ctx.db
      .query("priceEvents")
      .withIndex("by_project", (q) => q.eq("projectId", input.projectId))
      .order("desc")
      .take(limit);
  } else if (input.takeoffId) {
    events = await ctx.db
      .query("priceEvents")
      .withIndex("by_takeoff", (q) => q.eq("takeoffId", input.takeoffId))
      .order("desc")
      .take(limit);
  } else {
    events = await ctx.db
      .query("priceEvents")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(limit);
  }

  const out = [];
  for (const event of events) {
    out.push(await enrichPriceEvent(ctx, event, input.now));
  }
  return out;
}

export type ListLatestPricesForMaterialInput = {
  materialId?: Id<"materials">;
  rawDescription?: string;
  now: number;
};

/** Último preço utilizável de cada fornecedor, pelo material ou pela descrição. */
export async function listLatestPricesForMaterial(
  ctx: QueryCtx,
  input: ListLatestPricesForMaterialInput
) {
  let events = input.materialId
    ? await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", input.materialId))
        .order("desc")
        .take(50)
    : [];

  if (events.length === 0 && input.rawDescription?.trim()) {
    const term = normalizeText(input.rawDescription);
    const all = await ctx.db.query("priceEvents").order("desc").take(200);
    events = all.filter(
      (e) => e.rawDescription && normalizeText(e.rawDescription).includes(term)
    );
  }

  events = events.filter(isUsablePriceEvent);

  const bySupplier = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const key = event.supplierId ?? event.supplierNameRaw ?? event._id;
    if (!bySupplier.has(key)) bySupplier.set(key, event);
  }

  const out = [];
  for (const event of bySupplier.values()) {
    out.push(await enrichPriceEvent(ctx, event, input.now));
  }
  return out.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 10);
}

export function toPriceChange(change: PriceChange | null) {
  return change
    ? {
        deltaCents: change.deltaCents,
        deltaPercent: change.deltaPercent,
        fromCents: change.fromCents,
        fromAt: change.fromAt,
      }
    : null;
}

/**
 * Histórico de preços de um material com variação: série cronológica na
 * unidade de referência, último preço por fornecedor e resumo.
 */
export async function getMaterialPriceHistory(
  ctx: QueryCtx,
  input: { materialId: Id<"materials">; now: number }
) {
  const [material, events] = await Promise.all([
    ctx.db.get("materials", input.materialId),
    ctx.db
      .query("priceEvents")
      .withIndex("by_material", (q) => q.eq("materialId", input.materialId))
      .collect(),
  ]);
  const history = buildPriceHistory(events, input.now, {
    materialUnit: material?.unit ?? null,
  });

  const supplierNames = new Map<string, string>();
  const supplierNameOf = async (event: {
    supplierId?: Id<"suppliers">;
    supplierNameRaw?: string;
  }) => {
    const fallback = event.supplierNameRaw ?? "Fornecedor desconhecido";
    if (!event.supplierId) return fallback;
    const cached = supplierNames.get(event.supplierId);
    if (cached) return cached;
    const supplier = await ctx.db.get("suppliers", event.supplierId);
    const name = supplier?.name ?? fallback;
    supplierNames.set(event.supplierId, name);
    return name;
  };

  const points = [];
  for (const point of history.points) {
    points.push({
      _id: point.event._id,
      occurredAt: point.event.occurredAt,
      unitPriceCents: point.event.unitPriceCents,
      unit: point.event.unit ?? null,
      supplierId: point.event.supplierId ?? null,
      supplierName: await supplierNameOf(point.event),
      source: point.event.source,
      needsReview: point.event.needsReview,
      change: toPriceChange(point.change),
    });
  }

  const suppliers = [];
  for (const supplier of history.suppliers) {
    suppliers.push({
      key: supplier.key,
      supplierId: supplier.supplierId,
      supplierName: await supplierNameOf(supplier.latest),
      unitPriceCents: supplier.latest.unitPriceCents,
      unit: supplier.latest.unit ?? null,
      occurredAt: supplier.latest.occurredAt,
      source: supplier.latest.source,
      freshness: priceFreshness(supplier.latest.occurredAt, input.now),
      change: toPriceChange(supplier.change),
      count: supplier.count,
    });
  }

  return {
    unit: history.unit,
    current: history.current
      ? await enrichPriceEvent(ctx, history.current, input.now)
      : null,
    summary: history.summary
      ? {
          change30d: toPriceChange(history.summary.change30d),
          change90d: toPriceChange(history.summary.change90d),
          changeFromPrevious: toPriceChange(history.summary.changeFromPrevious),
          minCents: history.summary.minCents,
          minAt: history.summary.minAt,
          maxCents: history.summary.maxCents,
          maxAt: history.summary.maxAt,
          count: history.summary.count,
          firstAt: history.summary.firstAt,
          lastAt: history.summary.lastAt,
        }
      : null,
    points,
    suppliers,
    excludedCount: history.excludedCount,
  };
}

/** Contadores do painel de Compras. */
export async function getPriceDashboardStats(ctx: QueryCtx, now: number) {
  const materials = await ctx.db.query("materials").collect();
  const suppliers = await ctx.db.query("suppliers").collect();
  const unreviewed = await ctx.db
    .query("priceEvents")
    .withIndex("by_needs_review", (q) => q.eq("needsReview", true))
    .collect();

  const recentEvents = await ctx.db
    .query("priceEvents")
    .withIndex("by_occurred_at")
    .order("desc")
    .take(30);

  let stalePrices = 0;
  for (const event of recentEvents) {
    if (priceFreshness(event.occurredAt, now) === "stale") {
      stalePrices += 1;
    }
  }

  const takeoffItems = await ctx.db.query("takeoffItems").collect();
  const takeoffsNeedingPricing = takeoffItems.filter(
    (i) => i.estimatedUnitPriceCents === undefined
  ).length;

  return {
    activeMaterials: materials.filter((m) => m.active).length,
    activeSuppliers: suppliers.filter((s) => s.active).length,
    unreviewedPrices: unreviewed.length,
    stalePrices,
    recentEvents: recentEvents.length,
    takeoffsNeedingPricing,
  };
}
