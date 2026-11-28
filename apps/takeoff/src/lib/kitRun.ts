/**
 * One drawn kit run as a project edit: a linked measurement per kit component, the budget lines
 * created from the catalog as needed (see componentItem.ts). Shared by the Kit tool (the store)
 * and the AI agent, which draws on any drawing and stamps its runs for review.
 */
import type { Kit } from "@rlpapp/shared/takeoff/kits";
import { type CatalogStore, mergeCatalog } from "./catalog";
import { componentItem } from "./componentItem";
import type { Pt } from "./geom";
import { kitLabelSnapshot, kitMode } from "./kits";
import { type AiReview, type Measurement, newId, type Project } from "./types";

export interface KitRun {
  drawingId: string;
  page: number;
  /** The drawn run; a click kit uses only the first point. */
  points: Pt[];
  /**
   * "Marcar em": the discipline every component is budgeted under, taking over from each
   * item's own (the same kit is AC Pesado in the garage and AC Leve in the party room).
   */
  drawSystem?: string | null;
  /** Review state stamped on the measurements when an AI agent drew the run. */
  ai?: AiReview;
}

/** The project with the kit run added; the same project when the kit or the run is empty. */
export function kitRun(project: Project, catalog: CatalogStore, kit: Kit, run: KitRun): Project {
  if (kit.components.length === 0 || run.points.length === 0) return project;
  const linkId = newId();
  const entries = mergeCatalog(catalog);
  const byClick = kitMode(kit) === "count";
  // the run remembers its kit (its label follows the kit) and the label as drawn, for when
  // the catalog no longer has the kit
  const kitLabel = kitLabelSnapshot(kit);
  let items = project.items;
  const measurements: Measurement[] = [...project.measurements];
  for (const c of kit.components) {
    const found = componentItem(items, catalog, entries, c, {
      projectSystem: project.system,
      // a click kit's linear factor is the length per click, kept on the measurement
      factor: byClick && c.kind === "linear" ? undefined : c.factor,
    });
    items = found.items;
    const item = found.item;
    measurements.push({
      id: newId(),
      itemId: item.id,
      drawingId: run.drawingId,
      page: run.page,
      points: c.kind === "count" || byClick ? [run.points[0]] : run.points,
      linkId,
      kitId: kit.id,
      ...(kitLabel !== undefined ? { kitLabel } : {}),
      vertical: byClick && c.kind === "linear" && c.factor > 0 ? c.factor : undefined,
      ...(run.drawSystem && !item.derived ? { system: run.drawSystem } : {}),
      ...(run.ai ? { ai: run.ai } : {}),
    });
  }
  return { ...project, items, measurements };
}
