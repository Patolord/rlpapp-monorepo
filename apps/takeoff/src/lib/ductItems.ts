import type { CatalogEntry } from "./catalog";
import {
  billTotals,
  DEFAULT_DUCT_SETTINGS,
  type DuctBillRow,
  type DuctRun,
  type DuctTotals,
  ductBill,
  type GaugeWeights,
} from "./ducts";
import { measurementQty, pageScale, repeatOf, zoneOf } from "./quantities";
import { foldName } from "./text";
import { drawingOf, ITEM_COLORS, type Item, locationOf, newId, type Project } from "./types";

export const DUCT_GROUP = "Rede de Dutos";
/** Default name of a duct network item; the user can rename it like any item. */
export const DUCT_ITEM = "Rede de dutos";

/** The duct networks of the takeoff: the items duct runs belong to. */
export const ductNetworks = (project: Project): Item[] =>
  project.items.filter((i) => i.derived === "duct");

/** A fresh network item (1 cj; material and labour are filled by the sync). */
export function newDuctNetwork(project: Project, name?: string, system?: string): Item {
  const n = ductNetworks(project).length;
  return {
    id: newId(),
    name: name ?? (n === 0 ? DUCT_ITEM : `${DUCT_ITEM} ${n + 1}`),
    kind: "linear",
    color: ITEM_COLORS[project.items.length % ITEM_COLORS.length],
    group: DUCT_GROUP,
    materialPrice: 0,
    laborPrice: 0,
    wastePct: 0,
    system: (system ?? project.system) || undefined,
    unit: "cj",
    manualQty: 1,
    derived: "duct",
  };
}

/** Every measured duct run with its real length (vertical, factor and multipliers applied). */
export function ductRuns(project: Project): DuctRun[] {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const runs: DuctRun[] = [];
  for (const m of project.measurements) {
    if (!m.duct) continue;
    const item = items.get(m.itemId);
    if (!item) continue;
    const q = measurementQty(m, "linear", pageScale(project, m.drawingId, m.page));
    if (q === null) continue;
    const zone = zoneOf(project, m, "linear");
    const planta = drawingOf(project, m.drawingId)?.name.replace(/\.pdf$/i, "") ?? "";
    runs.push({
      id: m.id,
      network: item.id,
      spec: m.duct,
      length: (q + (m.vertical ?? 0)) * (item.factor ?? 1) * repeatOf(project, m, "linear"),
      vertical: m.vertical,
      tag: zone ? `${planta} · ${locationOf(project, zone.locationId)?.name ?? ""}` : planta,
      system: (item.system || project.system || "").trim(),
    });
  }
  return runs;
}

/** Duct runs per network item id. */
export function ductRunsByNetwork(project: Project): Map<string, DuctRun[]> {
  const out = new Map<string, DuctRun[]>();
  for (const r of ductRuns(project)) {
    const key = r.network ?? "";
    out.set(key, [...(out.get(key) ?? []), r]);
  }
  return out;
}

/** Unit price of a bill material: set in the takeoff, else the catalog, else the workbook default. */
export function ductPrice(
  project: Project,
  catalog: readonly CatalogEntry[],
  row: DuctBillRow,
): number {
  const own = project.ductPrices?.[row.name];
  if (own !== undefined) return own;
  const cat = catalog.find((e) => foldName(e.name) === foldName(row.name));
  return cat?.materialPrice ?? row.material;
}

export interface DuctBillForNetwork {
  network: Item;
  runs: DuctRun[];
  rows: DuctBillRow[];
  price: (row: DuctBillRow) => number;
  totals: DuctTotals;
}

/** Bill of materials and totals of one duct network (sheet weights from the catalog settings). */
export function ductBillFor(
  project: Project,
  catalog: readonly CatalogEntry[],
  network: Item,
  runs = ductRunsByNetwork(project).get(network.id) ?? [],
  gaugeWeights?: GaugeWeights,
): DuctBillForNetwork {
  const rows = ductBill(runs, project.duct ?? DEFAULT_DUCT_SETTINGS, gaugeWeights);
  const price = (row: DuctBillRow) => ductPrice(project, catalog, row);
  return { network, runs, rows, price, totals: billTotals(rows, price) };
}

/**
 * Keep every "Rede de dutos" item's material and labour in step with its runs (1 cj each).
 * Returns the same project object when nothing changes.
 */
export function syncDuctItems(
  project: Project,
  catalog: () => readonly CatalogEntry[],
  gaugeWeights?: GaugeWeights,
): Project {
  if (!project.items.some((i) => i.derived === "duct")) return project;
  const entries = catalog();
  const byNetwork = ductRunsByNetwork(project);
  let changed = false;
  const items = project.items.map((it) => {
    if (it.derived !== "duct") return it;
    const t = ductBillFor(project, entries, it, byNetwork.get(it.id) ?? [], gaugeWeights).totals;
    if (it.materialPrice === t.material && it.laborPrice === t.labor && it.manualQty === 1) {
      return it;
    }
    changed = true;
    return { ...it, materialPrice: t.material, laborPrice: t.labor, manualQty: 1, unit: "cj" };
  });
  return changed ? { ...project, items } : project;
}
