/**
 * Moving markings from one revision of a drawing to the next: the similarity transform (shift,
 * uniform scale, rotation) two pairs of reference points define, and the remapping of a
 * drawing's markings, locations and page scales onto the new PDF's pages. Pure functions.
 */
import type { Pt } from "./geom";
import {
  type Drawing,
  type DrawingRevision,
  type Measurement,
  type PageMeta,
  type Project,
  pruneLocations,
  type Zone,
} from "./types";
import { type PageScale, ratioLabel } from "./units";

/**
 * x' = a·x − b·y + tx, y' = b·x + a·y + ty: a rotation and uniform scale (the complex number
 * a + ib) followed by a shift. Kept as data, not a closure, so it can be saved with the
 * revision and drawn as a CSS matrix by the compare overlay.
 */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Similarity = { a: 1, b: 0, tx: 0, ty: 0 };

/** Old page index → new page index (null drops that page's markings), one entry per old page. */
export type PageMap = (number | null)[];

/** Most revisions a drawing remembers (the oldest are forgotten first). */
export const MAX_REVISIONS = 10;

export const applySimilarity = (t: Similarity, p: Pt): Pt => ({
  x: t.a * p.x - t.b * p.y + t.tx,
  y: t.b * p.x + t.a * p.y + t.ty,
});

/** The point transform as a function, for callers that only map points. */
export const pointTransform =
  (t: Similarity) =>
  (p: Pt): Pt =>
    applySimilarity(t, p);

/**
 * The similarity that takes a1 to b1 and a2 to b2 (two reference points clicked on the old
 * page, then the same two on the new one). Null when either pair is a single point.
 */
export function similarityFrom2Points(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Similarity | null {
  const ux = a2.x - a1.x;
  const uy = a2.y - a1.y;
  const vx = b2.x - b1.x;
  const vy = b2.y - b1.y;
  const uu = ux * ux + uy * uy;
  if (uu < 1e-12 || vx * vx + vy * vy < 1e-12) return null;
  // (a + ib) = v / u in complex numbers
  const a = (vx * ux + vy * uy) / uu;
  const b = (vy * ux - vx * uy) / uu;
  return { a, b, tx: b1.x - a * a1.x + b * a1.y, ty: b1.y - b * a1.x - a * a1.y };
}

/** Length ratio of a transform: 2 when the new page draws everything twice as large. */
export const scaleOf = (t: Similarity): number => Math.hypot(t.a, t.b);

/** Rotation of a transform, radians (positive turns x toward y, i.e. clockwise on screen). */
export const rotationOf = (t: Similarity): number => Math.atan2(t.b, t.a);

export function invertSimilarity(t: Similarity): Similarity {
  const k = t.a * t.a + t.b * t.b;
  const a = t.a / k;
  const b = -t.b / k;
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) };
}

export const isIdentity = (t: Similarity | null | undefined, eps = 1e-9): boolean =>
  !t ||
  (Math.abs(t.a - 1) < eps && Math.abs(t.b) < eps && Math.abs(t.tx) < eps && Math.abs(t.ty) < eps);

/**
 * A page scale carried through a transform: a drawing re-plotted twice as large has twice the
 * points per real unit, so the measured quantities stay the same.
 */
export function adjustScale(scale: PageScale | null, t: Similarity | null): PageScale | null {
  if (!scale || !t) return scale;
  const k = scaleOf(t);
  if (Math.abs(k - 1) < 1e-6) return scale;
  const pointsPerUnit = scale.pointsPerUnit * k;
  return { ...scale, pointsPerUnit, label: `${ratioLabel(pointsPerUnit, scale.unit)} (ajustada)` };
}

/** Do two page sizes differ by more than half a percent (a re-plot, not rounding)? */
export const sizeDiffers = (a: { w: number; h: number }, b: { w: number; h: number }): boolean =>
  Math.abs(a.w - b.w) > 0.005 * Math.max(a.w, b.w) ||
  Math.abs(a.h - b.h) > 0.005 * Math.max(a.h, b.h);

/** Page i to page i while both PDFs have it; the old pages past the new count are dropped. */
export const defaultPageMap = (oldCount: number, newCount: number): PageMap =>
  Array.from({ length: oldCount }, (_, i) => (i < newCount ? i : null));

/** The old page shown under a new page by the compare overlay (null: none maps there). */
export function oldPageFor(rev: DrawingRevision, newPage: number): number | null {
  if (!rev.pageMap) return newPage;
  const i = rev.pageMap.indexOf(newPage);
  return i < 0 ? null : i;
}

type Marking = { drawingId: string; page: number; points: Pt[] };

/**
 * Markings and regions of one drawing moved onto the new revision's pages: each takes the page
 * its old page maps to and the points that page's transform gives; those on unmapped pages are
 * left out (`dropped` counts them). Other drawings' markings are returned untouched.
 */
export function transformMarkings<M extends Marking, Z extends Marking>(
  measurements: readonly M[],
  zones: readonly Z[],
  drawingId: string,
  pageMap: PageMap,
  transforms: readonly (Similarity | null)[],
): { measurements: M[]; zones: Z[]; dropped: number } {
  let dropped = 0;
  const move = <T extends Marking>(list: readonly T[]): T[] => {
    const out: T[] = [];
    for (const m of list) {
      if (m.drawingId !== drawingId) {
        out.push(m);
        continue;
      }
      const page = pageMap[m.page] ?? null;
      if (page === null) {
        dropped++;
        continue;
      }
      const t = transforms[m.page] ?? null;
      if (page === m.page && isIdentity(t)) {
        out.push(m);
        continue;
      }
      out.push({
        ...m,
        page,
        points: !t || isIdentity(t) ? m.points : m.points.map((p) => applySimilarity(t, p)),
      });
    }
    return out;
  };
  return { measurements: move(measurements), zones: move(zones), dropped };
}

/**
 * Page metadata of the new revision: a new page takes the scale of the first old page mapped to
 * it, adjusted by that page's transform; pages nothing maps to start without a scale.
 */
export function remapPages(
  pages: readonly PageMeta[],
  pageMap: PageMap,
  transforms: readonly (Similarity | null)[],
  pageCount: number,
): PageMeta[] {
  return Array.from({ length: pageCount }, (_, j) => {
    const i = pageMap.indexOf(j);
    if (i < 0) return { scale: null };
    const old = pages[i] ?? { scale: null };
    return { ...old, scale: adjustScale(old.scale, transforms[i] ?? null) };
  });
}

/** Markings and regions of a drawing on pages the map drops (what the user is warned about). */
export function droppedCount(p: Project, drawingId: string, pageMap: PageMap): number {
  const gone = (m: { drawingId: string; page: number }) =>
    m.drawingId === drawingId && (pageMap[m.page] ?? null) === null;
  return p.measurements.filter(gone).length + p.zones.filter(gone).length;
}

export interface RevisionInput {
  path: string;
  name: string;
  pageMap: PageMap;
  transforms: readonly (Similarity | null)[];
  /** Pages of the new PDF. */
  pageCount: number;
  /** When it was replaced (ms since epoch). */
  now: number;
}

/**
 * The project with a drawing pointed at a new revision of its PDF: the old file goes to the
 * drawing's revision history (with the page map and transforms, for the compare overlay), the
 * pages, markings and regions follow the map and transforms, and locations left without a region
 * are dropped. Returns the same project when the drawing does not exist.
 */
export function applyRevision(p: Project, drawingId: string, input: RevisionInput): Project {
  const d = p.drawings.find((x) => x.id === drawingId);
  if (!d) return p;
  const { pageMap, transforms } = input;
  const keep = transforms.map((t) => (t && !isIdentity(t) ? t : null));
  const revisions: DrawingRevision[] = [...(d.revisions ?? [])];
  if (d.path) {
    revisions.push({
      path: d.path,
      name: d.name,
      replacedAt: input.now,
      pageMap: [...pageMap],
      ...(keep.some(Boolean) ? { transforms: keep } : {}),
    });
  }
  const drawing: Drawing = {
    ...d,
    path: input.path,
    name: input.name,
    pages: remapPages(d.pages, pageMap, keep, input.pageCount),
    revisions: revisions.slice(-MAX_REVISIONS),
  };
  const moved = transformMarkings<Measurement, Zone>(
    p.measurements,
    p.zones,
    drawingId,
    pageMap,
    keep,
  );
  return pruneLocations({
    ...p,
    drawings: p.drawings.map((x) => (x.id === drawingId ? drawing : x)),
    measurements: moved.measurements,
    zones: moved.zones,
  });
}
