export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export function polylineLength(pts: readonly Pt[], closed = false): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) l += dist(pts[pts.length - 1], pts[0]);
  return l;
}

/** Unsigned polygon area (shoelace). */
export function polygonArea(pts: readonly Pt[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function average(pts: readonly Pt[]): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function polygonCentroid(pts: readonly Pt[]): Pt {
  const n = pts.length;
  if (n < 3) return average(pts);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) return average(pts);
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Point at fraction t (0..1) along a polyline's length. */
export function pointAlong(pts: readonly Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const total = polylineLength(pts);
  let target = total * Math.min(1, Math.max(0, t));
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (target <= d || i === pts.length - 1) {
      const k = d === 0 ? 0 : target / d;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k,
      };
    }
    target -= d;
  }
  return pts[pts.length - 1];
}

export function closestOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { pt: a, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return { pt: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  return dist(p, closestOnSegment(p, a, b).pt);
}

export function distToPolyline(p: Pt, pts: readonly Pt[], closed = false): number {
  if (pts.length === 0) return Number.POSITIVE_INFINITY;
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Number.POSITIVE_INFINITY;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const d = distToSegment(p, pts[i], pts[(i + 1) % pts.length]);
    if (d < best) best = d;
  }
  return best;
}

export function pointInPolygon(p: Pt, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function bbox(pts: readonly Pt[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const boxesIntersect = (a: Box, b: Box): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const boxContains = (outer: Box, inner: Box): boolean =>
  inner.minX >= outer.minX &&
  inner.maxX <= outer.maxX &&
  inner.minY >= outer.minY &&
  inner.maxY <= outer.maxY;

/** Snap the direction prev->cur to the nearest multiple of `stepDeg` degrees, keeping length. */
export function orthoSnap(prev: Pt, cur: Pt, stepDeg = 45): Pt {
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return cur;
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: prev.x + Math.cos(ang) * len, y: prev.y + Math.sin(ang) * len };
}

/** Douglas-Peucker simplification. */
export function simplify(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export const translate = (pts: readonly Pt[], dx: number, dy: number): Pt[] =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
