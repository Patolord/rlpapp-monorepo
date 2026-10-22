import type { CatalogEntry } from "./catalog";
import { foldName } from "./catalog";
import {
  billTotals,
  DEFAULT_DUCT_SETTINGS,
  type DuctBillRow,
  type DuctRun,
  type DuctTotals,
  ductBill,
} from "./ducts";
import { measurementQty, pageScale, repeatOf, zoneOf } from "./quantities";
import { drawingOf, ITEM_COLORS, type Item, newId, type Project } from "./types";

export const DUCT_GROUP = "Rede de Dutos";
/** The one budget item each discipline's duct network collapses into. */
export const DUCT_ITEM = "Rede de dutos";

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
      spec: m.duct,
      length: (q + (m.vertical ?? 0)) * (item.factor ?? 1) * repeatOf(project, m, "linear"),
      tag: zone ? `${planta} · ${zone.name}` : planta,
      system: (item.system || project.system || "").trim(),
    });
  }
  return runs;
}

/** Duct runs per discipline (pressurização, tomada de ar, ar condicionado…), plantas merged. */
export function ductRunsBySystem(project: Project): Map<string, DuctRun[]> {
  const out = new Map<string, DuctRun[]>();
  for (const r of ductRuns(project)) {
    const key = r.system ?? "";
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

export interface DuctBillForSystem {
  system: string;
  runs: DuctRun[];
  rows: DuctBillRow[];
  price: (row: DuctBillRow) => number;
  totals: DuctTotals;
}

/** Bill of materials and totals of one discipline's duct network. */
export function ductBillFor(
  project: Project,
  catalog: readonly CatalogEntry[],
  system: string,
  runs = ductRunsBySystem(project).get(system) ?? [],
): DuctBillForSystem {
  const rows = ductBill(runs, project.duct ?? DEFAULT_DUCT_SETTINGS);
  const price = (row: DuctBillRow) => ductPrice(project, catalog, row);
  return { system, runs, rows, price, totals: billTotals(rows, price) };
}

/**
 * Keep one derived "Rede de dutos" item per discipline (1 cj, material and labour totals of
 * its duct network) in step with the duct runs. Returns the same project object when nothing
 * changes. Measured section items ("Duto A×B cm") are not priced; they feed this one.
 */
export function syncDuctItems(project: Project, catalog: () => readonly CatalogEntry[]): Project {
  const hasDerived = project.items.some((i) => i.derived === "duct");
  const bySystem = ductRunsBySystem(project);
  if (bySystem.size === 0 && !hasDerived) return project;
  const entries = catalog();
  const wanted = new Map<string, DuctTotals>();
  for (const [system, runs] of bySystem) {
    wanted.set(system, ductBillFor(project, entries, system, runs).totals);
  }
  let changed = false;
  const items: Item[] = [];
  for (const it of project.items) {
    if (it.derived !== "duct") {
      items.push(it);
      continue;
    }
    const key = (it.system || project.system || "").trim();
    const t = it.name === DUCT_ITEM ? wanted.get(key) : undefined;
    if (!t) {
      changed = true; // discipline without ducts any more, or an obsolete per-material item
      continue;
    }
    wanted.delete(key);
    if (it.materialPrice !== t.material || it.laborPrice !== t.labor || it.manualQty !== 1) {
      items.push({
        ...it,
        materialPrice: t.material,
        laborPrice: t.labor,
        manualQty: 1,
        unit: "cj",
      });
      changed = true;
    } else {
      items.push(it);
    }
  }
  for (const [system, t] of wanted) {
    items.push({
      id: newId(),
      name: DUCT_ITEM,
      kind: "count",
      color: ITEM_COLORS[items.length % ITEM_COLORS.length],
      group: DUCT_GROUP,
      materialPrice: t.material,
      laborPrice: t.labor,
      wastePct: 0,
      system: system || undefined,
      unit: "cj",
      manualQty: 1,
      derived: "duct",
    });
    changed = true;
  }
  return changed ? { ...project, items } : project;
}
