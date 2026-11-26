/**
 * What a first pass usually leaves out, found from the takeoff alone so the agent checks its own
 * work before reporting: equipment marked with no run (refrigerant line, drain, duct) near it,
 * lines off the catalog while the catalog has similar materials, lines on no discipline tab,
 * and lengths on pages without a scale. Each was a real miss of the agent's first runs.
 */
import { aiStats } from "../aiReview";
import type { CatalogEntry } from "../catalog";
import { distToPolyline, type Pt } from "../geom";
import { measurementQty, pageScale } from "../quantities";
import { foldName } from "../text";
import type { Item, Project } from "../types";
import { toBaseUnit } from "../units";
import { rankCatalog } from "./catalogMatch";

/** How far from an equipment a run may end and still be its run, in metres. */
export const RUN_REACH_M = 1.5;
/** The same reach on a page without a scale, in page points. */
const UNSCALED_REACH_PT = 60;

const EQUIPMENT =
  /evaporadora|condensadora|\bsplit\b|hi-?wall|cassete|piso.?teto|fan.?coil|\bvrf\b|\bvrv\b|exaustor|ventilador|splitvent|insuflador/;
/** Accessories named after the equipment they serve, which need no run of their own. */
const ACCESSORY = /suporte|caixa|quadro|modulo|registro|grelha|filtro|controle|mao de obra/;

/** A budget line for a machine that is connected by a run (pipe, drain or duct). */
export const isEquipment = (item: Pick<Item, "name" | "kind">): boolean => {
  const name = foldName(item.name);
  return item.kind === "count" && EQUIPMENT.test(name) && !ACCESSORY.test(name);
};

export type GapKind = "equipment_without_run" | "off_catalog" | "no_discipline" | "unscaled_page";

export interface CoverageGap {
  kind: GapKind;
  message: string;
  item?: string;
  drawing_id?: string;
  page?: number;
  at?: Pt;
  similar?: string[];
}

export interface DisciplineSummary {
  discipline: string;
  lines: number;
  pieces: number;
  /** Measured length, in the takeoff's unit. */
  length: number;
}

export interface CoverageReport {
  disciplines: DisciplineSummary[];
  gaps: CoverageGap[];
  pending_suggestions: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function reviewCoverage(project: Project, catalog: readonly CatalogEntry[]): CoverageReport {
  const gaps: CoverageGap[] = [];
  const items = new Map(project.items.map((i) => [i.id, i]));
  const tab = (i: Item) => i.system?.trim() || project.system.trim();

  // runs: every linear marking, by page
  const runs = new Map<string, Pt[][]>();
  for (const m of project.measurements) {
    if (items.get(m.itemId)?.kind !== "linear" || m.points.length < 2) continue;
    const key = `${m.drawingId}#${m.page}`;
    runs.set(key, [...(runs.get(key) ?? []), m.points]);
  }
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    if (!item || !isEquipment(item)) continue;
    const scale = pageScale(project, m.drawingId, m.page);
    const reach = scale
      ? scale.pointsPerUnit * toBaseUnit(RUN_REACH_M, "m", scale.unit)
      : UNSCALED_REACH_PT;
    const at = m.points[0];
    const near = (runs.get(`${m.drawingId}#${m.page}`) ?? []).some(
      (path) => distToPolyline(at, path) <= reach,
    );
    if (near) continue;
    gaps.push({
      kind: "equipment_without_run",
      item: item.name,
      drawing_id: m.drawingId,
      page: m.page + 1,
      at: { x: round(at.x), y: round(at.y) },
      message: `${item.name}${m.label ? ` ${m.label}` : ""} has no run measured within ${RUN_REACH_M} m. Measure what connects it as drawn (refrigerant line set with a kit, drain, duct) or say in the report why it is not on this drawing (e.g. the riser to another floor).`,
    });
  }

  for (const item of project.items) {
    if (item.derived || item.catalogId) continue;
    const similar = rankCatalog(catalog, item.name, 3).map((r) => r.entry.name);
    if (similar.length === 0) continue;
    gaps.push({
      kind: "off_catalog",
      item: item.name,
      similar,
      message: `"${item.name}" is not a catalog material. Check whether one of the similar materials is its equivalent (the drawing's brand is usually a reference); if so, the line should use it.`,
    });
  }

  const untabbed = project.items.filter((i) => !i.derived && !tab(i));
  const tabs = new Set(project.items.map(tab).filter(Boolean));
  if (untabbed.length > 0) {
    gaps.push({
      kind: "no_discipline",
      message: `${untabbed.length} line(s) on no discipline tab${tabs.size > 0 ? `, while others are on ${[...tabs].join(", ")}` : ""}: ${untabbed.map((i) => i.name).join("; ")}. Each system on the drawing (exhaust, pressurisation, fire detection, AC...) is its own tab: create_item again with "discipline".`,
    });
  }

  for (const d of project.drawings) {
    d.pages.forEach((pm, page) => {
      if (pm.scale) return;
      const measured = project.measurements.some(
        (m) => m.drawingId === d.id && m.page === page && items.get(m.itemId)?.kind !== "count",
      );
      if (measured) {
        gaps.push({
          kind: "unscaled_page",
          drawing_id: d.id,
          page: page + 1,
          message: `Page ${page + 1} of ${d.name} has lengths or areas but no scale: they count as zero until set_scale.`,
        });
      }
    });
  }

  const byTab = new Map<string, DisciplineSummary>();
  for (const item of project.items) {
    if (item.derived) continue;
    const name = tab(item) || "(sem disciplina)";
    const row = byTab.get(name) ?? { discipline: name, lines: 0, pieces: 0, length: 0 };
    row.lines++;
    byTab.set(name, row);
  }
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    if (!item || item.derived) continue;
    const row = byTab.get(tab(item) || "(sem disciplina)");
    if (!row) continue;
    if (item.kind === "count") row.pieces++;
    else if (item.kind === "linear") {
      row.length += measurementQty(m, "linear", pageScale(project, m.drawingId, m.page)) ?? 0;
    }
  }

  return {
    disciplines: [...byTab.values()].map((r) => ({ ...r, length: round(r.length) })),
    gaps,
    pending_suggestions: aiStats(project).pending,
  };
}
