/**
 * Where the cutout report puts a marking's label (the quantity pill). On screen the pill sits on
 * the marking's anchor; on paper it would often cover the drawing's own text (room names, areas)
 * or another pill. Here each label gets a few candidate spots near its marking and takes the one
 * that overlaps least with the labels already placed, the sheet's text and the frame's edge.
 * Pure geometry in output space (PDF points, y up); the writer measures and draws.
 */
import type { Box, Pt } from "../geom";
import type { MarkingShape } from "../markingShapes";

export interface LabelSize {
  w: number;
  h: number;
}

/** Gap between a run and a label set beside it, output points. */
const GAP = 3;

/** The label's box centred on `c`. */
export const labelBox = (c: Pt, s: LabelSize): Box => ({
  minX: c.x - s.w / 2,
  minY: c.y - s.h / 2,
  maxX: c.x + s.w / 2,
  maxY: c.y + s.h / 2,
});

/** Area shared by two boxes. */
export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Point at fraction `t` of a polyline's length, with the unit normal of its segment there. */
function alongWithNormal(pts: readonly Pt[], t: number): { p: Pt; n: Pt } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let target = t * total;
  for (let i = 1; i < pts.length; i++) {
    const l = lens[i - 1];
    if (target <= l || i === pts.length - 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = l > 0 ? Math.min(Math.max(target / l, 0), 1) : 0;
      const dx = l > 0 ? (b.x - a.x) / l : 1;
      const dy = l > 0 ? (b.y - a.y) / l : 0;
      // the normal that points up the page (y up) first, so "above" is tried before "below"
      const n = dx >= 0 ? { x: -dy, y: dx } : { x: dy, y: -dx };
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, n };
    }
    target -= l;
  }
  return { p: pts[0], n: { x: 0, y: 1 } };
}

/**
 * Candidate centres of a marking's label, in output space, preferred first.
 *
 * - Runs: on the run at 0.5, 0.3 and 0.7 of its length, then beside it (above, then below) at
 *   those points, then a step further out.
 * - Areas: the centroid, then above and below it, then to the sides.
 * - Symbols and rings: the screen's offset, then its mirror images.
 *
 * `toFrame` maps page space to output space; `unit` is output points per marker unit (the
 * screen pixels `LabelShape.offset` is given in).
 */
export function labelCandidates(
  shape: MarkingShape,
  toFrame: (p: Pt) => Pt,
  size: LabelSize,
  unit: number,
): Pt[] {
  const label = shape.label;
  if (!label) return [];
  const at = toFrame(label.at);
  if (shape.type === "path" && !shape.closed && shape.points.length >= 2) {
    const pts = shape.points.map(toFrame);
    const ts = [0.5, 0.3, 0.7];
    const on = ts.map((t) => alongWithNormal(pts, t));
    const out: Pt[] = on.map((o) => o.p);
    for (const ring of [0, 1]) {
      for (const { p, n } of on) {
        // far enough along the normal that the box clears the run
        const d =
          (Math.abs(n.x) * size.w + Math.abs(n.y) * size.h) / 2 + GAP + ring * (size.h + GAP);
        out.push({ x: p.x + n.x * d, y: p.y + n.y * d });
        out.push({ x: p.x - n.x * d, y: p.y - n.y * d });
      }
    }
    return out;
  }
  if (shape.type === "path") {
    const dy = size.h + GAP;
    const dx = size.w / 2 + size.h;
    return [
      at,
      { x: at.x, y: at.y + dy },
      { x: at.x, y: at.y - dy },
      { x: at.x, y: at.y + 2 * dy },
      { x: at.x, y: at.y - 2 * dy },
      { x: at.x - dx, y: at.y },
      { x: at.x + dx, y: at.y },
    ];
  }
  // symbol or ring: the offset (marker units, y down) and its mirrors
  const off = label.offset ?? { x: 0, y: 0 };
  const flips: [number, number][] =
    off.x === 0
      ? [
          [1, 1],
          [1, -1],
        ]
      : [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];
  const out = flips.map(([fx, fy]) => ({
    x: at.x + fx * off.x * unit,
    y: at.y - fy * off.y * unit,
  }));
  if (off.x === 0) {
    // a ring: also to either side
    const dx = size.w / 2 + Math.abs(off.y) * unit * 0.6;
    out.push({ x: at.x + dx, y: at.y }, { x: at.x - dx, y: at.y });
  }
  return out;
}

export interface LabelObstacles {
  /** Labels already placed on the page: overlapping one is the worst. */
  labels: readonly Box[];
  /** The source sheet's text and the markings' symbols: avoid covering them. */
  text: readonly Box[];
  /** The frame: a label poking out of it is clipped. */
  bounds?: Box;
}

const LABEL_WEIGHT = 4;
const TEXT_WEIGHT = 1;
const OUTSIDE_WEIGHT = 3;

/** How bad a label box is: weighted overlap with the obstacles and area outside the frame. */
export function labelCost(box: Box, o: LabelObstacles): number {
  let cost = 0;
  for (const b of o.labels) cost += LABEL_WEIGHT * overlapArea(box, b);
  for (const b of o.text) cost += TEXT_WEIGHT * overlapArea(box, b);
  if (o.bounds) {
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    cost += OUTSIDE_WEIGHT * (area - overlapArea(box, o.bounds));
  }
  return cost;
}

/**
 * The candidate whose label box costs least; the earliest wins a tie, so a label with nothing
 * in the way stays where the screen puts it. Undefined when there are no candidates.
 */
export function placeLabel(
  candidates: readonly Pt[],
  size: LabelSize,
  o: LabelObstacles,
): { at: Pt; box: Box } | undefined {
  let best: { at: Pt; box: Box } | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const box = labelBox(c, size);
    const cost = labelCost(box, o);
    if (cost < bestCost - 1e-6) {
      best = { at: c, box };
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best;
}
