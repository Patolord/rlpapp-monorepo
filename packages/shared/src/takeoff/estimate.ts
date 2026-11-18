import { type Kit, type KitComponent, kitMode } from "./kits";

/**
 * Takeoff by estimate: budget lines generated from assumptions instead of the drawing ("20 m of
 * line set per machine, × 12 machines"). The line math lives here because the desktop app (its
 * estimate dialog) and the backend (the estimate tools agents call through MCP) must give the
 * same quantities; how the desktop app puts lines into a project stays in the app.
 */

/** How a line is measured: pieces, a length or an area. */
export type EstimateKind = "count" | "linear" | "area";

/** A material the estimate generates, with its total quantity. */
export interface EstimateLine {
  name: string;
  sku?: string;
  group: string;
  system?: string;
  kind: EstimateKind;
  qty: number;
  /** Item factor a new line takes (a kit's cable both ways), so later drawn runs count alike. */
  factor?: number;
  /**
   * Unit prices typed for this estimate (a machine's value, labour per installation): they win
   * over the catalog's.
   */
  price?: LinePrice;
}

/** Unit prices typed in the estimate; a missing one comes from the catalog. */
export interface LinePrice {
  material?: number;
  labor?: number;
}

/** Accent- and case-insensitive name, as the desktop app compares item names. */
export const foldEstimateName = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Key two lines share when they are the same material (same code, else same name). */
export const lineKey = (l: Pick<EstimateLine, "name" | "sku" | "kind">): string =>
  `${l.kind}:${l.sku?.trim() || foldEstimateName(l.name)}`;

const round = (v: number): number => Math.round(v * 1e4) / 1e4;

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
