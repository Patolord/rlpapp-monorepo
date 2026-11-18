import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { normalizeUnit } from "./catalog";
import { describeMaterial } from "./materialLookup";
import { materialStatus } from "../../schema/procurement";
import {
  DAY_MS,
  REFERENCE_WINDOW_DAYS,
  referenceStats,
} from "@rlpapp/shared/compras/priceReference";
import {
  isComparableUnit,
  materialEventsBetween,
  supplierKeyOf,
} from "./priceHistory";
import {
  centsToReais,
  isUsablePriceEvent,
  pickCurrentPriceEvent,
} from "./priceSelection";

/**
 * Group for a material with no category: the desktop app's own default group
 * (`DEFAULT_GROUP` in apps/takeoff/src/lib/types.ts). Not "Diversos", which in
 * the app is one of the budget extras lines (Diversos / Transportes / Supervisão).
 */
export const DEFAULT_TAKEOFF_GROUP = "Geral";
/** The desktop app counts pieces as "pç"; the catalog stores them as "un". */
export const TAKEOFF_PIECE_UNIT = "pç";
// Same window `priceEvents.latestForMaterial` reads per material.
const PRICE_EVENT_WINDOW = 50;
// Quotes of one material within the reference's six months, by price date.
const REFERENCE_EVENT_WINDOW = 500;

export const takeoffPriceReferenceValidator = v.object({
  /** Median of the window: the price to budget with. */
  price: v.number(),
  minPrice: v.number(),
  maxPrice: v.number(),
  /** (max − min) / median. */
  spread: v.number(),
  count: v.number(),
  supplierCount: v.number(),
  /** Change per month between the first and last quoted weeks; null if too close. */
  monthlyChange: v.union(v.number(), v.null()),
  lastAt: v.number(),
  /** ok; wide = spread above 10%; stale = no quote in 90 days. */
  status: v.union(v.literal("ok"), v.literal("wide"), v.literal("stale")),
});

export type TakeoffPriceReference = {
  price: number;
  minPrice: number;
  maxPrice: number;
  spread: number;
  count: number;
  supplierCount: number;
  monthlyChange: number | null;
  lastAt: number;
  status: "ok" | "wide" | "stale";
};

export const takeoffCatalogItemValidator = v.object({
  id: v.id("materials"),
  sku: v.union(v.string(), v.null()),
  name: v.string(),
  // Variant of the family in `name` ("Sicflux SONORA 18" for "Exaustor").
  // Published on its own because `description` joins name, variant and spec
  // with " — " and the desktop app cannot split that string reliably.
  variant: v.union(v.string(), v.null()),
  description: v.string(),
  group: v.string(),
  unit: v.string(),
  materialPrice: v.number(),
  // Provenance of materialPrice, so a budget can freeze "R$ X quoted on D"
  // and later show what changed. All null when the material has no price.
  priceDate: v.union(v.number(), v.null()),
  priceValidUntil: v.union(v.number(), v.null()),
  priceEventId: v.union(v.id("priceEvents"), v.null()),
  // Labour unit price (reais, like materialPrice) set on the material in the
  // company app; 0 when none is set. laborPriceDate says when it was set.
  laborPrice: v.number(),
  laborPriceDate: v.union(v.number(), v.null()),
  system: v.union(v.string(), v.null()),
  // "draft": proposed from the takeoff, awaiting purchasing. "archived" items
  // appear only when merged into another material, with the redirect.
  status: materialStatus,
  mergedInto: v.union(v.id("materials"), v.null()),
  // Budget reference from every supplier's quotes of the last 6 months (see
  // @rlpapp/shared/compras/priceReference), in reais. Null without quotes in
  // that window. materialPrice stays the latest quote.
  reference: v.union(takeoffPriceReferenceValidator, v.null()),
});

export type TakeoffCatalogItem = {
  id: Doc<"materials">["_id"];
  sku: string | null;
  name: string;
  variant: string | null;
  description: string;
  group: string;
  unit: string;
  materialPrice: number;
  priceDate: number | null;
  priceValidUntil: number | null;
  priceEventId: Id<"priceEvents"> | null;
  laborPrice: number;
  laborPriceDate: number | null;
  system: string | null;
  status: "draft" | "active" | "archived";
  mergedInto: Id<"materials"> | null;
  reference: TakeoffPriceReference | null;
};

/** Legacy rows have no status; `active` decides. */
export function catalogStatus(
  material: Pick<Doc<"materials">, "active" | "status">
): "draft" | "active" | "archived" {
  if (!material.active) return "archived";
  return material.status === "draft" ? "draft" : "active";
}

/** The slice of a price event the catalog exposes. */
export type CurrentPrice = Pick<
  Doc<"priceEvents">,
  "_id" | "unitPriceCents" | "occurredAt" | "validUntil"
>;

export function takeoffUnit(unit: string | undefined): string {
  const normalized = normalizeUnit(unit) ?? "un";
  return normalized === "un" ? TAKEOFF_PIECE_UNIT : normalized;
}

export function toTakeoffCatalogItem(
  material: Doc<"materials">,
  price: CurrentPrice | null,
  reference: TakeoffPriceReference | null = null
): TakeoffCatalogItem {
  return {
    id: material._id,
    sku: material.sku ?? null,
    name: material.name,
    variant: material.variantLabel?.trim() || null,
    description: describeMaterial(material),
    group: material.category?.trim() || DEFAULT_TAKEOFF_GROUP,
    unit: takeoffUnit(material.unit),
    materialPrice: price ? centsToReais(price.unitPriceCents) : 0,
    priceDate: price?.occurredAt ?? null,
    priceValidUntil: price?.validUntil ?? null,
    priceEventId: price?._id ?? null,
    laborPrice: centsToReais(material.laborPriceCents ?? 0),
    laborPriceDate:
      material.laborPriceCents !== undefined
        ? (material.laborPriceUpdatedAt ?? null)
        : null,
    // Placeholder: materials carry no discipline (HVAC, pressurisation, ...)
    // yet. It becomes a real field in a later schema change.
    system: null,
    status: catalogStatus(material),
    mergedInto: material.mergedIntoId ?? null,
    reference,
  };
}

/** The reference of a material from its recent events (same unit only), in reais. */
export function takeoffReferenceOf(
  material: Pick<Doc<"materials">, "unit">,
  events: Doc<"priceEvents">[],
  now: number
): TakeoffPriceReference | null {
  const stats = referenceStats(
    events
      .filter(
        (event) =>
          isUsablePriceEvent(event) && isComparableUnit(event.unit, material.unit)
      )
      .map((event) => ({
        unitPriceCents: event.unitPriceCents,
        occurredAt: event.occurredAt,
        supplierKey: supplierKeyOf(event),
        supplierName: "",
      })),
    now
  );
  if (!stats) return null;
  return {
    price: centsToReais(stats.medianCents),
    minPrice: centsToReais(stats.minCents),
    maxPrice: centsToReais(stats.maxCents),
    spread: stats.spread,
    count: stats.count,
    supplierCount: stats.supplierCount,
    monthlyChange: stats.monthlyChange,
    lastAt: stats.lastAt,
    status: stats.status,
  };
}

async function materialPrices(
  ctx: QueryCtx,
  material: Doc<"materials">,
  now: number
): Promise<{ price: CurrentPrice | null; reference: TakeoffPriceReference | null }> {
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_material", (q) => q.eq("materialId", material._id))
    .order("desc")
    .take(PRICE_EVENT_WINDOW);
  // The reference reads the whole six-month window by price date: a material
  // quoted often has more than PRICE_EVENT_WINDOW quotes in it.
  const windowEvents = await materialEventsBetween(
    ctx,
    material._id,
    now - REFERENCE_WINDOW_DAYS * DAY_MS,
    now,
    REFERENCE_EVENT_WINDOW
  );
  return {
    price: pickCurrentPriceEvent(events, now),
    reference: takeoffReferenceOf(material, windowEvents, now),
  };
}

function byName(a: TakeoffCatalogItem, b: TakeoffCatalogItem): number {
  return a.name.localeCompare(b.name, "pt-BR");
}

/**
 * Every active material (including drafts) with the price it should be
 * budgeted at today, followed by the archived materials that were merged into
 * another one, so budget lines can follow the redirect.
 */
export async function listTakeoffCatalog(
  ctx: QueryCtx,
  now: number
): Promise<TakeoffCatalogItem[]> {
  // eslint-disable-next-line @convex-dev/no-collect-in-query -- full export of a bounded catalog (hundreds of rows)
  const materials = await ctx.db
    .query("materials")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();

  const items: TakeoffCatalogItem[] = [];
  for (const material of materials) {
    const { price, reference } = await materialPrices(ctx, material, now);
    items.push(toTakeoffCatalogItem(material, price, reference));
  }

  // eslint-disable-next-line @convex-dev/no-collect-in-query -- merged materials are a small subset of the bounded catalog
  const archived = await ctx.db
    .query("materials")
    .withIndex("by_status", (q) => q.eq("status", "archived"))
    .collect();
  const redirects = archived
    .filter((material) => material.mergedIntoId !== undefined)
    .map((material) => toTakeoffCatalogItem(material, null));

  return [...items.sort(byName), ...redirects.sort(byName)];
}
