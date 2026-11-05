/**
 * Copies of markings (measurements and location regions) for copy/paste and duplicate. Pure:
 * the store decides where the copies go and commits them as one undo step.
 */
import { bbox, type Pt } from "./geom";
import { type Location, type Measurement, newId, type Project, type Zone } from "./types";
import type { PageScale } from "./units";

/** Where copies land: one page of one drawing. */
export interface CloneTarget {
  drawingId: string;
  page: number;
}

/** Markings to copy from: the project, or a clipboard taken from it earlier. */
export type MarkingSource = Pick<Project, "measurements" | "zones">;

/**
 * Markings copied with Ctrl+C, kept in memory for the session (never saved). The markings are
 * the originals as they were when copied, so a paste still works after they are moved or
 * deleted; `locations` are those of the copied regions, to bring back a location whose last
 * region was deleted meanwhile. `anchor` is the centre of the copied markings' bounding box:
 * a paste at the cursor puts it under the cursor.
 */
export interface Clipboard extends MarkingSource {
  locations: Location[];
  anchor: Pt;
}

/**
 * Copies the markings with the given ids onto `target`, every point through `transform`. Each
 * copy gets a fresh id. Kit groups stay grouped among the copies under new link ids, apart from
 * the originals. A VRF run that continued another (`parent`) continues the copy of it when that
 * run is copied too; otherwise the parent is dropped and the copy joins whatever it touches.
 * Everything else (item, duct section, VRF role, vertical, repeat, a region's location) is kept.
 */
export function cloneMarkings(
  source: MarkingSource,
  ids: Iterable<string>,
  target: CloneTarget,
  transform: (p: Pt) => Pt,
): { measurements: Measurement[]; zones: Zone[] } {
  const want = new Set(ids);
  const picked = source.measurements.filter((m) => want.has(m.id));
  const newIds = new Map(picked.map((m) => [m.id, newId()]));
  const newLinks = new Map<string, string>();
  const linkOf = (old: string) => {
    let id = newLinks.get(old);
    if (!id) {
      id = newId();
      newLinks.set(old, id);
    }
    return id;
  };
  const move = (pts: readonly Pt[]): Pt[] =>
    pts.map((p) => {
      const q = transform(p);
      return { x: q.x, y: q.y };
    });

  const measurements = picked.map((m): Measurement => {
    const copy: Measurement = {
      ...m,
      id: newIds.get(m.id) ?? newId(),
      drawingId: target.drawingId,
      page: target.page,
      points: move(m.points),
    };
    if (m.linkId) copy.linkId = linkOf(m.linkId);
    if (m.duct) copy.duct = { ...m.duct };
    if (m.vrf) {
      const { parent, ...spec } = m.vrf;
      const copiedParent = parent ? newIds.get(parent) : undefined;
      copy.vrf = copiedParent ? { ...spec, parent: copiedParent } : spec;
    }
    return copy;
  });

  const zones = source.zones
    .filter((z) => want.has(z.id))
    .map(
      (z): Zone => ({
        ...z,
        id: newId(),
        drawingId: target.drawingId,
        page: target.page,
        points: move(z.points),
      }),
    );

  return { measurements, zones };
}

/** The clipboard for the markings with the given ids, or null when none of them exists. */
export function clipboardOf(project: Project, ids: Iterable<string>): Clipboard | null {
  const want = new Set(ids);
  const measurements = project.measurements.filter((m) => want.has(m.id));
  const zones = project.zones.filter((z) => want.has(z.id));
  if (measurements.length === 0 && zones.length === 0) return null;
  const used = new Set(zones.map((z) => z.locationId));
  const locations = project.locations.filter((l) => used.has(l.id));
  const box = bbox([...measurements.flatMap((m) => m.points), ...zones.flatMap((z) => z.points)]);
  const anchor = Number.isFinite(box.minX)
    ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    : { x: 0, y: 0 };
  return { measurements, zones, locations, anchor };
}

/**
 * Whether two page scales would give different quantities for the same geometry: one page
 * calibrated and the other not, another unit, or another number of points per unit.
 */
export function scalesDiffer(a: PageScale | null, b: PageScale | null): boolean {
  if (!a || !b) return a !== b;
  if (a.unit !== b.unit) return true;
  return Math.abs(a.pointsPerUnit - b.pointsPerUnit) > 1e-9 * Math.max(1, a.pointsPerUnit);
}
