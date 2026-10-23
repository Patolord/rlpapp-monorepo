import type { CatalogEntry } from "./catalog";
import { foldName } from "./catalog";
import { measurementQty, pageScale, repeatOf, zoneOf } from "./quantities";
import { drawingOf, ITEM_COLORS, type Item, newId, type Project } from "./types";
import {
  brandOf,
  DEFAULT_VRF_SETTINGS,
  type VrfBillResult,
  type VrfBillRow,
  type VrfBrand,
  type VrfRun,
  type VrfTotals,
  vrfBill,
  vrfTotals,
} from "./vrf";
import { type BasePrices, derivedMaterialPrice, type WeightRow } from "./weights";

export const VRF_GROUP = "Sistema VRF";
/** Default name of a VRF system item; the user renames it like any item ("Sistema 3 - Torre B"). */
export const VRF_ITEM = "Sistema VRF";
export const DEFAULT_SYSTEM_HP = 8;

/** The VRF systems of the takeoff: the items refrigerant runs belong to. */
export const vrfSystems = (project: Project): Item[] =>
  project.items.filter((i) => i.derived === "vrf");

/** A fresh system item (N cj; material and labour are filled by the sync). */
export function newVrfSystem(
  project: Project,
  brand: string,
  opts: { name?: string; system?: string; hp?: number } = {},
): Item {
  const n = vrfSystems(project).length;
  return {
    id: newId(),
    name: opts.name ?? (n === 0 ? VRF_ITEM : `${VRF_ITEM} ${n + 1}`),
    kind: "linear",
    color: ITEM_COLORS[project.items.length % ITEM_COLORS.length],
    group: VRF_GROUP,
    materialPrice: 0,
    laborPrice: 0,
    wastePct: 0,
    system: (opts.system ?? project.system) || undefined,
    unit: "cj",
    manualQty: 1,
    derived: "vrf",
    vrf: { brand, hp: opts.hp ?? DEFAULT_SYSTEM_HP },
  };
}

/** Every measured VRF run with its real length (vertical and multipliers applied). */
export function vrfRuns(project: Project): VrfRun[] {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const runs: VrfRun[] = [];
  for (const m of project.measurements) {
    if (!m.vrf) continue;
    const item = items.get(m.itemId);
    if (!item) continue;
    const q = measurementQty(m, "linear", pageScale(project, m.drawingId, m.page));
    if (q === null) continue;
    const zone = zoneOf(project, m, "linear");
    const planta = drawingOf(project, m.drawingId)?.name.replace(/\.pdf$/i, "") ?? "";
    runs.push({
      id: m.id,
      system: item.id,
      spec: m.vrf,
      length: (q + (m.vertical ?? 0)) * repeatOf(project, m, "linear"),
      vertical: m.vertical,
      tag: zone ? `${planta} · ${zone.name}` : planta,
    });
  }
  return runs;
}

/** VRF runs per system item id. */
export function vrfRunsBySystem(project: Project): Map<string, VrfRun[]> {
  const out = new Map<string, VrfRun[]>();
  for (const r of vrfRuns(project)) {
    const key = r.system ?? "";
    out.set(key, [...(out.get(key) ?? []), r]);
  }
  return out;
}

/** What prices a VRF bill row: the takeoff, the catalog, the copper weight table, R$/kg. */
export interface VrfPricing {
  catalog: readonly CatalogEntry[];
  weights: readonly WeightRow[];
  basePrices: BasePrices | undefined;
}

/**
 * Unit price of a bill material: set in this takeoff, else copper by weight (the supplier's kg/m
 * × the global R$/kg), else the catalog entry of that name, else the workbook's price.
 */
export function vrfPrice(project: Project, pricing: VrfPricing, row: VrfBillRow): number {
  const own = project.vrfPrices?.[row.name];
  if (own !== undefined) return own;
  if (row.copper && row.diameter) {
    const w = pricing.weights.find(
      (r) => foldName(r.name) === foldName(`Tubo de cobre ${row.diameter}"`),
    );
    const byWeight = w
      ? derivedMaterialPrice(
          { baseMaterial: w.material, kgPerUnit: w.kgPerUnit },
          pricing.basePrices,
        )
      : undefined;
    if (byWeight !== undefined) return byWeight;
  }
  const cat = pricing.catalog.find((e) => foldName(e.name) === foldName(row.name));
  return cat?.materialPrice ?? row.material;
}

export interface VrfBillForSystem extends VrfBillResult {
  item: Item;
  brand: VrfBrand;
  hp: number;
  runs: VrfRun[];
  price: (row: VrfBillRow) => number;
  totals: VrfTotals;
}

/** Bill of materials and totals of one VRF system. */
export function vrfBillFor(
  project: Project,
  pricing: VrfPricing,
  brands: readonly VrfBrand[],
  item: Item,
  runs = vrfRunsBySystem(project).get(item.id) ?? [],
): VrfBillForSystem {
  const brand = brandOf(brands, item.vrf?.brand);
  const hp = item.vrf?.hp ?? DEFAULT_SYSTEM_HP;
  const bill = vrfBill(runs, brand, hp, project.vrfSettings ?? DEFAULT_VRF_SETTINGS);
  const price = (row: VrfBillRow) => vrfPrice(project, pricing, row);
  return { ...bill, item, brand, hp, runs, price, totals: vrfTotals(bill.rows, price) };
}

/**
 * Keep every VRF system item's material and labour (per system, 1 cj) in step with its runs.
 * The item's quantity is how many identical systems the takeoff has (manualQty, default 1).
 * Returns the same project object when nothing changes.
 */
export function syncVrfItems(
  project: Project,
  pricing: () => VrfPricing,
  brands: () => readonly VrfBrand[],
): Project {
  if (!project.items.some((i) => i.derived === "vrf")) return project;
  const p = pricing();
  const b = brands();
  const bySystem = vrfRunsBySystem(project);
  let changed = false;
  const items = project.items.map((it) => {
    if (it.derived !== "vrf") return it;
    const t = vrfBillFor(project, p, b, it, bySystem.get(it.id) ?? []).totals;
    const qty = it.manualQty && it.manualQty > 0 ? it.manualQty : 1;
    if (
      it.materialPrice === t.material &&
      it.laborPrice === t.labor &&
      it.manualQty === qty &&
      it.unit === "cj"
    ) {
      return it;
    }
    changed = true;
    return { ...it, materialPrice: t.material, laborPrice: t.labor, manualQty: qty, unit: "cj" };
  });
  return changed ? { ...project, items } : project;
}
