import { GAUGES } from "@rlpapp/shared/engenharia/ducts";
import {
  type BasePrices,
  baseMaterialLabel,
  basePrice,
  COPPER_GROUP,
  type WeightRow,
} from "@rlpapp/shared/takeoff/weights";
import type { CatalogEntry } from "./catalog";
import type { Item, Project } from "./types";

/**
 * Weight-based pricing: some materials are bought by the kilo (copper, galvanized sheet) and a
 * line's unit price is its weight per unit times the price per kilo. The prices per kilo and the
 * weight table are app-level settings kept with the catalog (Ctrl+K footer): the company's
 * defaults, published with the catalog and edited in the dashboard's App Takeoff section, under
 * this machine's overrides (see lib/catalog.ts). Change a price per kg and every copper line of
 * the open takeoff follows, with nothing extra on the line itself. The types, the base materials
 * and the supplier's table are shared with the backend and the dashboard
 * (`@rlpapp/shared/takeoff/weights`).
 */
export {
  BASE_MATERIALS,
  type BaseMaterial,
  type BasePrices,
  baseMaterialLabel,
  basePrice,
  cloneWeights,
  SEED_WEIGHTS,
  type WeightRow,
} from "@rlpapp/shared/takeoff/weights";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Unit price of a line priced by weight, or undefined when it is not (or its base has no price). */
export function derivedMaterialPrice(
  item: Pick<Item, "baseMaterial" | "kgPerUnit">,
  prices: BasePrices | undefined,
): number | undefined {
  if (!item.baseMaterial || !item.kgPerUnit || item.kgPerUnit <= 0) return undefined;
  const perKg = basePrice(prices, item.baseMaterial);
  return perKg === undefined ? undefined : round2(item.kgPerUnit * perKg);
}

export const isWeightPriced = (item: Pick<Item, "baseMaterial" | "kgPerUnit">): boolean =>
  Boolean(item.baseMaterial && item.kgPerUnit && item.kgPerUnit > 0);

/**
 * Re-price every weight-based line from the current prices per kg. Runs on every commit (like
 * the duct items), when a price per kg changes and when a project is opened; returns the same
 * project when nothing changes. A line whose price moved is dated now: that is when the budget
 * took the new price per kg. A price the user typed on the line ("manual") is an override: the
 * global price is only a reference, so that line is left alone until it is set back to "weight".
 */
export function syncWeightItems(
  project: Project,
  prices: BasePrices | undefined,
  now = Date.now(),
): Project {
  let changed = false;
  const items = project.items.map((item) => {
    if (item.priceSource === "manual") return item;
    const price = derivedMaterialPrice(item, prices);
    if (price === undefined) return item;
    if (item.materialPrice === price && item.priceSource === "weight") return item;
    changed = true;
    return { ...item, materialPrice: price, priceSource: "weight" as const, priceDate: now };
  });
  return changed ? { ...project, items } : project;
}

/** Catalog entries for the weight table, already priced, so Ctrl+K shows real values. */
export function weightCatalogEntries(
  rows: readonly WeightRow[],
  prices: BasePrices | undefined,
): CatalogEntry[] {
  return rows
    .filter((r) => r.name.trim() && r.kgPerUnit > 0)
    .map((r) => ({
      name: r.name.trim(),
      group: r.group || COPPER_GROUP,
      unit: r.unit,
      materialPrice:
        derivedMaterialPrice({ baseMaterial: r.material, kgPerUnit: r.kgPerUnit }, prices) ?? 0,
      laborPrice: 0,
      baseMaterial: r.material,
      kgPerUnit: r.kgPerUnit,
      source: "seed" as const,
    }));
}

/**
 * With a sheet-metal price per kg set, every "Chapa galvanizada" row of the duct bill (one per
 * gauge, plus rechapeamento and cantoneira) resolves to it through the catalog, where the duct
 * bill already looks prices up by row name. Nothing is emitted while it is unset.
 */
export function sheetCatalogEntries(prices: BasePrices | undefined): CatalogEntry[] {
  const perKg = prices?.chapa;
  if (perKg === undefined) return [];
  const names = [
    ...GAUGES.map((g) => `Chapa galvanizada ${g.name}`),
    "Chapa galvanizada # 26 (rechapeamento)",
    "Chapa galvanizada # 26 (cantoneira)",
  ];
  return names.map((name) => ({
    name,
    group: "Rede de Dutos",
    unit: "kg",
    materialPrice: perKg,
    laborPrice: 0,
    source: "seed" as const,
  }));
}

/** "0,263 kg/m × R$ 120,00/kg (Cobre até 5/8")": how a derived price was reached. */
export function describeWeightPrice(
  item: Item,
  prices: BasePrices | undefined,
  money: (v: number) => string,
): string | null {
  if (!isWeightPriced(item) || !item.baseMaterial) return null;
  const perKg = basePrice(prices, item.baseMaterial);
  const unit = item.kind === "linear" ? "m" : item.kind === "area" ? "m²" : (item.unit ?? "pç");
  const kg = `${item.kgPerUnit?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg/${unit}`;
  const label = baseMaterialLabel(item.baseMaterial);
  return perKg === undefined
    ? `${kg} × ${label} (sem preço por kg: informe no rodapé do Ctrl+K)`
    : `${kg} × ${money(perKg)}/kg (${label}, ajuste no rodapé do Ctrl+K)`;
}
