/**
 * What the agent has looked at closely enough to read, per drawing page. An agent that never
 * zooms into part of a sheet misses what is written only there: the first real takeoff left
 * out the antechamber grilles, specified only in callouts at the foot of the sheet. view_page
 * records each picture; review_takeoff reports the parts of the page never seen readable.
 */
import type { PageSize, Region } from "./context";

/** Picture pixels per page point from which text of a drawing is readable. */
export const READABLE_PX_PER_PT = 1.5;
/** Side of the cells the page is checked in, in page points. */
const CELL_PT = 150;

export interface PageCoverage {
  /** Share of the page's cells seen at a readable zoom. */
  seen: number;
  /** Regions not seen yet, a row of adjacent cells merged into one. */
  unseen: Region[];
}

export class ViewLog {
  private readonly pages = new Map<string, Region[]>();

  /** A picture the agent got; only a readable one counts. */
  record(drawingId: string, page: number, region: Region, pxPerPt: number): void {
    if (pxPerPt < READABLE_PX_PER_PT) return;
    const key = `${drawingId}#${page}`;
    this.pages.set(key, [...(this.pages.get(key) ?? []), region]);
  }

  /** Which parts of a 0-based page were never in a readable picture. */
  coverage(drawingId: string, page: number, size: PageSize): PageCoverage {
    const views = this.pages.get(`${drawingId}#${page}`) ?? [];
    const cols = Math.max(1, Math.ceil(size.w / CELL_PT));
    const rows = Math.max(1, Math.ceil(size.h / CELL_PT));
    const unseen: Region[] = [];
    let seenCells = 0;
    for (let r = 0; r < rows; r++) {
      const y = r * CELL_PT;
      const h = Math.min(CELL_PT, size.h - y);
      let run: Region | null = null;
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_PT;
        const w = Math.min(CELL_PT, size.w - x);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const seen = views.some(
          (v) => cx >= v.x && cx <= v.x + v.w && cy >= v.y && cy <= v.y + v.h,
        );
        if (seen) {
          seenCells++;
          run = null;
        } else if (run) {
          run.w += w;
        } else {
          run = { x, y, w, h };
          unseen.push(run);
        }
      }
    }
    return { seen: seenCells / (rows * cols), unseen };
  }
}
