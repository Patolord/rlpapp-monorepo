import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { normalizeUnit } from "../../lib/compras/catalog";
import { describeMaterial } from "../../lib/compras/materialLookup";
import { materialStatus } from "../../schema";
import { centsToReais, pickCurrentPriceEvent } from "./priceSelection";

/** Group used by the desktop app when a material has no category. */
export const DEFAULT_TAKEOFF_GROUP = "Diversos";
/** The desktop app counts pieces as "pç"; the catalog stores them as "un". */
export const TAKEOFF_PIECE_UNIT = "pç";
// Same window `priceEvents.latestForMaterial` reads per material.
const PRICE_EVENT_WINDOW = 50;

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
  price: CurrentPrice | null
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
  };
}

async function currentMaterialPrice(
  ctx: QueryCtx,
  materialId: Id<"materials">,
  now: number
): Promise<CurrentPrice | null> {
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .order("desc")
    .take(PRICE_EVENT_WINDOW);
  return pickCurrentPriceEvent(events, now);
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
    const price = await currentMaterialPrice(ctx, material._id, now);
    items.push(toTakeoffCatalogItem(material, price));
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
