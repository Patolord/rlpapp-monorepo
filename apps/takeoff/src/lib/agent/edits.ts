/**
 * The edits an AI agent may make to a takeoff, as pure functions over the project. Everything
 * the agent draws is stamped `ai: "suggested"`, so the user reviews it (see lib/aiReview); the
 * agent can take back its own pending suggestions and nothing else.
 */
import { type CatalogEntry, type CatalogStore, kindForUnit } from "../catalog";
import { componentItem } from "../componentItem";
import { dist, type Pt } from "../geom";
import { foldName } from "../text";
import {
  type Item,
  type Location,
  locationByName,
  type Measurement,
  newId,
  type PageMeta,
  type Project,
  pruneLocations,
  ZONE_COLORS,
  type Zone,
} from "../types";
import type { Kind, PageScale } from "../units";

/** Where a marking goes: one 0-based page of one drawing. */
export interface Target {
  drawingId: string;
  page: number;
}

/**
 * Set the scale of one page (or of every page) of a drawing. `pageCount` is the PDF's page
 * count: a drawing never shown in the app has no page list yet.
 */
export function withPageScale(
  project: Project,
  target: Target,
  scale: PageScale,
  pageCount: number,
  allPages = false,
): Project {
  return {
    ...project,
    drawings: project.drawings.map((d) => {
      if (d.id !== target.drawingId) return d;
      const n = Math.max(pageCount, d.pages.length, target.page + 1);
      const pages: PageMeta[] = Array.from({ length: n }, (_, i) => {
        const pm = d.pages[i] ?? { scale: null };
        return allPages || i === target.page ? { ...pm, scale } : pm;
      });
      return { ...d, pages };
    }),
  };
}

/**
 * A region of a location (ambiente) suggested by the agent. It joins the location of that name
 * when there is one (the same room on another sheet), else creates it.
 */
export function addAiZone(
  project: Project,
  target: Target,
  name: string,
  points: Pt[],
  repeat?: number,
): { project: Project; zone: Zone; location: Location; created: boolean } {
  const existing = locationByName(project, name);
  const location: Location = existing ?? {
    id: newId(),
    name: name.trim(),
    color: ZONE_COLORS[project.locations.length % ZONE_COLORS.length],
  };
  const zone: Zone = {
    id: newId(),
    locationId: location.id,
    drawingId: target.drawingId,
    page: target.page,
    points,
    ...(repeat && repeat > 1 ? { repeat: Math.round(repeat) } : {}),
    ai: "suggested",
  };
  return {
    project: {
      ...project,
      locations: existing ? project.locations : [...project.locations, location],
      zones: [...project.zones, zone],
    },
    zone,
    location,
    created: !existing,
  };
}

/** Count marks of one item closer than this (page points) are the same mark placed twice. */
export const SAME_MARK_PT = 3;

/**
 * Measurements of one item suggested by the agent, one per shape: a single point for a count
 * item, a polyline for a linear one, a polygon for an area. A count mark on top of an existing
 * mark of the same item is skipped, so a repeated call does not double the count.
 */
export function addAiMeasurements(
  project: Project,
  target: Target,
  item: Item,
  shapeList: Pt[][],
  opts: { label?: string; repeat?: number } = {},
): { project: Project; ids: string[]; skipped: number } {
  const taken: Pt[] =
    item.kind === "count"
      ? project.measurements
          .filter(
            (m) =>
              m.itemId === item.id && m.drawingId === target.drawingId && m.page === target.page,
          )
          .map((m) => m.points[0])
      : [];
  const added: Measurement[] = [];
  let skipped = 0;
  for (const points of shapeList) {
    if (item.kind === "count") {
      if (taken.some((q) => dist(q, points[0]) <= SAME_MARK_PT)) {
        skipped++;
        continue;
      }
      taken.push(points[0]);
    }
    added.push({
      id: newId(),
      itemId: item.id,
      drawingId: target.drawingId,
      page: target.page,
      points: item.kind === "count" ? [points[0]] : points,
      ...(opts.label?.trim() ? { label: opts.label.trim() } : {}),
      ...(opts.repeat && opts.repeat > 1 ? { repeat: Math.round(opts.repeat) } : {}),
      ai: "suggested",
    });
  }
  if (added.length === 0) return { project, ids: [], skipped };
  return {
    project: { ...project, measurements: [...project.measurements, ...added] },
    ids: added.map((m) => m.id),
    skipped,
  };
}

/**
 * Take back suggestions that are still pending (with the rest of their kit groups). Markings a
 * person drew or already reviewed stay; they are reported in `kept`. Not counted as rejected:
 * the agent correcting itself is not the user's verdict.
 */
export function removeAiSuggestions(
  project: Project,
  ids: readonly string[],
): { project: Project; removed: string[]; kept: string[] } {
  const want = new Set(ids);
  const links = new Set<string>();
  for (const m of project.measurements) {
    if (m.linkId && want.has(m.id) && m.ai === "suggested") links.add(m.linkId);
  }
  const hit = (x: Measurement | Zone) =>
    x.ai === "suggested" &&
    (want.has(x.id) || ("linkId" in x && !!x.linkId && links.has(x.linkId)));
  const removed = [...project.measurements, ...project.zones].filter(hit).map((x) => x.id);
  const gone = new Set(removed);
  const kept = ids.filter((id) => !gone.has(id));
  if (removed.length === 0) return { project, removed, kept };
  return {
    project: pruneLocations({
      ...project,
      measurements: project.measurements.filter((m) => !gone.has(m.id)),
      zones: project.zones.filter((z) => !gone.has(z.id)),
    }),
    removed,
    kept,
  };
}

export interface ItemSpec {
  name: string;
  /** Required for an item the catalog does not carry; a catalog material's unit decides it. */
  kind?: Kind;
  group?: string;
  /** Discipline (budget tab). */
  system?: string;
}

/** The catalog entry of exactly this name (accents and case aside), if any. */
export const catalogEntryNamed = (
  entries: readonly CatalogEntry[],
  name: string,
): CatalogEntry | undefined => {
  const key = foldName(name.trim());
  return entries.find((e) => foldName(e.name) === key);
};

/**
 * The budget line for a material: the existing line of that name (or linked to that catalog
 * material), else a new one, priced from the catalog when the catalog has it. Null when the
 * material is not in the catalog and no kind was given.
 */
export function findOrCreateItem(
  project: Project,
  catalog: Pick<CatalogStore, "remote">,
  entries: readonly CatalogEntry[],
  spec: ItemSpec,
): { project: Project; item: Item; created: boolean; fromCatalog: boolean } | null {
  const entry = catalogEntryNamed(entries, spec.name);
  const kind = spec.kind ?? (entry ? kindForUnit(entry.unit) : undefined);
  if (!kind) return null;
  const found = componentItem(
    project.items,
    catalog,
    entries,
    {
      name: entry?.name ?? spec.name.trim(),
      sku: entry?.sku,
      group: spec.group?.trim() || entry?.group || "",
      system: spec.system?.trim() || undefined,
      kind,
    },
    { projectSystem: project.system, system: spec.system?.trim() || undefined },
  );
  const created = !project.items.some((i) => i.id === found.item.id);
  return {
    project: found.items === project.items ? project : { ...project, items: found.items },
    item: found.item,
    created,
    fromCatalog: !!entry,
  };
}
