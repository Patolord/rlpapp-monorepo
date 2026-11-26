/**
 * How close a takeoff (the candidate: what the AI agent produced) is to the one a person closed
 * for the same drawings (the reference). The score comes from the two files alone, with no
 * model judging: locations found and how well their outlines overlap, count marks in the right
 * place on the right item, quantities per budget line and the scale of each page.
 *
 * Only what can be read on the drawing is compared. Quantities typed by hand, vertical lengths
 * (risers the plan does not show) and the lines the app derives (duct networks, VRF systems)
 * are left out: the agent had no way to know them. Equivalent ways of drawing the same thing
 * (one region with repeat 20, or twenty regions) score the same in the quantities.
 */
import { type AiStats, aiStats } from "../aiReview";
import type { Pt } from "../geom";
import { itemUnit, measurementQty, pageScale, repeatOf } from "../quantities";
import { foldName } from "../text";
import { type Item, locationKey, locationOf, type Project } from "../types";
import type { Kind } from "../units";
import {
  type CatalogReport,
  compareCatalog,
  compareDisciplines,
  type DisciplinesReport,
} from "./lines";
import { pairPoints, pairUp, polygonIoU, type Rates, rates } from "./match";

export interface CompareOptions {
  /** Farthest apart two count marks may be and still be the same mark, in page points. */
  tolerancePt?: number;
  /** Least overlap (intersection over union) for two outlines to be the same location. */
  minIoU?: number;
  /** A page's scale is right when it is within this fraction of the reference's. */
  scaleTolerance?: number;
}

export const DEFAULT_TOLERANCE_PT = 15;
export const DEFAULT_MIN_IOU = 0.5;
export const DEFAULT_SCALE_TOLERANCE = 0.01;

/** Where something is: the reference's drawing (id and name) and the page, from 1. */
export interface Place {
  drawingId: string;
  drawing: string;
  page: number;
}

export interface LocationMatch extends Place {
  name: string;
  candidateName: string;
  nameMatches: boolean;
  iou: number;
  reference: Pt[];
  candidate: Pt[];
}

export interface LocationMiss extends Place {
  name: string;
  points: Pt[];
}

export interface LocationsReport extends Rates {
  matched: LocationMatch[];
  /** In the reference, not found by the candidate. */
  missed: LocationMiss[];
  /** Marked by the candidate, not in the reference. */
  extra: LocationMiss[];
  /** Mean overlap of the matched outlines; null when none matched. */
  meanIoU: number | null;
  /** Share of the matched locations whose name is the reference's; null when none matched. */
  namesRight: number | null;
}

export interface CountMark extends Place {
  item: string;
  at: Pt;
}

export interface CountItemReport extends Rates {
  item: string;
  matched: number;
  missed: number;
  extra: number;
}

export interface CountsReport extends Rates {
  items: CountItemReport[];
  matched: CountMark[];
  missed: CountMark[];
  extra: CountMark[];
  /** Missed marks that the candidate did mark at that spot, but on another item. */
  wrongItem: number;
}

export interface QuantityRow {
  item: string;
  kind: Kind;
  unit: string;
  reference: number;
  candidate: number;
  /** (candidate − reference) / reference; null when the reference has none of it. */
  error: number | null;
  /** "missing": the candidate has no such line. "extra": the reference has none. */
  status: "both" | "missing" | "extra";
}

export interface QuantitiesReport {
  rows: QuantityRow[];
  /**
   * Σ|candidate − reference| × unit price over Σ reference × unit price, at the reference's
   * prices: the quantity error weighed by what each line costs. Null when nothing is priced.
   */
  valueError: number | null;
  /** Σ|candidate − reference| / Σ reference per kind (units do not mix); null when none. */
  byKind: Record<Kind, number | null>;
  /** Candidate measurements on pages without a scale: they count as zero. */
  candidateUnscaled: number;
}

export interface ScaleRow extends Place {
  reference: string;
  candidate: string | null;
  ok: boolean;
}

export interface EvalReport {
  reference: string;
  candidate: string;
  /** Reference drawings the candidate does not have (by file name). */
  drawingsMissing: string[];
  locations: LocationsReport;
  counts: CountsReport;
  quantities: QuantitiesReport;
  scales: { pages: ScaleRow[]; wrong: number };
  /** Whether each quantity sits on the reference's discipline tab. */
  disciplines: DisciplinesReport;
  /** Candidate lines off the catalog, and the ones where an equivalent existed. */
  catalog: CatalogReport;
  /** The candidate's own review counts (suggestions accepted, corrected, discarded), if any. */
  review: AiStats;
  /** Reference lines left out of the comparison, by reason. */
  notCompared: { derived: string[]; typedByHand: string[] };
}

/**
 * Reference drawing id → candidate drawing id, one to one: by file name (drawings that share a
 * name pair up in order, each candidate used once); by position when no name matches at all.
 */
function matchDrawings(ref: Project, cand: Project): Map<string, string> {
  const byName = new Map<string, string[]>();
  for (const d of cand.drawings) {
    const key = foldName(d.name);
    byName.set(key, [...(byName.get(key) ?? []), d.id]);
  }
  const out = new Map<string, string>();
  for (const d of ref.drawings) {
    const id = byName.get(foldName(d.name))?.shift();
    if (id) out.set(d.id, id);
  }
  if (out.size === 0 && ref.drawings.length === cand.drawings.length) {
    for (const [i, d] of ref.drawings.entries()) out.set(d.id, cand.drawings[i].id);
  }
  return out;
}

const nameKey = (i: Pick<Item, "kind" | "name">) => `${i.kind}|${foldName(i.name.trim())}`;

/**
 * Budget lines of both takeoffs under a common key: the same catalog material, else the same
 * name and kind. A material split over several lines (one per discipline) is one key; which tab
 * each quantity sits on is compared apart (lines.ts).
 */
function itemKeys(ref: Project, cand: Project) {
  const refKey = new Map<string, string>();
  const byCatalog = new Map<string, string>();
  const label = new Map<string, Item>();
  for (const i of ref.items) {
    if (i.derived) continue;
    // lines of one catalog material share its first line's key, whatever each is called
    const catalog = i.catalogId ? `${i.kind}|${i.catalogId}` : null;
    const key = (catalog && byCatalog.get(catalog)) || nameKey(i);
    refKey.set(i.id, key);
    if (catalog && !byCatalog.has(catalog)) byCatalog.set(catalog, key);
    if (!label.has(key)) label.set(key, i);
  }
  const candKey = new Map<string, string>();
  for (const i of cand.items) {
    if (i.derived) continue;
    const key = (i.catalogId && byCatalog.get(`${i.kind}|${i.catalogId}`)) || nameKey(i);
    candKey.set(i.id, key);
    if (!label.has(key)) label.set(key, i);
  }
  return { refKey, candKey, label };
}

/** Measured quantity per item key: what the markings give, without anything typed by hand. */
function measuredQuantities(project: Project, keys: Map<string, string>) {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const qty = new Map<string, number>();
  let unscaled = 0;
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    const key = keys.get(m.itemId);
    if (!item || !key) continue;
    const q = measurementQty(m, item.kind, pageScale(project, m.drawingId, m.page));
    if (q === null) {
      unscaled++;
      continue;
    }
    qty.set(key, (qty.get(key) ?? 0) + q * (item.factor ?? 1) * repeatOf(project, m, item.kind));
  }
  return { qty, unscaled };
}

function compareLocations(
  ref: Project,
  cand: Project,
  drawings: Map<string, string>,
  minIoU: number,
): LocationsReport {
  const matched: LocationMatch[] = [];
  const missed: LocationMiss[] = [];
  const extra: LocationMiss[] = [];
  const nameOf = (p: Project, id: string) => locationOf(p, id)?.name ?? "";
  const pages = new Set(ref.zones.map((z) => `${z.drawingId}#${z.page}`));
  for (const [refId, candId] of drawings) {
    for (const z of cand.zones) if (z.drawingId === candId) pages.add(`${refId}#${z.page}`);
  }
  for (const key of pages) {
    const [refId, pageText] = key.split("#");
    const page = Number(pageText);
    const candId = drawings.get(refId);
    const place: Place = {
      drawingId: refId,
      drawing: ref.drawings.find((d) => d.id === refId)?.name ?? "",
      page: page + 1,
    };
    const rz = ref.zones.filter((z) => z.drawingId === refId && z.page === page);
    const cz = candId ? cand.zones.filter((z) => z.drawingId === candId && z.page === page) : [];
    const overlap = new Map<string, number>();
    const pairing = pairUp(rz.length, cz.length, (r, c) => {
      const iou = polygonIoU(rz[r].points, cz[c].points);
      overlap.set(`${r}:${c}`, iou);
      return iou >= minIoU ? iou : null;
    });
    for (const [r, c] of pairing.pairs) {
      const name = nameOf(ref, rz[r].locationId);
      const candidateName = nameOf(cand, cz[c].locationId);
      matched.push({
        ...place,
        name,
        candidateName,
        nameMatches: locationKey(name) === locationKey(candidateName),
        iou: overlap.get(`${r}:${c}`) ?? 0,
        reference: rz[r].points,
        candidate: cz[c].points,
      });
    }
    for (const r of pairing.missed) {
      missed.push({ ...place, name: nameOf(ref, rz[r].locationId), points: rz[r].points });
    }
    for (const c of pairing.extra) {
      extra.push({ ...place, name: nameOf(cand, cz[c].locationId), points: cz[c].points });
    }
  }
  const n = matched.length;
  return {
    matched,
    missed,
    extra,
    ...rates(n, missed.length, extra.length),
    meanIoU: n === 0 ? null : matched.reduce((s, m) => s + m.iou, 0) / n,
    namesRight: n === 0 ? null : matched.filter((m) => m.nameMatches).length / n,
  };
}

function compareCounts(
  ref: Project,
  cand: Project,
  drawings: Map<string, string>,
  keys: ReturnType<typeof itemKeys>,
  tolerance: number,
): CountsReport {
  const refDrawing = new Map([...drawings].map(([r, c]) => [c, r]));
  const drawingName = new Map(ref.drawings.map((d) => [d.id, d.name]));
  const kindOf = (p: Project) => new Map(p.items.map((i) => [i.id, i.kind]));
  /** Count marks grouped by item key, then by "drawing#page" in the reference's drawing ids. */
  const collect = (
    p: Project,
    itemKey: Map<string, string>,
    mapDrawing: (id: string) => string | undefined,
  ) => {
    const kinds = kindOf(p);
    const out = new Map<string, Map<string, Pt[]>>();
    for (const m of p.measurements) {
      const key = itemKey.get(m.itemId);
      const drawingId = mapDrawing(m.drawingId);
      if (!key || kinds.get(m.itemId) !== "count" || !drawingId) continue;
      const pageKey = `${drawingId}#${m.page}`;
      let pages = out.get(key);
      if (!pages) {
        pages = new Map();
        out.set(key, pages);
      }
      const list = pages.get(pageKey) ?? [];
      list.push(m.points[0]);
      pages.set(pageKey, list);
    }
    return out;
  };
  const refMarks = collect(ref, keys.refKey, (id) => id);
  const candMarks = collect(cand, keys.candKey, (id) => refDrawing.get(id));
  const placeOf = (pageKey: string): Place => {
    const [drawingId, page] = pageKey.split("#");
    return { drawingId, drawing: drawingName.get(drawingId) ?? "", page: Number(page) + 1 };
  };
  const matched: CountMark[] = [];
  const missed: CountMark[] = [];
  const extra: CountMark[] = [];
  const items: CountItemReport[] = [];
  for (const key of new Set([...refMarks.keys(), ...candMarks.keys()])) {
    const item = keys.label.get(key)?.name ?? key;
    const before = { matched: matched.length, missed: missed.length, extra: extra.length };
    const rp = refMarks.get(key) ?? new Map<string, Pt[]>();
    const cp = candMarks.get(key) ?? new Map<string, Pt[]>();
    for (const pageKey of new Set([...rp.keys(), ...cp.keys()])) {
      const r = rp.get(pageKey) ?? [];
      const c = cp.get(pageKey) ?? [];
      const place = placeOf(pageKey);
      const pairing = pairPoints(r, c, tolerance);
      for (const [ri] of pairing.pairs) matched.push({ ...place, item, at: r[ri] });
      for (const ri of pairing.missed) missed.push({ ...place, item, at: r[ri] });
      for (const ci of pairing.extra) extra.push({ ...place, item, at: c[ci] });
    }
    const n = {
      matched: matched.length - before.matched,
      missed: missed.length - before.missed,
      extra: extra.length - before.extra,
    };
    items.push({ item, ...n, ...rates(n.matched, n.missed, n.extra) });
  }
  // a missed mark with an extra mark of another item on top: found, but on the wrong line
  const samePage = (a: CountMark, b: CountMark) => a.drawingId === b.drawingId && a.page === b.page;
  const used = new Set<number>();
  let wrongItem = 0;
  for (const m of missed) {
    const at = extra.findIndex(
      (e, i) =>
        !used.has(i) &&
        e.item !== m.item &&
        samePage(e, m) &&
        Math.hypot(e.at.x - m.at.x, e.at.y - m.at.y) <= tolerance,
    );
    if (at >= 0) {
      used.add(at);
      wrongItem++;
    }
  }
  items.sort(
    (a, b) => b.matched + b.missed - (a.matched + a.missed) || a.item.localeCompare(b.item),
  );
  return {
    items,
    matched,
    missed,
    extra,
    wrongItem,
    ...rates(matched.length, missed.length, extra.length),
  };
}

function compareQuantities(
  ref: Project,
  cand: Project,
  keys: ReturnType<typeof itemKeys>,
): QuantitiesReport {
  const r = measuredQuantities(ref, keys.refKey);
  const c = measuredQuantities(cand, keys.candKey);
  const rows: QuantityRow[] = [];
  let valueDiff = 0;
  let valueRef = 0;
  const kindDiff: Record<Kind, number> = { count: 0, linear: 0, area: 0 };
  const kindRef: Record<Kind, number> = { count: 0, linear: 0, area: 0 };
  for (const key of new Set([...r.qty.keys(), ...c.qty.keys()])) {
    const item = keys.label.get(key);
    if (!item) continue;
    const reference = r.qty.get(key) ?? 0;
    const candidate = c.qty.get(key) ?? 0;
    if (reference === 0 && candidate === 0) continue;
    const price = item.materialPrice + item.laborPrice;
    valueDiff += Math.abs(candidate - reference) * price;
    valueRef += reference * price;
    kindDiff[item.kind] += Math.abs(candidate - reference);
    kindRef[item.kind] += reference;
    rows.push({
      item: item.name,
      kind: item.kind,
      unit: itemUnit(item, ref.unit),
      reference,
      candidate,
      error: reference === 0 ? null : (candidate - reference) / reference,
      status: !c.qty.has(key) ? "missing" : !r.qty.has(key) ? "extra" : "both",
    });
  }
  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item, "pt-BR"));
  const share = (k: Kind) => (kindRef[k] === 0 ? null : kindDiff[k] / kindRef[k]);
  return {
    rows,
    valueError: valueRef === 0 ? null : valueDiff / valueRef,
    byKind: { count: share("count"), linear: share("linear"), area: share("area") },
    candidateUnscaled: c.unscaled,
  };
}

function compareScales(
  ref: Project,
  cand: Project,
  drawings: Map<string, string>,
  tolerance: number,
): EvalReport["scales"] {
  const pages: ScaleRow[] = [];
  for (const d of ref.drawings) {
    const candId = drawings.get(d.id);
    d.pages.forEach((pm, page) => {
      if (!pm.scale) return;
      const other = candId ? pageScale(cand, candId, page) : null;
      const ok =
        !!other &&
        other.unit === pm.scale.unit &&
        Math.abs(other.pointsPerUnit - pm.scale.pointsPerUnit) <=
          tolerance * pm.scale.pointsPerUnit;
      pages.push({
        drawingId: d.id,
        drawing: d.name,
        page: page + 1,
        reference: pm.scale.label,
        candidate: other?.label ?? null,
        ok,
      });
    });
  }
  return { pages, wrong: pages.filter((p) => !p.ok).length };
}

export function compareTakeoffs(
  reference: Project,
  candidate: Project,
  options: CompareOptions = {},
): EvalReport {
  const drawings = matchDrawings(reference, candidate);
  const keys = itemKeys(reference, candidate);
  const tolerance = options.tolerancePt ?? DEFAULT_TOLERANCE_PT;
  return {
    reference: reference.name,
    candidate: candidate.name,
    drawingsMissing: reference.drawings.filter((d) => !drawings.has(d.id)).map((d) => d.name),
    locations: compareLocations(reference, candidate, drawings, options.minIoU ?? DEFAULT_MIN_IOU),
    counts: compareCounts(reference, candidate, drawings, keys, tolerance),
    quantities: compareQuantities(reference, candidate, keys),
    scales: compareScales(
      reference,
      candidate,
      drawings,
      options.scaleTolerance ?? DEFAULT_SCALE_TOLERANCE,
    ),
    disciplines: compareDisciplines(reference, candidate, keys),
    catalog: compareCatalog(reference, candidate, drawings, tolerance),
    review: aiStats(candidate),
    notCompared: {
      derived: reference.items.filter((i) => i.derived).map((i) => i.name),
      typedByHand: reference.items
        .filter((i) => !i.derived && ((i.manualQty ?? 0) > 0 || (i.vertical ?? 0) > 0))
        .map((i) => i.name),
    },
  };
}
