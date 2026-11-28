/**
 * Review of the markings an AI agent created (`ai` on measurements and regions, see lib/agent).
 * A suggestion waits until the user accepts it, changes it (which also approves it) or discards
 * it. The counts are the "how much did it get right" signal of everyday use: accepted as drawn,
 * accepted after a correction, discarded. Pure: the store commits the results as undo steps.
 */
import { type AiReview, type Project, pruneLocations } from "./types";

/** The review state a suggestion takes when the user changes its geometry. */
export const touchedAi = (ai: AiReview | undefined): AiReview | undefined =>
  ai === "suggested" ? "edited" : ai;

export interface AiStats {
  /** Suggestions still waiting for the user. */
  pending: number;
  /** Approved exactly as the agent drew them. */
  accepted: number;
  /** Approved after the user changed their geometry. */
  edited: number;
  /** Discarded by the user before being accepted. */
  rejected: number;
}

export function aiStats(project: Project): AiStats {
  const stats: AiStats = { pending: 0, accepted: 0, edited: 0, rejected: project.aiRejected ?? 0 };
  for (const x of [...project.measurements, ...project.zones]) {
    if (x.ai === "suggested") stats.pending++;
    else if (x.ai === "accepted") stats.accepted++;
    else if (x.ai === "edited") stats.edited++;
  }
  return stats;
}

/** Share of the reviewed suggestions that were kept as drawn (0..1); null before any review. */
export function acceptanceRate(stats: AiStats): number | null {
  const reviewed = stats.accepted + stats.edited + stats.rejected;
  return reviewed === 0 ? null : stats.accepted / reviewed;
}

/** Ids of the suggestions still waiting, optionally only those on one page of one drawing. */
export function pendingAiIds(
  project: Project,
  where?: { drawingId: string | null; page: number },
): string[] {
  const here = (x: { drawingId: string; page: number }) =>
    !where || (x.drawingId === where.drawingId && x.page === where.page);
  return [
    ...project.zones.filter((z) => z.ai === "suggested" && here(z)),
    ...project.measurements.filter((m) => m.ai === "suggested" && here(m)),
  ].map((x) => x.id);
}

/**
 * The ids plus every other member of their kit groups: a kit run is reviewed as one, like it is
 * selected, moved and deleted as one.
 */
function withGroups(project: Project, ids: Iterable<string>): Set<string> {
  const want = new Set(ids);
  const links = new Set<string>();
  for (const m of project.measurements) if (m.linkId && want.has(m.id)) links.add(m.linkId);
  if (links.size > 0) {
    for (const m of project.measurements) if (m.linkId && links.has(m.linkId)) want.add(m.id);
  }
  return want;
}

/** Accept the pending suggestions among `ids` (all pending ones when omitted). */
export function acceptAi(project: Project, ids?: Iterable<string>): Project {
  const want = ids ? withGroups(project, ids) : null;
  const hit = (x: { id: string; ai?: AiReview }) =>
    x.ai === "suggested" && (!want || want.has(x.id));
  if (!project.measurements.some(hit) && !project.zones.some(hit)) return project;
  return {
    ...project,
    measurements: project.measurements.map((m) => (hit(m) ? { ...m, ai: "accepted" } : m)),
    zones: project.zones.map((z) => (hit(z) ? { ...z, ai: "accepted" } : z)),
  };
}

/**
 * Discard the pending suggestions among `ids` (all pending ones when omitted): they are removed
 * and counted as rejected. Markings already reviewed, or drawn by a person, are left alone.
 */
export function rejectAi(project: Project, ids?: Iterable<string>): Project {
  const want = ids ? withGroups(project, ids) : null;
  const hit = (x: { id: string; ai?: AiReview }) =>
    x.ai === "suggested" && (!want || want.has(x.id));
  const n = project.measurements.filter(hit).length + project.zones.filter(hit).length;
  if (n === 0) return project;
  return pruneLocations({
    ...project,
    measurements: project.measurements.filter((m) => !hit(m)),
    zones: project.zones.filter((z) => !hit(z)),
    aiRejected: (project.aiRejected ?? 0) + n,
  });
}

/**
 * How many of the markings about to be deleted are pending suggestions: deleting one with the
 * Delete key is a rejection too, and is counted as one.
 */
export const pendingAmong = (project: Project, ids: Iterable<string>): number => {
  const want = new Set(ids);
  return [...project.measurements, ...project.zones].filter(
    (x) => want.has(x.id) && x.ai === "suggested",
  ).length;
};
