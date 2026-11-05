/**
 * Report pages as the preview handles them, pure: a stable key per planned page, leaving pages
 * out of a plan (the preview's "incluir" checkboxes) with every page reference renumbered, and
 * the box the viewer zooms to when the user goes from a page to its drawing.
 *
 * Leaving pages out never changes what the report measured: the cover's per-location and grand
 * totals stay as planned (they describe the locations, not the printed pages) and the cover gets
 * a note listing the omitted pages. Skipping a key map keeps its cluster and tile pages; skipping
 * a tile drops its frame from the key map (a frame always points at a printed page); skipping
 * every page of a region or location is allowed.
 */
import type { Box } from "../geom";
import { pagesLabel, type ReportPage, type ReportPlan, type Size } from "./plan";

/**
 * A key for a planned page that survives re-planning when the page itself does not change:
 * drawing, sheet, location, region, kind and part ("folha A2", "trecho 1 de 3"). Settings that
 * do not move pages around (prices, labels, wash-out, cover, another location ticked) keep the
 * keys of the other pages; paper or legibility floor changes re-tile and give tiles new keys.
 */
export function pageKey(p: ReportPage): string {
  return [p.drawingId, p.page, p.locationId ?? "*", p.regionId ?? "*", p.kind, p.label ?? ""].join(
    "|",
  );
}

/** Keys of a plan's pages, in order; a repeated key (should not happen) gets a `#n` suffix. */
export function pageKeys(plan: ReportPlan): string[] {
  const seen = new Map<string, number>();
  return plan.pages.map((p) => {
    const k = pageKey(p);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n === 0 ? k : `${k}#${n}`;
  });
}

/**
 * The plan without some of its pages (plan indices), renumbered: `index`, key-map
 * `frames[].pageIndex` (frames of omitted pages are dropped), `alsoIn[].pageIndex` (moved to the
 * first printed page of that sheet's region, dropped when none is printed) and the cover's
 * `pages`/`pagesLabel` per location. Totals stay as planned; `omitted` lists the headings left
 * out for the cover's note. Returns the plan itself when nothing is skipped.
 */
export function withoutPages(plan: ReportPlan, skipped: Iterable<number>): ReportPlan {
  const drop = new Set([...skipped].filter((i) => i >= 0 && i < plan.pages.length));
  if (drop.size === 0) return plan;
  const newIndex = new Map<number, number>();
  for (const p of plan.pages) if (!drop.has(p.index)) newIndex.set(p.index, newIndex.size);
  /** First printed page showing a location on a sheet (what "também em" points at). */
  const firstPrinted = (locationId: string | null, drawingId: string, page: number) =>
    plan.pages.find(
      (p) =>
        !drop.has(p.index) &&
        p.locationId === locationId &&
        p.drawingId === drawingId &&
        p.page === page,
    );
  const pages: ReportPage[] = plan.pages
    .filter((p) => !drop.has(p.index))
    .map((p) => {
      const out: ReportPage = {
        ...p,
        index: newIndex.get(p.index)!,
        alsoIn: p.alsoIn.flatMap((s) => {
          const first = firstPrinted(p.locationId, s.drawingId, s.page);
          return first ? [{ ...s, pageIndex: newIndex.get(first.index)! }] : [];
        }),
      };
      if (p.frames) {
        out.frames = p.frames
          .filter((f) => newIndex.has(f.pageIndex))
          .map((f) => ({ ...f, pageIndex: newIndex.get(f.pageIndex)! }));
      }
      return out;
    });
  const omitted = plan.pages.filter((p) => drop.has(p.index));
  return {
    ...plan,
    pages,
    cover: {
      ...plan.cover,
      locations: plan.cover.locations.map((l) => {
        const kept = l.pages.filter((i) => newIndex.has(i));
        return {
          ...l,
          pages: kept.map((i) => newIndex.get(i)!),
          pagesLabel:
            kept.length === 0 ? "omitido" : pagesLabel(kept.map((i) => plan.pages[i].kind)),
        };
      }),
    },
    omitted: [...(plan.omitted ?? []), ...omitted.map((p) => p.heading)],
  };
}

/** Plan indices of the pages whose key is in `skipped`. */
export function skippedIndices(plan: ReportPlan, skipped: Iterable<string>): number[] {
  const set = new Set(skipped);
  if (set.size === 0) return [];
  return pageKeys(plan).flatMap((k, i) => (set.has(k) ? [i] : []));
}

/** The cover's note on omitted pages ("2 páginas omitidas"), undefined when none was. */
export function omittedNote(plan: ReportPlan): string | undefined {
  const n = plan.omitted?.length ?? 0;
  if (n === 0) return undefined;
  return n === 1
    ? "1 página omitida; os totais da capa incluem os itens dela."
    : `${n} páginas omitidas; os totais da capa incluem os itens delas.`;
}

/**
 * The page-space box the viewer zooms to for a report page: its crop, limited to the sheet when
 * the sheet's size is known (a crop larger than the sheet is centred on it and pokes out).
 */
export function cropFocusBox(page: Pick<ReportPage, "crop">, sheet?: Size): Box {
  const c = page.crop;
  if (!sheet) return { ...c };
  const box = {
    minX: Math.max(c.minX, 0),
    minY: Math.max(c.minY, 0),
    maxX: Math.min(c.maxX, sheet.width),
    maxY: Math.min(c.maxY, sheet.height),
  };
  return box.maxX > box.minX && box.maxY > box.minY ? box : { ...c };
}
