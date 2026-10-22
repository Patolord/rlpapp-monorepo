import type { CatalogEntry } from "./catalog";
import { foldName } from "./catalog";
import { DEFAULT_DUCT_SETTINGS, type DuctRun, ductBill } from "./ducts";
import { measurementQty, pageScale, repeatOf } from "./quantities";
import { ITEM_COLORS, type Item, newId, type Project } from "./types";

export const DUCT_GROUP = "Rede de Dutos";

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
    runs.push({
      spec: m.duct,
      length: (q + (m.vertical ?? 0)) * (item.factor ?? 1) * repeatOf(project, m, "linear"),
    });
  }
  return runs;
}

/**
 * Keep the derived duct items (sheet metal per gauge, insulation, flanges, paint, supports,
 * labour) in step with the duct runs. Quantities are overwritten; prices and names the user
 * edited are kept. Returns the same project object when nothing changes.
 */
export function syncDuctItems(project: Project, catalog: () => readonly CatalogEntry[]): Project {
  const hasDerived = project.items.some((i) => i.derived === "duct");
  const runs = ductRuns(project);
  if (runs.length === 0 && !hasDerived) return project;
  const rows = ductBill(runs, project.duct ?? DEFAULT_DUCT_SETTINGS);
  const pending = new Map(rows.map((r) => [r.name, r]));
  const ductItemIds = new Set(project.measurements.filter((m) => m.duct).map((m) => m.itemId));
  const system =
    project.items.find((i) => ductItemIds.has(i.id))?.system ?? project.system ?? undefined;

  let changed = false;
  const items: Item[] = [];
  for (const it of project.items) {
    if (it.derived !== "duct") {
      items.push(it);
      continue;
    }
    const r = pending.get(it.name);
    if (!r) {
      changed = true; // no longer needed
      continue;
    }
    pending.delete(it.name);
    if (it.manualQty !== r.qty || it.unit !== r.unit) {
      items.push({ ...it, manualQty: r.qty, unit: r.unit });
      changed = true;
    } else {
      items.push(it);
    }
  }
  if (pending.size > 0) {
    const entries = catalog();
    for (const r of rows) {
      if (!pending.has(r.name)) continue;
      const cat = entries.find((e) => foldName(e.name) === foldName(r.name));
      items.push({
        id: newId(),
        name: r.name,
        kind: "count",
        color: ITEM_COLORS[items.length % ITEM_COLORS.length],
        group: cat?.group ?? r.group,
        materialPrice: cat?.materialPrice ?? r.material,
        laborPrice: cat?.laborPrice ?? r.labor,
        wastePct: 0,
        system,
        unit: r.unit,
        manualQty: r.qty,
        derived: "duct",
      });
      changed = true;
    }
  }
  return changed ? { ...project, items } : project;
}
