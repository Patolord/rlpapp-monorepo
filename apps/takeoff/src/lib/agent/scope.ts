/**
 * Whether the agent quantified everything the sheet asks for: the inventory it read (each
 * schedule row and each callout, with the quantity written or counted) against what it marked,
 * and the parts of each page it never looked at closely enough to read. The first real takeoff
 * left out the antechamber grilles, specified only in callouts at the foot of the sheet that the
 * agent never zoomed into: nothing it did would have shown the miss.
 */
import type { Project } from "../types";
import type { CoverageGap } from "./coverage";
import type { PageCoverage } from "./viewLog";

/** One thing the sheet asks for, as the agent read it. */
export interface ExpectedEntry {
  /** Where it was read and what it says: "Quadro SS-05 (x3)", "Chamada: grelha 50x30 antecâmara". */
  source: string;
  /** The budget line that quantifies it. */
  itemId?: string;
  /** Pieces the sheet says or the agent counted (count lines only). */
  quantity?: number;
  /** Why it is not marked (another sheet, by others, a doubt for the user). */
  note?: string;
}

export interface PageSeen {
  drawingId: string;
  drawingName: string;
  /** 0-based. */
  page: number;
  coverage: PageCoverage;
}

/** Regions listed per page before the rest is summed up. */
const REGION_LIMIT = 12;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const r0 = (v: number) => Math.round(v);

export function inventoryGaps(
  project: Project,
  expected: readonly ExpectedEntry[] | undefined,
): CoverageGap[] {
  if (!expected) {
    return [
      {
        kind: "no_inventory",
        message:
          'Call review_takeoff again with "expected": one entry per schedule row and per callout on the sheet (a note with a leader naming a grille, louver, fan, detector...), each with the item_id that quantifies it and the quantity written or counted, or a note saying why it is not marked. Callouts away from the plan (at the foot or side of the sheet) are scope too.',
      },
    ];
  }
  const gaps: CoverageGap[] = [];
  const items = new Map(project.items.map((i) => [i.id, i]));
  const wanted = new Map<string, { quantity: number; sources: string[] }>();
  for (const e of expected) {
    if (!e.itemId) {
      if (!e.note?.trim()) {
        gaps.push({
          kind: "inventory",
          message: `"${e.source}" is on the sheet but quantified by no line: mark it, or give it a note saying why not.`,
        });
      }
      continue;
    }
    const item = items.get(e.itemId);
    if (!item) {
      gaps.push({
        kind: "inventory",
        message: `"${e.source}": no line has the id ${e.itemId}. Use the item_id create_item returned.`,
      });
      continue;
    }
    if (e.quantity === undefined || item.kind !== "count") continue;
    const w = wanted.get(item.id) ?? { quantity: 0, sources: [] };
    w.quantity += e.quantity;
    w.sources.push(e.source);
    wanted.set(item.id, w);
  }
  for (const [id, w] of wanted) {
    const item = items.get(id);
    if (!item) continue;
    const marked = project.measurements.filter((m) => m.itemId === id).length;
    if (marked !== w.quantity) {
      gaps.push({
        kind: "inventory",
        item: item.name,
        message: `${item.name}: the sheet asks for ${w.quantity} (${w.sources.join("; ")}) and ${marked} are marked. Find the missing ones (the same callout often points at several places) or correct the count.`,
      });
    }
  }
  return gaps;
}

export function unviewedGaps(pages: readonly PageSeen[]): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const p of pages) {
    const { seen, unseen } = p.coverage;
    if (unseen.length === 0) continue;
    const regions = unseen
      .slice(0, REGION_LIMIT)
      .map((r) => ({ x: r0(r.x), y: r0(r.y), w: r0(r.w), h: r0(r.h) }));
    gaps.push({
      kind: "unviewed_area",
      drawing_id: p.drawingId,
      page: p.page + 1,
      regions,
      message: `Page ${p.page + 1} of ${p.drawingName}: ${pct(seen)} seen at a readable zoom. Look at the regions listed${unseen.length > REGION_LIMIT ? ` (and ${unseen.length - REGION_LIMIT} more)` : ""} with view_page, a few hundred points at a time: callouts, notes and symbols written only there are part of the takeoff. Blank paper is quick to clear.`,
    });
  }
  return gaps;
}
