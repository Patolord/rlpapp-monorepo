import type { Box, Pt } from "../geom";
import { forEachSegmentNear, type VectorIndex } from "./vectorsCore";

export interface SimilarOptions {
  /** Endpoint tolerance in page points. */
  tol?: number;
  /** Fraction of template segments that must be found at a candidate location. */
  minScore?: number;
  /** Also match the symbol rotated by 90°, 180° and 270°. */
  rotations?: boolean;
  /** Maximum template segments considered (longest first). */
  maxTemplate?: number;
}

export interface SimilarResult {
  /** Centres (page space) of every location matching the template, including the original. */
  centers: Pt[];
  templateSegments: number;
}

const ANGLE_TOL = (2 * Math.PI) / 180;

/**
 * Find every place on the page whose vector geometry repeats the segments inside `box`
 * (translated, optionally rotated by multiples of 90°). Exact for CAD block insertions.
 */
export function findSimilar(idx: VectorIndex, box: Box, opts: SimilarOptions = {}): SimilarResult {
  const tol = opts.tol ?? 0.8;
  const minScore = opts.minScore ?? 0.9;
  const maxTemplate = opts.maxTemplate ?? 400;
  const { segs, count } = idx;

  // template: segments fully inside the box
  const tpl: number[][] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const x1 = segs[o];
    const y1 = segs[o + 1];
    const x2 = segs[o + 2];
    const y2 = segs[o + 3];
    if (
      x1 >= box.minX &&
      x1 <= box.maxX &&
      y1 >= box.minY &&
      y1 <= box.maxY &&
      x2 >= box.minX &&
      x2 <= box.maxX &&
      y2 >= box.minY &&
      y2 <= box.maxY
    ) {
      tpl.push([x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1)]);
    }
  }
  if (tpl.length === 0) return { centers: [], templateSegments: 0 };
  tpl.sort((a, b) => b[4] - a[4]);
  if (tpl.length > maxTemplate) tpl.length = maxTemplate;
  // centre of the template bounding box: where the count mark will be placed
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const t of tpl) {
    minX = Math.min(minX, t[0], t[2]);
    maxX = Math.max(maxX, t[0], t[2]);
    minY = Math.min(minY, t[1], t[3]);
    maxY = Math.max(maxY, t[1], t[3]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rel0 = tpl.map((t) => [t[0] - cx, t[1] - cy, t[2] - cx, t[3] - cy, t[4]]);

  // per-segment length and direction angle (mod π) for the whole page
  const len = new Float32Array(count);
  const ang = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const dx = segs[o + 2] - segs[o];
    const dy = segs[o + 3] - segs[o + 1];
    len[i] = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI - 1e-6) a = 0;
    ang[i] = a;
  }
  const angleClose = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return d <= ANGLE_TOL || Math.abs(d - Math.PI) <= ANGLE_TOL;
  };

  const centers: Pt[] = [];
  const pushCenter = (p: Pt) => {
    for (const c of centers) if (Math.hypot(c.x - p.x, c.y - p.y) <= tol * 4) return;
    centers.push(p);
  };

  const rotations = opts.rotations === false ? [0] : [0, 1, 2, 3];
  for (const rot of rotations) {
    // rotate template around its centre by rot × 90°
    const rel = rel0.map(([x1, y1, x2, y2, l]) => {
      let p = [x1, y1, x2, y2];
      for (let k = 0; k < rot; k++) p = [-p[1], p[0], -p[3], p[2]];
      return [p[0], p[1], p[2], p[3], l];
    });

    // anchor: among the 3 longest template segments, the one with the fewest page candidates
    let anchor = -1;
    let candidates: number[] = [];
    for (let k = 0; k < Math.min(3, rel.length); k++) {
      const t = rel[k];
      const tl = t[4];
      let ta = Math.atan2(t[3] - t[1], t[2] - t[0]);
      if (ta < 0) ta += Math.PI;
      if (ta >= Math.PI - 1e-6) ta = 0;
      const list: number[] = [];
      for (let i = 0; i < count; i++) {
        if (Math.abs(len[i] - tl) <= tol * 2 && angleClose(ang[i], ta)) list.push(i);
        if (list.length > 50_000) break;
      }
      if (anchor < 0 || list.length < candidates.length) {
        anchor = k;
        candidates = list;
      }
    }
    if (anchor < 0) continue;
    const t = rel[anchor];

    const verify = (c: Pt): boolean => {
      const allowedMisses = Math.floor(rel.length * (1 - minScore));
      let misses = 0;
      for (const r of rel) {
        const ex1 = c.x + r[0];
        const ey1 = c.y + r[1];
        const ex2 = c.x + r[2];
        const ey2 = c.y + r[3];
        let found = false;
        forEachSegmentNear(
          idx,
          (ex1 + ex2) / 2,
          (ey1 + ey2) / 2,
          r[4] / 2 + tol,
          (x1, y1, x2, y2) => {
            if (found) return;
            if (
              (Math.abs(x1 - ex1) <= tol &&
                Math.abs(y1 - ey1) <= tol &&
                Math.abs(x2 - ex2) <= tol &&
                Math.abs(y2 - ey2) <= tol) ||
              (Math.abs(x1 - ex2) <= tol &&
                Math.abs(y1 - ey2) <= tol &&
                Math.abs(x2 - ex1) <= tol &&
                Math.abs(y2 - ey1) <= tol)
            ) {
              found = true;
            }
          },
        );
        if (!found && ++misses > allowedMisses) return false;
      }
      return true;
    };

    const tried: Pt[] = [];
    const seen = (p: Pt) => {
      for (const q of tried)
        if (Math.abs(q.x - p.x) <= tol && Math.abs(q.y - p.y) <= tol) return true;
      tried.push(p);
      return false;
    };
    for (const i of candidates) {
      const o = i * 4;
      const x1 = segs[o];
      const y1 = segs[o + 1];
      // the candidate may map onto the anchor in either direction
      const h1 = { x: x1 - t[0], y: y1 - t[1] };
      const h2 = { x: x1 - t[2], y: y1 - t[3] };
      for (const h of [h1, h2]) {
        if (seen(h)) continue;
        if (verify(h)) pushCenter(h);
      }
    }
  }
  return { centers, templateSegments: tpl.length };
}
