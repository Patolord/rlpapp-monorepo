import type { Kit, KitComponent } from "@rlpapp/shared/takeoff/kits";
import type { CatalogEntry, CatalogStore } from "./catalog";
import { componentItem } from "./componentItem";
import { kitMode } from "./kits";
import { foldName } from "./text";
import type { Item, Project } from "./types";
import type { Kind } from "./units";

/**
 * Takeoff by estimate: quantities generated from assumptions instead of the drawing ("20 m of
 * line set per machine, one equipment kit per machine, × 12 machines"). Each assumption is a
 * kit or a single material with a quantity per unit; the result goes into the budget as typed
 * quantities (`Item.manualQty`) on the same lines a drawn kit would use.
 */

/** What an assumption generates: every component of a kit, or one material. */
export type EstimateSource =
  | { type: "kit"; kitId: string }
  | {
      type: "material";
      name: string;
      kind: Kind;
      /** Catalog code when picked from the company catalog. */
      sku?: string;
      group?: string;
    };

/** One assumption, per unit (machine, point) of the estimate. */
export interface EstimateRow {
  id: string;
  source: EstimateSource;
  /**
   * Quantity per unit: a linear kit's run length (each of its linear components follows it,
   * its count components come once per unit); a count kit's sets; a material's quantity in its
   * own unit.
   */
  perUnit: number;
}

export interface Estimate {
  /** Units (machines, points) every assumption is multiplied by. */
  units: number;
  rows: EstimateRow[];
  /** Discipline (budget tab) every generated line goes on; blank = the kit's or catalog's. */
  system?: string;
}

/** A material the estimate generates, with its total quantity. */
export interface EstimateLine {
  name: string;
  sku?: string;
  group: string;
  system?: string;
  kind: Kind;
  qty: number;
  /** Item factor a new line takes (a kit's cable both ways), so later drawn runs count alike. */
  factor?: number;
}

const round = (v: number): number => Math.round(v * 1e4) / 1e4;

/** How a row reads: "per unit" is a length for linear kits and linear/area materials. */
export function rowMeasure(row: EstimateRow, kits: readonly Kit[]): Kind {
  if (row.source.type === "material") return row.source.kind;
  const kitId = row.source.kitId;
  const kit = kits.find((k) => k.id === kitId);
  return kit && kitMode(kit) === "linear" ? "linear" : "count";
}

/** The materials one row generates for `units` units, before merging. */
function rowLines(row: EstimateRow, units: number, kits: readonly Kit[]): EstimateLine[] {
  const per = Number.isFinite(row.perUnit) ? Math.max(0, row.perUnit) : 0;
  const n = Number.isFinite(units) ? Math.max(0, units) : 0;
  if (row.source.type === "material") {
    const s = row.source;
    if (!s.name.trim()) return [];
    return [{ name: s.name.trim(), sku: s.sku, group: s.group ?? "", kind: s.kind, qty: n * per }];
  }
  const kitId = row.source.kitId;
  const kit = kits.find((k) => k.id === kitId);
  if (!kit) return [];
  const byRun = kitMode(kit) === "linear";
  return kit.components.map((c: KitComponent) => {
    // a run kit: linear parts follow the run, count parts come once per run (a drain kit);
    // a click kit: every part (pieces or length per click) comes once per set
    const qty = byRun && c.kind !== "count" ? n * per * c.factor : n * (byRun ? 1 : per) * c.factor;
    return {
      name: c.name,
      sku: c.sku,
      group: c.group,
      system: c.system,
      kind: c.kind,
      qty,
      // the same item factor a drawn run of this kit gives a new line
      factor: byRun || c.kind !== "linear" ? c.factor : undefined,
    };
  });
}

const lineKey = (l: Pick<EstimateLine, "name" | "sku" | "kind">) =>
  `${l.kind}:${l.sku?.trim() || foldName(l.name)}`;

/**
 * Every material the estimate generates, merged (the same copper from two kits is one line),
 * in the order they first appear. Lines with nothing to add are left out.
 */
export function estimateLines(estimate: Estimate, kits: readonly Kit[]): EstimateLine[] {
  const out = new Map<string, EstimateLine>();
  for (const row of estimate.rows) {
    for (const line of rowLines(row, estimate.units, kits)) {
      const key = lineKey(line);
      const prev = out.get(key);
      if (prev) prev.qty += line.qty;
      else out.set(key, { ...line });
    }
  }
  return [...out.values()].map((l) => ({ ...l, qty: round(l.qty) })).filter((l) => l.qty > 0);
}

/** One budget line the estimate added to: the item after the change and what was added. */
export interface EstimateResult {
  item: Item;
  added: number;
  /** The line did not exist before. */
  created: boolean;
}

/**
 * Add the estimate to the project: each material goes to the line a drawn kit would use (found
 * by catalog code or name, else created and priced from the catalog), its quantity added to the
 * line's typed quantity. With a discipline set, only lines on that tab are reused.
 */
export function applyEstimate(
  project: Project,
  lines: readonly EstimateLine[],
  catalog: Pick<CatalogStore, "remote">,
  entries: readonly CatalogEntry[],
  system?: string,
): { project: Project; results: EstimateResult[] } {
  let items = project.items;
  const tab = system?.trim() || undefined;
  const added = new Map<string, number>();
  const before = new Set(items.map((i) => i.id));
  const order: string[] = [];
  for (const line of lines) {
    const found = componentItem(items, catalog, entries, line, {
      projectSystem: project.system,
      system: tab,
      factor: line.factor,
    });
    items = found.items;
    if (!added.has(found.item.id)) order.push(found.item.id);
    added.set(found.item.id, (added.get(found.item.id) ?? 0) + line.qty);
  }
  items = items.map((i) => {
    const add = added.get(i.id);
    return add ? { ...i, manualQty: round((i.manualQty ?? 0) + add) } : i;
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const results = order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [{ item, added: round(added.get(id) ?? 0), created: !before.has(id) }] : [];
  });
  return { project: { ...project, items }, results };
}
