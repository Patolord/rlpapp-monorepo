import type { CatalogEntry } from "./catalog";
import type { Item, Project } from "./types";

/**
 * Weight-based pricing: some materials are bought by the kilo (copper, galvanized sheet) and a
 * line's unit price is its weight per unit times the price per kilo. One base price per project
 * re-prices every such line at once; the price stays stored on the line, so freezing a proposal
 * keeps working ("derived from cobre at R$ 120/kg on D").
 */
export interface BaseMaterial {
  key: string;
  label: string;
  /** Price per kg a new project starts with; undefined = no price until the user types one. */
  defaultPrice?: number;
}

/**
 * Copper has two tiers because the wall (and the price) changes at 3/4": the supplier quotes
 * R$ 120/kg up to 5/8" and R$ 130/kg from 3/4" up. Sheet metal has no default: the duct bill
 * keeps its workbook price per gauge row until a base price is typed.
 */
export const BASE_MATERIALS: readonly BaseMaterial[] = [
  { key: "cobre", label: 'Cobre até 5/8"', defaultPrice: 120 },
  { key: "cobre_grosso", label: 'Cobre 3/4" e maiores', defaultPrice: 130 },
  { key: "chapa", label: "Chapa galvanizada" },
];

export const baseMaterialLabel = (key: string): string =>
  BASE_MATERIALS.find((m) => m.key === key)?.label ?? key;

/** Price per kg of a base material in this project: typed value, else the bundled default. */
export function basePrice(project: Project, key: string): number | undefined {
  const own = project.basePrices?.[key];
  if (own !== undefined) return own;
  return BASE_MATERIALS.find((m) => m.key === key)?.defaultPrice;
}

/** A material whose price comes from its weight: the row of the editable weight table. */
export interface WeightRow {
  name: string;
  group: string;
  /** Budget unit the weight refers to: kg per metre ("m") or per piece ("pç"). */
  unit: "m" | "pç";
  /** Key of the base material (see BASE_MATERIALS). */
  material: string;
  kgPerUnit: number;
}

const COPPER_GROUP = "Tubulações";
const copper = (size: string, kgPerM: number, material = "cobre"): WeightRow => ({
  name: `Tubo de cobre ${size}`,
  group: COPPER_GROUP,
  unit: "m",
  material,
  kgPerUnit: kgPerM,
});

/** Supplier table (kg/m) for ACR copper tube; sizes from 3/4" up are the thicker, pricier tier. */
export const SEED_WEIGHTS: readonly WeightRow[] = [
  copper('1/4"', 0.123),
  copper('3/8"', 0.193),
  copper('1/2"', 0.263),
  copper('5/8"', 0.333),
  copper('3/4"', 0.776, "cobre_grosso"),
  copper('7/8"', 0.918, "cobre_grosso"),
  copper('1"', 1.06, "cobre_grosso"),
  copper('1.1/8"', 1.2, "cobre_grosso"),
  copper('1.1/4"', 1.34, "cobre_grosso"),
  copper('1.3/8"', 1.48, "cobre_grosso"),
  copper('1.1/2"', 1.62, "cobre_grosso"),
  copper('1.5/8"', 1.76, "cobre_grosso"),
  copper('1.3/4"', 1.91, "cobre_grosso"),
  copper('1.7/8"', 2.05, "cobre_grosso"),
];

export const cloneWeights = (rows: readonly WeightRow[]): WeightRow[] =>
  rows.map((r) => ({ ...r }));

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Unit price of a line priced by weight, or undefined when it is not (or its base has no price). */
export function derivedMaterialPrice(
  item: Pick<Item, "baseMaterial" | "kgPerUnit">,
  project: Project,
): number | undefined {
  if (!item.baseMaterial || !item.kgPerUnit || item.kgPerUnit <= 0) return undefined;
  const perKg = basePrice(project, item.baseMaterial);
  return perKg === undefined ? undefined : round2(item.kgPerUnit * perKg);
}

export const isWeightPriced = (item: Pick<Item, "baseMaterial" | "kgPerUnit">): boolean =>
  Boolean(item.baseMaterial && item.kgPerUnit && item.kgPerUnit > 0);

/**
 * Re-price every weight-based line from the project's base prices. Runs on every commit, like
 * the duct items; returns the same project when nothing changes. A line whose price moved gets
 * today's date: that is when the budget took the new base price.
 */
export function syncWeightItems(project: Project, now = Date.now()): Project {
  let changed = false;
  const items = project.items.map((item) => {
    const price = derivedMaterialPrice(item, project);
    if (price === undefined) return item;
    if (item.materialPrice === price && item.priceSource === "weight") return item;
    changed = true;
    return { ...item, materialPrice: price, priceSource: "weight" as const, priceDate: now };
  });
  return changed ? { ...project, items } : project;
}

/** Catalog entries for the weight table, priced for this project so Ctrl+K shows real values. */
export function weightCatalogEntries(
  rows: readonly WeightRow[],
  project?: Project,
): CatalogEntry[] {
  return rows
    .filter((r) => r.name.trim() && r.kgPerUnit > 0)
    .map((r) => {
      const price = project
        ? derivedMaterialPrice({ baseMaterial: r.material, kgPerUnit: r.kgPerUnit }, project)
        : undefined;
      return {
        name: r.name.trim(),
        group: r.group || COPPER_GROUP,
        unit: r.unit,
        materialPrice: price ?? 0,
        laborPrice: 0,
        baseMaterial: r.material,
        kgPerUnit: r.kgPerUnit,
        source: "seed" as const,
      };
    });
}

/** "0,263 kg/m × R$ 120,00/kg (Cobre até 5/8")": how a derived price was reached. */
export function describeWeightPrice(item: Item, project: Project, money: (v: number) => string) {
  if (!isWeightPriced(item) || !item.baseMaterial) return null;
  const perKg = basePrice(project, item.baseMaterial);
  const unit = item.kind === "linear" ? "m" : item.kind === "area" ? "m²" : (item.unit ?? "pç");
  const kg = `${item.kgPerUnit?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg/${unit}`;
  const label = baseMaterialLabel(item.baseMaterial);
  return perKg === undefined
    ? `${kg} × ${label} (sem preço por kg: informe em Orçamento › Insumos)`
    : `${kg} × ${money(perKg)}/kg (${label})`;
}
