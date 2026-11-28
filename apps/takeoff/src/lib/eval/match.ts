/**
 * Geometry matching for the takeoff comparison (compare.ts): which mark of one takeoff is the
 * same mark in the other, and how much two outlines overlap. Pure.
 */
import { bbox, boxesIntersect, dist, type Pt, pointInPolygon } from "../geom";

/** Samples per side of the grid that estimates polygon overlap. */
const IOU_GRID = 48;

/**
 * Intersection over union of two polygons, 0..1, estimated by sampling a grid over their common
 * bounding box (exact clipping is not worth its weight here: within about a percent is plenty
 * to tell "the same room" from "a different one").
 */
export function polygonIoU(a: readonly Pt[], b: readonly Pt[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const ba = bbox(a);
  const bb = bbox(b);
  if (!boxesIntersect(ba, bb)) return 0;
  const minX = Math.min(ba.minX, bb.minX);
  const minY = Math.min(ba.minY, bb.minY);
  const w = Math.max(ba.maxX, bb.maxX) - minX;
  const h = Math.max(ba.maxY, bb.maxY) - minY;
  if (w <= 0 || h <= 0) return 0;
  let both = 0;
  let either = 0;
  for (let i = 0; i < IOU_GRID; i++) {
    for (let j = 0; j < IOU_GRID; j++) {
      const p = { x: minX + ((i + 0.5) / IOU_GRID) * w, y: minY + ((j + 0.5) / IOU_GRID) * h };
      const inA = pointInPolygon(p, a);
      const inB = pointInPolygon(p, b);
      if (inA && inB) both++;
      if (inA || inB) either++;
    }
  }
  return either === 0 ? 0 : both / either;
}

export interface Pairing {
  /** Index pairs [reference, candidate] matched to each other, each index used at most once. */
  pairs: [number, number][];
  /** Reference indexes left without a match. */
  missed: number[];
  /** Candidate indexes left without a match. */
  extra: number[];
}

/**
 * One-to-one matching by score: the best-scoring pair first, then the next best among what is
 * left. `score` returns null for a pair that must not match (too far, too little overlap).
 */
export function pairUp(
  refCount: number,
  candCount: number,
  score: (ref: number, cand: number) => number | null,
): Pairing {
  const options: { r: number; c: number; s: number }[] = [];
  for (let r = 0; r < refCount; r++) {
    for (let c = 0; c < candCount; c++) {
      const s = score(r, c);
      if (s !== null) options.push({ r, c, s });
    }
  }
  options.sort((x, y) => y.s - x.s);
  const usedR = new Set<number>();
  const usedC = new Set<number>();
  const pairs: [number, number][] = [];
  for (const o of options) {
    if (usedR.has(o.r) || usedC.has(o.c)) continue;
    usedR.add(o.r);
    usedC.add(o.c);
    pairs.push([o.r, o.c]);
  }
  const rest = (n: number, used: Set<number>) =>
    Array.from({ length: n }, (_, i) => i).filter((i) => !used.has(i));
  return { pairs, missed: rest(refCount, usedR), extra: rest(candCount, usedC) };
}

/** Match points one to one, nearest first, never farther apart than `tolerance`. */
export const pairPoints = (ref: readonly Pt[], cand: readonly Pt[], tolerance: number): Pairing =>
  pairUp(ref.length, cand.length, (r, c) => {
    const d = dist(ref[r], cand[c]);
    return d <= tolerance ? -d : null;
  });

export interface Rates {
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

/**
 * Precision (how much of what the candidate marked is right), recall (how much of the reference
 * it found) and their harmonic mean. A side with nothing to judge is null, not zero or one; two
 * empty sides agree perfectly.
 */
export function rates(matched: number, missed: number, extra: number): Rates {
  if (matched + missed + extra === 0) return { precision: 1, recall: 1, f1: 1 };
  const precision = matched + extra === 0 ? null : matched / (matched + extra);
  const recall = matched + missed === 0 ? null : matched / (matched + missed);
  const f1 = (2 * matched) / (2 * matched + missed + extra);
  return { precision, recall, f1 };
}
