/**
 * Weight-based pricing of the RLP Takeoff desktop app: some materials are bought by the kilo
 * (copper tube, galvanized sheet) and a line's unit price is its weight per unit times the price
 * per kilo of its base material. The types, the base materials and the supplier's factory table
 * live here because the backend stores the company defaults (`takeoffSettings`), the dashboard
 * edits them and the app applies them under its local overrides. The app's own helpers (pricing
 * of budget lines, catalog entries) stay in apps/takeoff/src/lib/weights.ts.
 */

export interface BaseMaterial {
  key: string;
  label: string;
  /** Price per kg used until the company or the user sets one; undefined = none until set. */
  defaultPrice?: number;
}

/** Price per kg by base material key. */
export type BasePrices = Record<string, number>;

/**
 * Copper has two tiers because the wall (and the price) changes at 3/4": the supplier quotes
 * R$ 120/kg up to 5/8" and R$ 130/kg from 3/4" up. Sheet metal has no default: the duct bill
 * keeps its workbook price per gauge row until a price per kg is set.
 */
export const BASE_MATERIALS: readonly BaseMaterial[] = [
  { key: "cobre", label: 'Cobre até 5/8"', defaultPrice: 120 },
  { key: "cobre_grosso", label: 'Cobre 3/4" e maiores', defaultPrice: 130 },
  { key: "chapa", label: "Chapa galvanizada" },
];

export const isBaseMaterialKey = (key: string): boolean =>
  BASE_MATERIALS.some((m) => m.key === key);

export const baseMaterialLabel = (key: string): string =>
  BASE_MATERIALS.find((m) => m.key === key)?.label ?? key;

/** Price per kg of a base material: the prices in use, else the bundled default. */
export function basePrice(prices: BasePrices | undefined, key: string): number | undefined {
  const own = prices?.[key];
  if (own !== undefined) return own;
  return BASE_MATERIALS.find((m) => m.key === key)?.defaultPrice;
}

/** Budget unit a weight refers to: kg per metre or per piece. */
export type WeightUnit = "m" | "pç";
export const WEIGHT_UNITS: readonly WeightUnit[] = ["m", "pç"];

/** A material whose price comes from its weight: a row of the editable weight table. */
export interface WeightRow {
  name: string;
  group: string;
  unit: WeightUnit;
  /** Key of the base material (see BASE_MATERIALS). */
  material: string;
  kgPerUnit: number;
}

export const COPPER_GROUP = "Tubulações";

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

/** Accent- and case-insensitive key of a row: its name is what identifies it. */
export const weightKey = (row: Pick<WeightRow, "name">): string =>
  row.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Trimmed, with an empty group read as the copper group. */
export const normalizeWeightRow = (row: WeightRow): WeightRow => ({
  name: row.name.trim(),
  group: row.group.trim() || COPPER_GROUP,
  unit: row.unit,
  material: row.material,
  kgPerUnit: row.kgPerUnit,
});

export const sameWeightRow = (a: WeightRow, b: WeightRow): boolean =>
  JSON.stringify(normalizeWeightRow(a)) === JSON.stringify(normalizeWeightRow(b));
