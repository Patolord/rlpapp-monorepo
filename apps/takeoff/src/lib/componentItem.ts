import type { KitComponent } from "@rlpapp/shared/takeoff/kits";
import {
  type CatalogEntry,
  type CatalogStore,
  kitComponentEntry,
  normalizeDiscipline,
} from "./catalog";
import { priceSourceOfEntry } from "./priceSource";
import { guessSymbol } from "./symbols";
import { foldName } from "./text";
import { DEFAULT_GROUP, ITEM_COLORS, type Item, newId } from "./types";

/** Link and dated price a line takes from the catalog entry it is created from. */
export const priceSnapshot = (
  entry: CatalogEntry | undefined,
): Pick<Item, "catalogId" | "priceDate" | "priceSource" | "baseMaterial" | "kgPerUnit"> => {
  if (!entry) return {};
  // weight-priced entries: the price (and its source) is derived on commit from the R$/kg
  if (entry.baseMaterial && entry.kgPerUnit) {
    return { baseMaterial: entry.baseMaterial, kgPerUnit: entry.kgPerUnit };
  }
  const priceSource = priceSourceOfEntry(entry);
  const dated = entry.materialPrice > 0 && priceSource !== "seed";
  return {
    catalogId: entry.source === "remote" ? entry.catalogId : undefined,
    priceSource,
    priceDate: dated ? (entry.priceDate ?? Date.now()) : undefined,
  };
};

export interface ComponentItemOptions {
  /** The project's discipline, for a new line whose component and catalog entry set none. */
  projectSystem: string;
  /**
   * Discipline the line must be on: an existing line of the material on another tab is not
   * reused, and a new one is created on this tab. Undefined = any line of the material.
   */
  system?: string;
  /** Item factor of a new line (a kit's ×2 cable); undefined = 1. */
  factor?: number;
}

/**
 * The budget line a kit component (or a single material) goes to: the line already linked to
 * its catalog code or spelt the same, else a new line priced from the catalog. A line of that
 * name with no link becomes linked to the coded material. Returns the item and the item list
 * (the same array when nothing was added or linked).
 */
export function componentItem(
  items: Item[],
  catalog: Pick<CatalogStore, "remote">,
  entries: readonly CatalogEntry[],
  c: Pick<KitComponent, "name" | "sku" | "group" | "system" | "kind">,
  opts: ComponentItemOptions,
): { item: Item; items: Item[] } {
  // a component with a catalog code is that material, under the name the catalog gives it
  const cat = kitComponentEntry(catalog, entries, c);
  const coded = cat?.catalogId && c.sku ? cat.catalogId : undefined;
  const name = coded && cat ? cat.name : c.name;
  const onTab = (i: Item) =>
    opts.system === undefined || foldName(i.system ?? "") === foldName(opts.system);
  let item = items.find(
    (i) =>
      !i.derived &&
      i.kind === c.kind &&
      onTab(i) &&
      ((coded && i.catalogId === coded) || foldName(i.name) === foldName(name)),
  );
  if (item && !item.catalogId && coded) {
    // a line of this name with no link (typed by hand, or from a kit without codes) is the
    // coded material: link it, keeping the price this takeoff has (the items list shows when it
    // differs from the catalog's)
    const linked: Item = { ...item, catalogId: coded };
    return { item: linked, items: items.map((i) => (i.id === linked.id ? linked : i)) };
  }
  if (item) return { item, items };
  item = {
    id: newId(),
    name,
    kind: c.kind,
    color: ITEM_COLORS[items.length % ITEM_COLORS.length],
    group: c.group || cat?.group || DEFAULT_GROUP,
    materialPrice: cat?.materialPrice ?? 0,
    laborPrice: cat?.laborPrice ?? 0,
    wastePct: 0,
    ...priceSnapshot(cat),
    system: opts.system ?? normalizeDiscipline(c.system || cat?.system) ?? opts.projectSystem,
    symbol: c.kind === "count" ? guessSymbol(name) : undefined,
    factor: opts.factor !== undefined && opts.factor !== 1 ? opts.factor : undefined,
  };
  return { item, items: [...items, item] };
}
