/**
 * What a marking looks like, independent of the renderer: the path, symbol or ring it is drawn
 * as, in page space, and the label beside it. The viewer canvas (lib/overlay) and the cutout
 * report (lib/report/write) both paint from here, so the report cannot drift from the screen.
 * Pure: no canvas, no PDF.
 */
import { type Pt, pointAlong, polygonArea, polygonCentroid, polylineLength } from "./geom";
import { type Kit, runLabel } from "./kits";
import { type SymbolDef, symbolDef } from "./symbols";
import type { Item, Measurement } from "./types";
import { formatArea, formatLength, type Kind, type PageScale } from "./units";
import { vrfTag } from "./vrf";

/** How a marking is labelled; the item and measurement fields `markingShapes` reads. */
export interface ShapeOpts {
  /** Count marks: symbol id from lib/symbols (undefined = dot). */
  symbol?: string;
  /** Linear runs: vertical length (project units) appended to the label. */
  vertical?: number;
  /** Times the measurement counts; shown as "×N" when above 1. */
  repeat?: number;
  /** Short prefix for the label (duct section, VRF role and capacity). */
  tag?: string;
  /** The run's label (its own, or its kit's), after the tag and before the quantity. */
  label?: string;
  /**
   * Draw the geometry only, without text: another member of the same kit group carries the
   * label (see `labelCarriers`).
   */
  bare?: boolean;
}

export interface LabelShape {
  text: string;
  /** Anchor in page space. */
  at: Pt;
  /**
   * Shift from the anchor in marker units (screen pixels on the canvas, scaled on paper), y down:
   * the label sits beside a symbol or under a ring rather than on top of it.
   */
  offset?: Pt;
  /**
   * The offset reaches the label's near edge rather than its centre: the label grows away from
   * the point (a count's text beside its symbol, however long).
   */
  beside?: boolean;
}

/** A count: its symbol centred on the point; labelled beside it when it has a label or repeats. */
export interface SymbolShape {
  type: "symbol";
  at: Pt;
  symbol: SymbolDef;
  label?: LabelShape;
}

/** A fixed-length run placed by a click (one point): a ring, its length as the label. */
export interface RingShape {
  type: "ring";
  at: Pt;
  /** Undefined when another member of its kit group carries the label. */
  label?: LabelShape;
}

/** A linear run (open polyline) or an area (closed polygon), its quantity as the label. */
export interface PathShape {
  type: "path";
  points: readonly Pt[];
  closed: boolean;
  /** Undefined when another member of its kit group carries the label. */
  label?: LabelShape;
}

export type MarkingShape = SymbolShape | RingShape | PathShape;

/**
 * Where a count's label (its near edge) goes, and a ring's length (its centre), relative to the
 * point (marker units).
 */
export const SYMBOL_LABEL_OFFSET: Pt = { x: 10, y: -12 };
export const RING_LABEL_OFFSET: Pt = { x: 0, y: 24 };

const repeatSuffix = (repeat: number | undefined): string =>
  repeat && repeat > 1 ? ` ×${repeat}` : "";

/** What goes before the quantity: the duct/VRF tag, then the run's label ("30×20 · VE-01"). */
const labelPrefix = (o: ShapeOpts): string =>
  [o.tag, o.label?.trim()].filter((s): s is string => !!s).join(" · ");

/**
 * The shape of raw points (a marking, a draft being drawn, a preview) of a given kind. Label
 * text: tag · run label · quantity ×repeat ("30×20 · VE-01 · 3.00 m ×2"); a count shows the
 * tag and run label beside its symbol, with ×repeat ("VE-01 · 1.200 m³/h ×3").
 */
export function shapesOf(
  pts: readonly Pt[],
  kind: Kind,
  scale: PageScale | null,
  o: ShapeOpts = {},
): MarkingShape {
  const prefix = labelPrefix(o);
  const withPrefix = (quantity: string) => (prefix ? `${prefix} · ${quantity}` : quantity);
  if (kind === "count") {
    const at = pts[0];
    const text = (prefix + repeatSuffix(o.repeat)).trim();
    return {
      type: "symbol",
      at,
      symbol: symbolDef(o.symbol),
      label: text && !o.bare ? { text, at, offset: SYMBOL_LABEL_OFFSET, beside: true } : undefined,
    };
  }
  if (kind === "linear" && pts.length === 1) {
    const at = pts[0];
    const text =
      withPrefix(formatLength(o.vertical ?? 0, scale?.unit ?? "m")) + repeatSuffix(o.repeat);
    return {
      type: "ring",
      at,
      label: o.bare ? undefined : { text, at, offset: RING_LABEL_OFFSET },
    };
  }
  let text: string;
  let at: Pt;
  if (kind === "linear") {
    const len = polylineLength(pts);
    text = scale
      ? formatLength(len / scale.pointsPerUnit, scale.unit)
      : `${len.toFixed(0)} pt · sem escala`;
    if (o.vertical) text += ` + ${formatLength(o.vertical, scale?.unit ?? "m")} vert.`;
    at = pointAlong(pts, 0.5);
  } else {
    const area = polygonArea(pts);
    text = scale
      ? formatArea(area / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
      : `${area.toFixed(0)} pt² · sem escala`;
    at = polygonCentroid(pts);
  }
  text = withPrefix(text) + repeatSuffix(o.repeat);
  return {
    type: "path",
    points: pts,
    closed: kind === "area",
    label: o.bare ? undefined : { text, at },
  };
}

/** The label prefix of a run: its duct section "40×25" or its VRF role and capacity. */
export function markingTag(m: Measurement, item: Item): string | undefined {
  if (m.duct) return `${m.duct.a}×${m.duct.b}`;
  if (m.vrf) return vrfTag(m.vrf, item.vrf?.hp ?? 0);
  return undefined;
}

/**
 * How a stored marking is labelled: its item's symbol, its own vertical and repeat, its duct/VRF
 * tag and its run label (own override, else its kit's in `kits`, else the saved snapshot).
 */
export function markingOpts(
  m: Measurement,
  item: Item,
  kits?: readonly Kit[] | ReadonlyMap<string, Kit>,
): ShapeOpts {
  return {
    symbol: item.symbol,
    vertical: m.vertical,
    repeat: m.repeat,
    tag: markingTag(m, item),
    label: runLabel(m, kits),
  };
}

/**
 * Which of these markings (those drawn on one page, in project order) carry label text. The
 * members of a kit group overlap exactly, so only one of them is labelled: the longest drawn
 * run (the first of equal ones), else the first count symbol (a click kit: the label goes
 * beside the symbol, not on its rings), else the first member. Unlinked markings always do.
 */
export function labelCarriers(
  ms: Iterable<Measurement>,
  kindOf: (m: Measurement) => Kind | undefined,
): Set<string> {
  const out = new Set<string>();
  const best = new Map<string, { id: string; rank: number; length: number }>();
  for (const m of ms) {
    if (!m.linkId) {
      out.add(m.id);
      continue;
    }
    const kind = kindOf(m);
    const run = kind === "linear" && m.points.length >= 2;
    // runs first (longest wins), then count symbols, then the rest (rings, areas)
    const rank = run ? 0 : kind === "count" ? 1 : 2;
    const length = run ? polylineLength(m.points) : 0;
    const cur = best.get(m.linkId);
    if (!cur || rank < cur.rank || (rank === cur.rank && length > cur.length + 1e-9)) {
      best.set(m.linkId, { id: m.id, rank, length });
    }
  }
  for (const b of best.values()) out.add(b.id);
  return out;
}

/**
 * Painting order for a canvas that draws each label with its marking: the same order, except
 * that a kit group's label carrier moves to the group's last member, so the other members' lines
 * do not cross its label.
 */
export function carriersLast<M extends Measurement>(
  ms: readonly M[],
  carriers: ReadonlySet<string>,
): M[] {
  const last = new Map<string, number>();
  ms.forEach((m, i) => {
    if (m.linkId) last.set(m.linkId, i);
  });
  const held = new Map<string, M>();
  const out: M[] = [];
  ms.forEach((m, i) => {
    const link = m.linkId;
    if (link && carriers.has(m.id) && last.get(link) !== i) {
      held.set(link, m);
      return;
    }
    out.push(m);
    const carrier = link && last.get(link) === i ? held.get(link) : undefined;
    if (carrier) out.push(carrier);
  });
  return out;
}

/**
 * The shape of a stored marking (see `markingOpts`). `points` overrides the stored ones (a
 * marking being dragged); `bare` leaves the text to another member of its kit group.
 */
export function markingShapes(
  m: Measurement,
  item: Item,
  scale: PageScale | null,
  opts: {
    points?: readonly Pt[];
    kits?: readonly Kit[] | ReadonlyMap<string, Kit>;
    bare?: boolean;
  } = {},
): MarkingShape {
  return shapesOf(opts.points ?? m.points, item.kind, scale, {
    ...markingOpts(m, item, opts.kits),
    bare: opts.bare,
  });
}
