import type { Pt } from "../geom";

/** Affine matrix in PDF order [a b c d e f]. */
export type Mat = [number, number, number, number, number, number];

/** ctm × t : apply `t` first, then `ctm` (same as canvas ctx.transform). */
export const mul = (m: Mat, t: Mat): Mat => [
  m[0] * t[0] + m[2] * t[1],
  m[1] * t[0] + m[3] * t[1],
  m[0] * t[2] + m[2] * t[3],
  m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4],
  m[1] * t[4] + m[3] * t[5] + m[5],
];

/** pdf.js DrawOPS codes used inside constructPath data. */
const D_MOVE = 0;
const D_LINE = 1;
const D_CURVE = 2;
const D_QUAD = 3;
const D_CLOSE = 4;

export const CELL = 16; // page points per grid cell
export const MAX_SEGMENTS = 3_000_000;
const CURVE_STEPS = 8;

/**
 * Spatial index of line segments in CSR layout: `keys` are the sorted cell keys,
 * cell k holds segment ids `ids[starts[k] .. starts[k+1])`.
 */
export interface VectorIndex {
  /** Flat x1,y1,x2,y2 in page space. */
  segs: Float32Array;
  count: number;
  cell: number;
  keys: Float64Array;
  starts: Int32Array;
  ids: Int32Array;
  stamp: Uint32Array;
  stampGen: number;
}

export type SnapKind = "end" | "mid" | "on";

export interface SnapHit extends Pt {
  kind: SnapKind;
}

export const cellKey = (cx: number, cy: number): number => (cx + 0x8000) * 0x10000 + (cy + 0x8000);

/** Flatten one constructPath data array into segments (page space) appended to `out`. */
export function walkPath(d: ArrayLike<number>, m: Mat, out: number[]): void {
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let px = 0;
  let py = 0;
  const tx = (x: number, y: number) => {
    px = m[0] * x + m[2] * y + m[4];
    py = m[1] * x + m[3] * y + m[5];
  };
  const line = (x: number, y: number) => {
    if (x !== cx || y !== cy) out.push(cx, cy, x, y);
    cx = x;
    cy = y;
  };
  const n = d.length;
  let i = 0;
  while (i < n && out.length < MAX_SEGMENTS * 4) {
    switch (d[i++]) {
      case D_MOVE:
        tx(d[i], d[i + 1]);
        i += 2;
        cx = sx = px;
        cy = sy = py;
        break;
      case D_LINE:
        tx(d[i], d[i + 1]);
        i += 2;
        line(px, py);
        break;
      case D_CURVE: {
        tx(d[i], d[i + 1]);
        const x1 = px;
        const y1 = py;
        tx(d[i + 2], d[i + 3]);
        const x2 = px;
        const y2 = py;
        tx(d[i + 4], d[i + 5]);
        const x3 = px;
        const y3 = py;
        i += 6;
        const x0 = cx;
        const y0 = cy;
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS;
          const u = 1 - t;
          const a = u * u * u;
          const b = 3 * u * u * t;
          const c = 3 * u * t * t;
          const e = t * t * t;
          line(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
        }
        break;
      }
      case D_QUAD: {
        tx(d[i], d[i + 1]);
        const x1 = px;
        const y1 = py;
        tx(d[i + 2], d[i + 3]);
        const x2 = px;
        const y2 = py;
        i += 4;
        const x0 = cx;
        const y0 = cy;
        for (let k = 1; k <= CURVE_STEPS; k++) {
          const t = k / CURVE_STEPS;
          const u = 1 - t;
          line(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
        }
        break;
      }
      case D_CLOSE:
        line(sx, sy);
        break;
      default:
        return;
    }
  }
}

/** Build the CSR grid index for a flat segment array. Pure and synchronous (runs in a worker). */
export function buildIndex(segs: Float32Array, cell = CELL): VectorIndex {
  const count = segs.length / 4;
  // pass 1: collect (key, id) pairs
  let cap = Math.max(16, count * 3);
  let pairKey = new Float64Array(cap);
  let pairId = new Int32Array(cap);
  let n = 0;
  const push = (key: number, id: number) => {
    if (n === cap) {
      cap *= 2;
      const nk = new Float64Array(cap);
      nk.set(pairKey);
      pairKey = nk;
      const ni = new Int32Array(cap);
      ni.set(pairId);
      pairId = ni;
    }
    pairKey[n] = key;
    pairId[n] = id;
    n++;
  };
  const counts = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const x1 = segs[i * 4];
    const y1 = segs[i * 4 + 1];
    const x2 = segs[i * 4 + 2];
    const y2 = segs[i * 4 + 3];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.min(4096, Math.ceil(len / (cell / 2)));
    let last = -1;
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const key = cellKey(
        Math.floor((x1 + (x2 - x1) * t) / cell),
        Math.floor((y1 + (y2 - y1) * t) / cell),
      );
      if (key !== last) {
        push(key, i);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        last = key;
      }
    }
  }
  // pass 2: sorted keys, prefix sums, scatter ids
  const keys = Float64Array.from(counts.keys()).sort();
  const starts = new Int32Array(keys.length + 1);
  const slot = new Map<number, number>();
  for (let k = 0; k < keys.length; k++) {
    slot.set(keys[k], k);
    starts[k + 1] = starts[k] + (counts.get(keys[k]) ?? 0);
  }
  const cursor = Int32Array.from(starts.subarray(0, keys.length));
  const ids = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    const k = slot.get(pairKey[p]) as number;
    ids[cursor[k]++] = pairId[p];
  }
  return { segs, count, cell, keys, starts, ids, stamp: new Uint32Array(count), stampGen: 0 };
}

/** Visit every indexed segment that passes within roughly `r` of (x, y). */
export function forEachSegmentNear(
  idx: VectorIndex,
  x: number,
  y: number,
  r: number,
  fn: (x1: number, y1: number, x2: number, y2: number, i: number) => void,
): void {
  const { segs, cell, keys, starts, ids } = idx;
  if (++idx.stampGen === 0xffffffff) {
    idx.stamp.fill(0);
    idx.stampGen = 1;
  }
  const gen = idx.stampGen;
  const c0x = Math.floor((x - r) / cell);
  const c1x = Math.floor((x + r) / cell);
  const c0y = Math.floor((y - r) / cell);
  const c1y = Math.floor((y + r) / cell);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const k = findCell(keys, cellKey(cx, cy));
      if (k < 0) continue;
      for (let q = starts[k]; q < starts[k + 1]; q++) {
        const i = ids[q];
        if (idx.stamp[i] === gen) continue;
        idx.stamp[i] = gen;
        const o = i * 4;
        fn(segs[o], segs[o + 1], segs[o + 2], segs[o + 3], i);
      }
    }
  }
}

function findCell(keys: Float64Array, key: number): number {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = keys[mid];
    if (v === key) return mid;
    if (v < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Nearest snap target within `r` page units of `p`: endpoints first, then midpoints, then on-line. */
export function snapPoint(idx: VectorIndex, p: Pt, r: number): SnapHit | null {
  const { segs, cell, keys, starts, ids } = idx;
  if (++idx.stampGen === 0xffffffff) {
    idx.stamp.fill(0);
    idx.stampGen = 1;
  }
  const gen = idx.stampGen;
  const c0x = Math.floor((p.x - r) / cell);
  const c1x = Math.floor((p.x + r) / cell);
  const c0y = Math.floor((p.y - r) / cell);
  const c1y = Math.floor((p.y + r) / cell);
  let endD = r;
  let endX = 0;
  let endY = 0;
  let midD = r;
  let midX = 0;
  let midY = 0;
  let onD = r;
  let onX = 0;
  let onY = 0;
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const k = findCell(keys, cellKey(cx, cy));
      if (k < 0) continue;
      for (let q = starts[k]; q < starts[k + 1]; q++) {
        const i = ids[q];
        if (idx.stamp[i] === gen) continue;
        idx.stamp[i] = gen;
        const o = i * 4;
        const x1 = segs[o];
        const y1 = segs[o + 1];
        const x2 = segs[o + 2];
        const y2 = segs[o + 3];
        const d1 = Math.hypot(p.x - x1, p.y - y1);
        if (d1 < endD) {
          endD = d1;
          endX = x1;
          endY = y1;
        }
        const d2 = Math.hypot(p.x - x2, p.y - y2);
        if (d2 < endD) {
          endD = d2;
          endX = x2;
          endY = y2;
        }
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dm = Math.hypot(p.x - mx, p.y - my);
        if (dm < midD) {
          midD = dm;
          midX = mx;
          midY = my;
        }
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        if (l2 > 0) {
          const t = ((p.x - x1) * dx + (p.y - y1) * dy) / l2;
          if (t > 0 && t < 1) {
            const qx = x1 + dx * t;
            const qy = y1 + dy * t;
            const dq = Math.hypot(p.x - qx, p.y - qy);
            if (dq < onD) {
              onD = dq;
              onX = qx;
              onY = qy;
            }
          }
        }
      }
    }
  }
  if (endD < r) return { x: endX, y: endY, kind: "end" };
  if (midD < r * 0.7) return { x: midX, y: midY, kind: "mid" };
  if (onD < r * 0.7) return { x: onX, y: onY, kind: "on" };
  return null;
}

/** Worker message shapes. */
export interface IndexRequest {
  id: number;
  /** All path data concatenated; path i spans data[offsets[i] .. offsets[i+1]). */
  data: Float32Array;
  offsets: Int32Array;
  /** 6 numbers per path. */
  mats: Float32Array;
  cell: number;
}

export interface IndexResponse {
  id: number;
  segs: Float32Array;
  keys: Float64Array;
  starts: Int32Array;
  ids: Int32Array;
  ms: number;
}

/** Walk every path with its matrix and build the index: the worker's job, also usable synchronously. */
export function indexPaths(req: IndexRequest): IndexResponse {
  const t0 = performance.now();
  const out: number[] = [];
  const n = req.offsets.length - 1;
  const m: Mat = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 6; k++) m[k] = req.mats[i * 6 + k];
    walkPath(req.data.subarray(req.offsets[i], req.offsets[i + 1]), m, out);
    if (out.length >= MAX_SEGMENTS * 4) break;
  }
  const idx = buildIndex(Float32Array.from(out), req.cell);
  return {
    id: req.id,
    segs: idx.segs,
    keys: idx.keys,
    starts: idx.starts,
    ids: idx.ids,
    ms: performance.now() - t0,
  };
}

export function fromResponse(r: IndexResponse, cell: number): VectorIndex {
  const count = r.segs.length / 4;
  return {
    segs: r.segs,
    count,
    cell,
    keys: r.keys,
    starts: r.starts,
    ids: r.ids,
    stamp: new Uint32Array(count),
    stampGen: 0,
  };
}
