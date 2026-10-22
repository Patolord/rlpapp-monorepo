import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { normalizeUnit } from "../../lib/compras/catalog";
import { describeMaterial } from "../../lib/compras/materialLookup";
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
  description: v.string(),
  group: v.string(),
  unit: v.string(),
  materialPrice: v.number(),
  laborPrice: v.number(),
  system: v.union(v.string(), v.null()),
});

export type TakeoffCatalogItem = {
  id: Doc<"materials">["_id"];
  sku: string | null;
  name: string;
  description: string;
  group: string;
  unit: string;
  materialPrice: number;
  laborPrice: number;
  system: string | null;
};

export function takeoffUnit(unit: string | undefined): string {
  const normalized = normalizeUnit(unit) ?? "un";
  return normalized === "un" ? TAKEOFF_PIECE_UNIT : normalized;
}

export function toTakeoffCatalogItem(
  material: Doc<"materials">,
  materialPriceCents: number | null
): TakeoffCatalogItem {
  return {
    id: material._id,
    sku: material.sku ?? null,
    name: material.name,
    description: describeMaterial(material),
    group: material.category?.trim() || DEFAULT_TAKEOFF_GROUP,
    unit: takeoffUnit(material.unit),
    materialPrice: materialPriceCents === null ? 0 : centsToReais(materialPriceCents),
    // Placeholders: materials carry no labour price or discipline (HVAC,
    // pressurisation, ...) yet. Both become real fields in a later schema change.
    laborPrice: 0,
    system: null,
  };
}

async function currentMaterialPriceCents(
  ctx: QueryCtx,
  materialId: Doc<"materials">["_id"],
  now: number
): Promise<number | null> {
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .order("desc")
    .take(PRICE_EVENT_WINDOW);
  return pickCurrentPriceEvent(events, now)?.unitPriceCents ?? null;
}

/** Every active material with the price it should be budgeted at today. */
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
    const priceCents = await currentMaterialPriceCents(ctx, material._id, now);
    items.push(toTakeoffCatalogItem(material, priceCents));
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
