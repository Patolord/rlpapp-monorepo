/**
 * Reshaping a marking by its vertices: the new points of the marking itself and of the markings
 * that follow it. Kit members share the geometry of the run they were drawn with, and duct and
 * VRF runs joined at the dragged endpoint keep meeting there. The Viewer previews the result
 * while dragging and the store commits it as one undo step.
 */
import type { Pt } from "./geom";
import type { Project } from "./types";
import { type JoinRun, joinedEnds, type RunEnd, withEnd } from "./vrfTree";

/** Run ends that follow one end of a run (see `joinedEnds`). */
export interface Joined {
  /** The end being dragged: the first (0) or last (1) point of the run. */
  end: 0 | 1;
  mates: RunEnd[];
}

/**
 * Ends of the other runs of the same duct network or VRF system joined to vertex `index` of a
 * run on its page; null when the vertex is not an endpoint or nothing is joined there.
 */
export function joinedAt(project: Project, id: string, index: number): Joined | null {
  const m = project.measurements.find((x) => x.id === id);
  if (!m || (!m.vrf && !m.duct) || m.points.length < 2) return null;
  const end = index === 0 ? 0 : index === m.points.length - 1 ? 1 : null;
  if (end === null) return null;
  const runs: JoinRun[] = project.measurements.filter(
    (r) =>
      r.drawingId === m.drawingId &&
      r.page === m.page &&
      r.itemId === m.itemId &&
      (m.vrf ? !!r.vrf : !!r.duct) &&
      r.points.length >= 2,
  );
  const mates = joinedEnds(runs, id, end);
  return mates.length ? { end, mates } : null;
}

/**
 * New points, by marking id, that give measurement or zone `id` the points `points`: the marking,
 * its kit members (a single-point member, such as a counted fitting, keeps to the first point)
 * and, with `joined`, the joined run ends moved to the dragged end's new place.
 */
export function reshape(
  project: Project,
  id: string,
  points: Pt[],
  joined?: Joined | null,
): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>();
  if (project.zones.some((z) => z.id === id)) {
    out.set(id, points);
    return out;
  }
  const m = project.measurements.find((x) => x.id === id);
  if (!m) return out;
  out.set(id, points);
  if (m.linkId) {
    for (const s of project.measurements) {
      if (s.id === id || s.linkId !== m.linkId) continue;
      out.set(s.id, s.points.length === 1 ? [points[0]] : points);
    }
  }
  if (joined && points.length >= 2) {
    const to = joined.end === 0 ? points[0] : points[points.length - 1];
    const byId = new Map(project.measurements.map((x) => [x.id, x]));
    for (const e of joined.mates) {
      const pts = out.get(e.id) ?? byId.get(e.id)?.points;
      if (pts && pts.length >= 2) out.set(e.id, withEnd(pts, e.end, to));
    }
  }
  return out;
}
