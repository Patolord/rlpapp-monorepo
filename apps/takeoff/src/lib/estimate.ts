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
  /**
   * Unit prices typed for this estimate (a machine's value, labour per installation): a new
   * line takes them over the catalog's; a line already in the takeoff keeps its own.
   */
  price?: LinePrice;
}

/** Unit prices typed in the estimate; a missing one comes from the catalog. */
export interface LinePrice {
  material?: number;
  labor?: number;
}

/** Key two lines share when they are the same material (same code, else same name). */
export const lineKey = (l: Pick<EstimateLine, "name" | "sku" | "kind">): string =>
  `${l.kind}:${l.sku?.trim() || foldName(l.name)}`;

/**
 * Merge lines of the same material (the same copper from two kits is one line), in the order
 * they first appear; quantities are summed, the first typed price wins. Empty lines are dropped.
 */
export function mergeLines(lines: Iterable<EstimateLine>): EstimateLine[] {
  const out = new Map<string, EstimateLine>();
  for (const line of lines) {
    const key = lineKey(line);
    const prev = out.get(key);
    if (!prev) out.set(key, { ...line });
    else {
      prev.qty += line.qty;
      if (line.price) prev.price = { ...line.price, ...prev.price };
    }
  }
  return [...out.values()]
    .map((l) => ({ ...l, qty: round(l.qty) }))
    .filter((l) => l.qty > 0 && l.name.trim() !== "");
}

const round = (v: number): number => Math.round(v * 1e4) / 1e4;

/** How a row reads: "per unit" is a length for linear kits and linear/area materials. */
export function rowMeasure(row: EstimateRow, kits: readonly Kit[]): Kind {
  if (row.source.type === "material") return row.source.kind;
  const kitId = row.source.kitId;
  const kit = kits.find((k) => k.id === kitId);
  return kit && kitMode(kit) === "linear" ? "linear" : "count";
}

/**
 * The materials one row generates for `units` units, before merging: a material as is, or every
 * component of a kit as a drawn run (or click) of it would measure them.
 */
export function rowLines(row: EstimateRow, units: number, kits: readonly Kit[]): EstimateLine[] {
  const per = Number.isFinite(row.perUnit) ? Math.max(0, row.perUnit) : 0;
  const n = Number.isFinite(units) ? Math.max(0, units) : 0;
  if (row.source.type === "material") {
    const s = row.source;
    if (!s.name.trim()) return [];
    return [{ name: s.name.trim(), sku: s.sku, group: s.group ?? "", kind: s.kind, qty: n * per }];
  }
  const kitId = row.source.kitId;
  const kit = kits.find((k) => k.id === kitId);
  return kit ? kitLines(kit, n, per) : [];
}

/** Every component of a kit for `n` runs of `per` length (run kit) or `n × per` sets (click kit). */
export function kitLines(kit: Kit, n: number, per: number): EstimateLine[] {
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

/** Every material the free-form estimate generates, merged. */
export const estimateLines = (estimate: Estimate, kits: readonly Kit[]): EstimateLine[] =>
  mergeLines(estimate.rows.flatMap((row) => rowLines(row, estimate.units, kits)));

/** One budget line the estimate added to: the item after the change and what was added. */
export interface EstimateResult {
  item: Item;
  added: number;
  /** The line did not exist before. */
  created: boolean;
  /** The generated line it came from (the first one, when several share the item). */
  line: EstimateLine;
}

/** What a result adds to the budget: quantity with the line's waste, times its unit prices. */
export function resultValue(r: Pick<EstimateResult, "item" | "added">): {
  material: number;
  labor: number;
} {
  const qty = r.added * (1 + (r.item.wastePct || 0) / 100);
  return { material: qty * r.item.materialPrice, labor: qty * r.item.laborPrice };
}

/** A new line takes the prices typed in the estimate over the catalog's. */
function withTypedPrice(item: Item, price: LinePrice | undefined, now: number): Item {
  if (!price || (price.material === undefined && price.labor === undefined)) return item;
  const next: Item = { ...item };
  if (price.labor !== undefined) next.laborPrice = price.labor;
  if (price.material !== undefined) {
    // a typed value is the user's own: no longer derived from the R$/kg
    delete next.baseMaterial;
    delete next.kgPerUnit;
    next.materialPrice = price.material;
    next.priceSource = "manual";
    next.priceDate = now;
  }
  return next;
}

/**
 * Add the estimate to the project: each material goes to the line a drawn kit would use (found
 * by catalog code or name, else created and priced from the catalog, or from the price typed in
 * the estimate), its quantity added to the line's typed quantity. With a discipline set, only
 * lines on that tab are reused.
 */
export function applyEstimate(
  project: Project,
  lines: readonly EstimateLine[],
  catalog: Pick<CatalogStore, "remote">,
  entries: readonly CatalogEntry[],
  system?: string,
  now = Date.now(),
): { project: Project; results: EstimateResult[] } {
  let items = project.items;
  const tab = system?.trim() || undefined;
  const added = new Map<string, number>();
  const source = new Map<string, EstimateLine>();
  const before = new Set(items.map((i) => i.id));
  for (const line of lines) {
    const found = componentItem(items, catalog, entries, line, {
      projectSystem: project.system,
      system: tab,
      factor: line.factor,
    });
    items = found.items;
    const id = found.item.id;
    if (!source.has(id)) source.set(id, line);
    added.set(id, (added.get(id) ?? 0) + line.qty);
  }
  items = items.map((i) => {
    const add = added.get(i.id);
    if (!add) return i;
    const priced = before.has(i.id) ? i : withTypedPrice(i, source.get(i.id)?.price, now);
    return { ...priced, manualQty: round((i.manualQty ?? 0) + add) };
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const results = [...source].flatMap(([id, line]) => {
    const item = byId.get(id);
    return item ? [{ item, line, added: round(added.get(id) ?? 0), created: !before.has(id) }] : [];
  });
  return { project: { ...project, items }, results };
}
