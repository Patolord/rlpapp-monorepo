/**
 * What a marking looks like, independent of the renderer: the path, symbol or ring it is drawn
 * as, in page space, and the label beside it. The viewer canvas (lib/overlay) and the cutout
 * report (lib/report/write) both paint from here, so the report cannot drift from the screen.
 * Pure: no canvas, no PDF.
 */
import { type Pt, pointAlong, polygonArea, polygonCentroid, polylineLength } from "./geom";
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
}

/** A count: its symbol centred on the point; labelled only when it repeats. */
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
  label: LabelShape;
}

/** A linear run (open polyline) or an area (closed polygon), its quantity as the label. */
export interface PathShape {
  type: "path";
  points: readonly Pt[];
  closed: boolean;
  label: LabelShape;
}

export type MarkingShape = SymbolShape | RingShape | PathShape;

/** Where a count's "×N" goes, and a ring's length, relative to the point (marker units). */
export const SYMBOL_LABEL_OFFSET: Pt = { x: 14, y: -12 };
export const RING_LABEL_OFFSET: Pt = { x: 0, y: 24 };

const repeatSuffix = (repeat: number | undefined): string =>
  repeat && repeat > 1 ? ` ×${repeat}` : "";

/** The shape of raw points (a marking, a draft being drawn, a preview) of a given kind. */
export function shapesOf(
  pts: readonly Pt[],
  kind: Kind,
  scale: PageScale | null,
  o: ShapeOpts = {},
): MarkingShape {
  if (kind === "count") {
    const at = pts[0];
    return {
      type: "symbol",
      at,
      symbol: symbolDef(o.symbol),
      label:
        o.repeat && o.repeat > 1
          ? { text: `×${o.repeat}`, at, offset: SYMBOL_LABEL_OFFSET }
          : undefined,
    };
  }
  if (kind === "linear" && pts.length === 1) {
    const at = pts[0];
    const text = formatLength(o.vertical ?? 0, scale?.unit ?? "m") + repeatSuffix(o.repeat);
    return { type: "ring", at, label: { text, at, offset: RING_LABEL_OFFSET } };
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
  if (o.tag) text = `${o.tag} · ${text}`;
  text += repeatSuffix(o.repeat);
  return { type: "path", points: pts, closed: kind === "area", label: { text, at } };
}

/** The label prefix of a run: its duct section "40×25" or its VRF role and capacity. */
export function markingTag(m: Measurement, item: Item): string | undefined {
  if (m.duct) return `${m.duct.a}×${m.duct.b}`;
  if (m.vrf) return vrfTag(m.vrf, item.vrf?.hp ?? 0);
  return undefined;
}

/**
 * The shape of a stored marking with its item's symbol and its own vertical, repeat and
 * duct/VRF tag. `points` overrides the stored ones (a marking being dragged).
 */
export function markingShapes(
  m: Measurement,
  item: Item,
  scale: PageScale | null,
  opts: { points?: readonly Pt[] } = {},
): MarkingShape {
  return shapesOf(opts.points ?? m.points, item.kind, scale, {
    symbol: item.symbol,
    vertical: m.vertical,
    repeat: m.repeat,
    tag: markingTag(m, item),
  });
}
