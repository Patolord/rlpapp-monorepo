/**
 * The cutout report's decisions, with no PDF code: which regions make it into the report, the
 * crop of the drawing each page shows, the zoom it is printed at, the markings drawn on it and
 * the lists printed beside it. The writer only draws what the plan says.
 *
 * Per region (a location's polygon on one sheet) the rule is to keep the drawing legible and
 * adapt the crop, never shrink below the legibility floor:
 *
 * 1. Tight crop: the box of the filtered markings in the region plus a margin; a region with
 *    none is skipped.
 * 2. If the zoom that fits the crop in the frame is at or above the floor: one page ("cutout").
 * 3. Otherwise the markings are clustered (single link on their boxes, gap of one frame width
 *    at the floor zoom) and each cluster that fits is a page ("cluster", "trecho 1 de 3").
 * 4. A cluster still too big is tiled at the floor zoom with some overlap ("tile", A1, A2…).
 * 5. A split region starts with a key map ("keymap") showing the whole region with the frames
 *    of its pages. The key map lists the region total; cluster and tile pages list what they
 *    own, each marking counted on exactly one page by its anchor (`anchorOf`).
 *
 * A region holds every filtered marking whose anchor lies inside its polygon, rooms drawn
 * inside a floor included: the floor's pages draw and list the rooms' markings too, with the
 * floor's repeat. The budget keeps its own rule (a marking belongs to the smallest zone around
 * it, `zoneOf`), and the cover's grand total follows the budget, so it counts each marking once
 * even when one location's regions contain another's (`cover.nested`).
 *
 * Whole-sheet mode skips all that: each page with filtered markings is one "sheet" page.
 * Coordinates are page space (see ./coords for PDF user space); frame sizes are output points.
 */
import { compareItemsForBudget } from "../budgetOrder";
import { ductRuns } from "../ductItems";
import {
  DEFAULT_DUCT_SETTINGS,
  type DuctInsulation,
  type DuctRun,
  gaugeName,
  INSULATION_LABELS,
} from "../ducts";
import { type Box, bbox, type Pt, pointInPolygon, polygonArea } from "../geom";
import {
  anchorOf,
  itemUnit,
  measurementQty,
  NO_LOCATION,
  pageScale,
  pricedQty,
  repeatOf,
  zoneOf,
} from "../quantities";
import { drawingOf, type Item, type Measurement, type Project, type Zone } from "../types";
import type { Kind, PageScale } from "../units";
import {
  brandOf,
  DEFAULT_VRF_SETTINGS,
  type Diameter,
  diameterIndex,
  ROLE_LABELS,
  type SizedRun,
  type VrfBrand,
  type VrfRole,
  vrfBill,
} from "../vrf";
import { DEFAULT_SYSTEM_HP, vrfRunsBySystem } from "../vrfItems";
import { describeFilter, matches, type ReportFilter } from "./filter";

// ---------------------------------------------------------------------------------------------
// Paper and page layout

export type Paper = "A4" | "A3";
export type Orientation = "landscape" | "portrait";

export interface Size {
  width: number;
  height: number;
}

/** A rectangle on the output page, PDF points, origin bottom-left and y up (pdf-lib's). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Portrait sizes, PDF points. */
export const PAPER_SIZES: Record<Paper, Size> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
};

/** Where things go on a report page; the writer draws into these boxes. */
export interface ReportLayout {
  page: Size;
  /** Project, client, proposal, location, drawing, filter, date. */
  header: Rect;
  /** The drawing cutout (about 70 % of the page). */
  frame: Rect;
  /** Item list and run breakdown: beside the frame in landscape, below it in portrait. */
  list: Rect;
  /** "página n de N", "também em: …". */
  footer: Rect;
}

const PAGE_MARGIN = 24;
const HEADER_H = 54;
const FOOTER_H = 18;
const GAP = 10;
const LIST_SHARE = 0.3;

/** The page layout of a paper size and orientation. */
export function reportLayout(
  paper: Paper = "A4",
  orientation: Orientation = "landscape",
): ReportLayout {
  const p = PAPER_SIZES[paper];
  const page = orientation === "landscape" ? { width: p.height, height: p.width } : { ...p };
  const inner = page.width - 2 * PAGE_MARGIN;
  const footer = { x: PAGE_MARGIN, y: PAGE_MARGIN, width: inner, height: FOOTER_H };
  const header = {
    x: PAGE_MARGIN,
    y: page.height - PAGE_MARGIN - HEADER_H,
    width: inner,
    height: HEADER_H,
  };
  const bodyY = PAGE_MARGIN + FOOTER_H + GAP;
  const bodyH = header.y - GAP - bodyY;
  if (orientation === "landscape") {
    const listW = inner * LIST_SHARE;
    return {
      page,
      header,
      footer,
      frame: { x: PAGE_MARGIN, y: bodyY, width: inner - listW - GAP, height: bodyH },
      list: { x: page.width - PAGE_MARGIN - listW, y: bodyY, width: listW, height: bodyH },
    };
  }
  const listH = bodyH * LIST_SHARE;
  return {
    page,
    header,
    footer,
    frame: { x: PAGE_MARGIN, y: bodyY + listH + GAP, width: inner, height: bodyH - listH - GAP },
    list: { x: PAGE_MARGIN, y: bodyY, width: inner, height: listH },
  };
}

// ---------------------------------------------------------------------------------------------
// Options and output

export interface ReportOptions {
  /** Locations to include, by id; undefined = every location. Ignored in whole-sheet mode. */
  locationIds?: readonly string[];
  /** Also cut out the markings outside every location ("Sem local"), per sheet. Default off. */
  includeUnassigned?: boolean;
  /** Default A4. */
  paper?: Paper;
  /** Default landscape. */
  orientation?: Orientation;
  /** Frame size in output points; default the layout's frame for the paper. */
  frame?: Size;
  /** Smallest zoom a cutout is printed at (0.5 = text at half its size on the sheet). */
  legibilityFloor?: number;
  /** Largest zoom: a tiny crop grows around its markings instead (default 2). */
  maxZoom?: number;
  /** Margin around the markings, as a share of the larger side of their box (default 0.05). */
  marginPct?: number;
  /** Smallest margin, page points (default 15). */
  minMargin?: number;
  /** Overlap between neighbouring tiles, share of a tile (default 0.1). */
  tileOverlap?: number;
  /** "Planta inteira": one page per sheet with markings, the whole sheet, no polygon. */
  wholeSheet?: boolean;
  /**
   * Size of a drawing page in page space (pdf.js viewport at scale 1). Keeps crops inside the
   * sheet and gives whole-sheet pages their crop; without it whole-sheet pages crop to the
   * markings and regions on the sheet.
   */
  pageSize?: (drawingId: string, page: number) => Size | undefined;
  /** VRF rule sets that size the tubes of the breakdown; default the bundled ones. */
  vrfBrands?: readonly VrfBrand[];
}

export const DEFAULT_LEGIBILITY_FLOOR = 0.5;
export const DEFAULT_MAX_ZOOM = 2;
export const DEFAULT_MARGIN_PCT = 0.05;
export const DEFAULT_MIN_MARGIN = 15;
export const DEFAULT_TILE_OVERLAP = 0.1;
/** Name of the cutouts of markings outside every location. */
export const UNASSIGNED_NAME = "Sem local";

export type ReportPageKind = "cutout" | "keymap" | "cluster" | "tile" | "sheet";

/**
 * What a page's lists cover: the whole region (cutout, key map; repeats applied, as
 * `totalsByRegion`) or only the markings this page owns (cluster, tile, sheet).
 */
export type RowsScope = "region" | "page";

/** One item line: quantity measured on the page or region, and the quote-rounded quantity. */
export interface ReportItemRow {
  itemId: string;
  name: string;
  color: string;
  symbol?: string;
  kind: Kind;
  unit: string;
  /** Measured quantity, project units (factor, vertical and repeats applied, no waste). */
  qty: number;
  /** Quantity as the Quote tab shows it: with waste, counts rounded up (`pricedQty`). */
  pricedQty: number;
  /** Markings counted. */
  count: number;
  /** Markings on uncalibrated pages, not in `qty`. */
  unscaled: number;
}

/** Duct runs of one section and insulation, for a "Rede de dutos" item. */
export interface DuctBreakdownRow {
  networkId: string;
  networkName: string;
  /** Lado maior × lado menor, cm. */
  a: number;
  b: number;
  /** "40×25". */
  section: string;
  insulation: DuctInsulation;
  insulationLabel: string;
  /** Sheet gauge under the project's norma ("# 24"). */
  gauge: string;
  runs: number;
  /** Metres (vertical, factor and repeats applied). */
  length: number;
  /** Sheet metal, m²: perimeter × length, before allowances. */
  area: number;
}

/** Refrigerant runs of one role and tube pair, for a "Sistema VRF" item. */
export interface VrfBreakdownRow {
  systemId: string;
  systemName: string;
  role: VrfRole;
  roleLabel: string;
  gas: Diameter;
  liquid: Diameter;
  runs: number;
  /** Metres (plan + vertical, repeats applied). */
  length: number;
}

/** The lists printed beside a cutout (and on the cover per location). */
export interface ReportLists {
  /** Measured items, budget order. Derived duct/VRF items appear in the breakdowns instead. */
  rows: ReportItemRow[];
  ducts: DuctBreakdownRow[];
  vrf: VrfBreakdownRow[];
}

/** A page a key map points at: its crop drawn on the map with its label. */
export interface KeymapFrame {
  /** "1" for a cluster, "A1" for a tile, "2·A1" for a tile of cluster 2. */
  label: string;
  crop: Box;
  /** Index into `ReportPlan.pages`. */
  pageIndex: number;
}

/** Another sheet the same location is drawn on ("também em: Cobertura p.2"). */
export interface SheetRef {
  drawingId: string;
  page: number;
  /** "Cobertura p.2": drawing name without .pdf, page from 1. */
  label: string;
  /** First report page of that region, index into `ReportPlan.pages`. */
  pageIndex: number;
}

export interface ReportPage extends ReportLists {
  /** Position in `ReportPlan.pages` (the cover is not counted). */
  index: number;
  kind: ReportPageKind;
  drawingId: string;
  drawingName: string;
  /** Page of the drawing, from 0 (as `Measurement.page`). */
  page: number;
  /** Calibration of the sheet, for the scale bar (with `zoom`); null = not calibrated. */
  scale: PageScale | null;
  /** Location id, NO_LOCATION for "Sem local", null on whole-sheet pages. */
  locationId: string | null;
  locationName: string;
  /** Region (zone) id; null for "Sem local" and whole-sheet pages. */
  regionId: string | null;
  /** Times the region repeats (×20 apartments); 1 when it does not. */
  regionRepeat: number;
  /** Region outline, page space; null when the page has none. */
  polygon: Pt[] | null;
  /** "Pavimento 3 ×20 · trecho 1 de 3" for the header. */
  heading: string;
  /** The part of the region: "mapa", "trecho 1 de 3", "folha A1"…; undefined = all of it. */
  label?: string;
  /** Tile label ("A1") on tile pages. */
  tile?: string;
  /** Area of the sheet shown, page space; fills the frame exactly at `zoom`. */
  crop: Box;
  /** Output points per page point. */
  zoom: number;
  /** Filtered markings to draw (those of the region whose geometry reaches the crop). */
  measurementIds: string[];
  /** Markings whose quantities are in the lists. */
  countedIds: string[];
  rowsScope: RowsScope;
  /** Key map: the pages of the region it indexes. */
  frames?: KeymapFrame[];
  /** Other sheets of the same location that have pages in the report. */
  alsoIn: SheetRef[];
}

/** One location on the cover: totals summed over its cutouts. */
export interface ReportLocationSummary extends ReportLists {
  /** NO_LOCATION for "Sem local". */
  locationId: string;
  name: string;
  /** Regions with pages in the report. */
  regions: number;
  /** Filtered markings it holds. */
  markings: number;
  /** Report pages showing it (indices into `ReportPlan.pages`). */
  pages: number[];
  /** "1 página", "3 páginas", "1 mapa + 6 folhas". */
  pagesLabel: string;
  /**
   * Other locations drawn inside its regions, whose markings its totals include too (names, in
   * project order). Empty when it contains none.
   */
  containsLocations: string[];
}

export interface ReportCover {
  /** "Disciplina: Exaustão · Categoria: Rede de Dutos"; "" = everything. */
  filterLabel: string;
  locations: ReportLocationSummary[];
  /**
   * Some location contains another (a floor around its rooms), so the per-location totals
   * overlap. `totals` still counts each marking once.
   */
  nested: boolean;
  /**
   * Every marking of the report counted once, as the budget does: its own repeat and the repeat
   * of the smallest zone around it.
   */
  totals: ReportLists;
}

export interface ReportPlan {
  layout: ReportLayout;
  /** Frame size the zooms were computed for. */
  frame: Size;
  legibilityFloor: number;
  filterLabel: string;
  cover: ReportCover;
  pages: ReportPage[];
  /** Selected locations left out because nothing filtered lies in them. */
  skipped: { locationId: string; name: string }[];
  /**
   * Headings of planned pages the user left out (`withoutPages`); the cover notes them. Absent
   * when every planned page is printed.
   */
  omitted?: string[];
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

/** A filtered measurement with what the planner needs to place and count it. */
interface Marking {
  m: Measurement;
  item: Item;
  zone: Zone | null;
  anchor: Pt;
  box: Box;
}

const union = (boxes: readonly Box[]): Box => ({
  minX: Math.min(...boxes.map((b) => b.minX)),
  minY: Math.min(...boxes.map((b) => b.minY)),
  maxX: Math.max(...boxes.map((b) => b.maxX)),
  maxY: Math.max(...boxes.map((b) => b.maxY)),
});

const boxW = (b: Box) => b.maxX - b.minX;
const boxH = (b: Box) => b.maxY - b.minY;

const inBox = (p: Pt, b: Box) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/** Liang-Barsky: does segment p→q cross the box? */
function segmentHitsBox(p: Pt, q: Pt, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges: [number, number][] = [
    [-dx, p.x - b.minX],
    [dx, b.maxX - p.x],
    [-dy, p.y - b.minY],
    [dy, b.maxY - p.y],
  ];
  for (const [pk, qk] of edges) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const r = qk / pk;
      if (pk < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Does a marking's geometry (not just its box) reach the box? */
function hitsBox(points: readonly Pt[], kind: Kind, b: Box): boolean {
  if (points.some((p) => inBox(p, b))) return true;
  if (kind === "count" || points.length < 2) return false;
  const n = kind === "area" ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    if (segmentHitsBox(points[i], points[(i + 1) % points.length], b)) return true;
  }
  return (
    kind === "area" &&
    pointInPolygon({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, points)
  );
}

/** Single-link clusters of boxes: two boxes link when they are within `gap` on both axes. */
function clusterBoxes(boxes: readonly Box[], gap: number): number[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].minX - boxes[b].minX || a - b);
  for (let k = 0; k < order.length; k++) {
    const a = boxes[order[k]];
    for (let j = k + 1; j < order.length; j++) {
      const b = boxes[order[j]];
      if (b.minX - a.maxX > gap) break; // sorted by minX: nothing further can link to `a`
      const dy = Math.max(0, b.minY - a.maxY, a.minY - b.maxY);
      if (dy <= gap) {
        const ra = find(order[k]);
        const rb = find(order[j]);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      }
    }
  }
  const groups = new Map<number, number[]>();
  boxes.forEach((_, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });
  return [...groups.values()];
}

/** Tile row letters: A…Z, AA, AB… */
export function tileRowName(row: number): string {
  let s = "";
  let n = row + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "A1": row letter (top to bottom), column number (left to right). */
export const tileLabel = (row: number, col: number): string => `${tileRowName(row)}${col + 1}`;

export interface Tile {
  row: number;
  col: number;
  label: string;
  /** What the tile shows: one frame at the floor zoom, page space. */
  crop: Box;
  /**
   * What the tile owns: the grid cell split at the middle of each overlap (open towards the
   * outside), so every anchor belongs to exactly one tile.
   */
  cell: Box;
}

/**
 * A grid of frame-sized tiles (page space: `tile`) covering `box`, neighbours overlapping by
 * `overlap` of a tile, the grid centred on the box. Row-major, top-left first.
 */
export function tileGrid(box: Box, tile: Size, overlap: number): Tile[] {
  const axis = (min: number, size: number, length: number) => {
    const step = size * (1 - overlap);
    const n = length <= size + 1e-9 ? 1 : Math.ceil((length - size) / step - 1e-9) + 1;
    const span = size + (n - 1) * step;
    const start = min - (span - length) / 2;
    const half = (size - step) / 2;
    return Array.from({ length: n }, (_, i) => ({
      lo: start + i * step,
      hi: start + i * step + size,
      cellLo: i === 0 ? Number.NEGATIVE_INFINITY : start + i * step + half,
      cellHi: i === n - 1 ? Number.POSITIVE_INFINITY : start + (i + 1) * step + half,
    }));
  };
  const cols = axis(box.minX, tile.width, boxW(box));
  const rows = axis(box.minY, tile.height, boxH(box));
  const out: Tile[] = [];
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      out.push({
        row: ri,
        col: ci,
        label: tileLabel(ri, ci),
        crop: { minX: c.lo, minY: r.lo, maxX: c.hi, maxY: r.hi },
        cell: { minX: c.cellLo, minY: r.cellLo, maxX: c.cellHi, maxY: r.cellHi },
      });
    });
  });
  return out;
}

/** Anchor inside a cell: half-open towards the far side, so shared edges have one owner. */
const inCell = (p: Pt, c: Box) => p.x >= c.minX && p.x < c.maxX && p.y >= c.minY && p.y < c.maxY;

// ---------------------------------------------------------------------------------------------
// Planner

interface Ctx {
  project: Project;
  frame: Size;
  floor: number;
  maxZoom: number;
  marginPct: number;
  minMargin: number;
  overlap: number;
  pageSize?: (drawingId: string, page: number) => Size | undefined;
  /** Item order in the budget (rows) and in the project (breakdowns). */
  itemRank: Map<string, number>;
  projectRank: Map<string, number>;
  duct: Map<string, DuctRun>;
  vrf: Map<string, SizedRun>;
  norma: 1 | 2 | 3;
}

/** A page before its index and cross references are known. */
type Draft = Omit<ReportPage, "index" | "alsoIn" | "frames" | keyof ReportLists> & {
  counted: Marking[];
  /** Region whose repeat the lists apply; null = each marking's own zone (budget). */
  region: Zone | null;
  frames?: Omit<KeymapFrame, "pageIndex">[];
};

const withMargin = (b: Box, ctx: Ctx): Box => {
  const m = Math.max(ctx.minMargin, ctx.marginPct * Math.max(boxW(b), boxH(b)));
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
};

/** Zoom that fits a box in the frame. */
const fitZoom = (b: Box, frame: Size): number =>
  Math.min(frame.width / Math.max(boxW(b), 1e-9), frame.height / Math.max(boxH(b), 1e-9));

/**
 * The crop that fills the frame around `content` at the zoom that fits it (capped), centred on
 * it and kept inside the sheet when its size is known.
 */
function frameCrop(
  content: Box,
  ctx: Ctx,
  drawingId: string,
  page: number,
  maxZoom = ctx.maxZoom,
): { crop: Box; zoom: number } {
  const zoom = Math.min(fitZoom(content, ctx.frame), maxZoom);
  const w = ctx.frame.width / zoom;
  const h = ctx.frame.height / zoom;
  const sheet = ctx.pageSize?.(drawingId, page);
  const place = (lo: number, hi: number, size: number, limit: number | undefined) => {
    let start = (lo + hi) / 2 - size / 2;
    if (limit !== undefined) {
      if (size >= limit) start = (limit - size) / 2;
      else start = Math.min(Math.max(start, 0), limit - size);
    }
    return start;
  };
  const x = place(content.minX, content.maxX, w, sheet?.width);
  const y = place(content.minY, content.maxY, h, sheet?.height);
  return { crop: { minX: x, minY: y, maxX: x + w, maxY: y + h }, zoom };
}

/** Markings of the region to draw on a page: those reaching the crop, plus those it owns. */
const shownIn = (markings: readonly Marking[], crop: Box, owned: readonly Marking[]): Marking[] => {
  const own = new Set(owned);
  return markings.filter((k) => own.has(k) || hitsBox(k.m.points, k.item.kind, crop));
};

interface RegionInput {
  drawingId: string;
  page: number;
  locationId: string;
  locationName: string;
  zone: Zone | null;
  markings: Marking[];
}

/** The pages of one region (or the "Sem local" markings of one sheet). */
function planRegion(r: RegionInput, ctx: Ctx): Draft[] {
  const repeat = r.zone?.repeat ?? 1;
  const title = repeat > 1 ? `${r.locationName} ×${repeat}` : r.locationName;
  const base = {
    drawingId: r.drawingId,
    drawingName: drawingOf(ctx.project, r.drawingId)?.name ?? "",
    page: r.page,
    scale: pageScale(ctx.project, r.drawingId, r.page),
    locationId: r.locationId,
    locationName: r.locationName,
    regionId: r.zone?.id ?? null,
    region: r.zone,
    regionRepeat: repeat,
    polygon: r.zone ? r.zone.points.map((p) => ({ ...p })) : null,
  };
  const ids = (ms: readonly Marking[]) => ms.map((k) => k.m.id);
  const tight = withMargin(union(r.markings.map((k) => k.box)), ctx);
  if (fitZoom(tight, ctx.frame) >= ctx.floor - 1e-9) {
    const { crop, zoom } = frameCrop(tight, ctx, r.drawingId, r.page);
    return [
      {
        ...base,
        kind: "cutout",
        heading: title,
        crop,
        zoom,
        measurementIds: ids(r.markings),
        countedIds: ids(r.markings),
        counted: r.markings,
        rowsScope: "region",
      },
    ];
  }

  // too big for one legible page: clusters, then tiles for what still does not fit
  const parts: Draft[] = [];
  const frames: Omit<KeymapFrame, "pageIndex">[] = [];
  const tileSize = { width: ctx.frame.width / ctx.floor, height: ctx.frame.height / ctx.floor };
  const tiles = (members: Marking[], prefix: string, labelPrefix: string) => {
    const box = withMargin(union(members.map((k) => k.box)), ctx);
    for (const t of tileGrid(box, tileSize, ctx.overlap)) {
      const owned = members.filter((k) => inCell(k.anchor, t.cell));
      const shown = shownIn(r.markings, t.crop, owned);
      if (shown.length === 0) continue; // empty corner of the grid
      const label = `${labelPrefix}folha ${t.label}`;
      parts.push({
        ...base,
        kind: "tile",
        heading: `${title} · ${label}`,
        label,
        tile: t.label,
        crop: t.crop,
        zoom: ctx.floor,
        measurementIds: ids(shown),
        countedIds: ids(owned),
        counted: owned,
        rowsScope: "page",
      });
      frames.push({ label: `${prefix}${t.label}`, crop: t.crop });
    }
  };
  const groups = clusterBoxes(
    r.markings.map((k) => k.box),
    tileSize.width,
  )
    .map((g) => g.sort((a, b) => a - b).map((i) => r.markings[i]))
    .map((members) => ({ members, box: union(members.map((k) => k.box)) }))
    .sort((a, b) => a.box.minY - b.box.minY || a.box.minX - b.box.minX);
  if (groups.length === 1) tiles(groups[0].members, "", "");
  else {
    groups.forEach((g, gi) => {
      const n = `${gi + 1}`;
      const label = `trecho ${n} de ${groups.length}`;
      const tightG = withMargin(g.box, ctx);
      if (fitZoom(tightG, ctx.frame) < ctx.floor - 1e-9) {
        tiles(g.members, `${n}·`, `${label} · `);
        return;
      }
      const { crop, zoom } = frameCrop(tightG, ctx, r.drawingId, r.page);
      const shown = shownIn(r.markings, crop, g.members);
      parts.push({
        ...base,
        kind: "cluster",
        heading: `${title} · ${label}`,
        label,
        crop,
        zoom,
        measurementIds: ids(shown),
        countedIds: ids(g.members),
        counted: g.members,
        rowsScope: "page",
      });
      frames.push({ label: n, crop });
    });
  }

  // the key map: the whole region with the frames of its pages, and the region total
  const polygonBox = r.zone && r.zone.points.length > 0 ? [bbox(r.zone.points)] : [];
  const mapContent = withMargin(union([tight, ...polygonBox, ...frames.map((f) => f.crop)]), ctx);
  const map = frameCrop(mapContent, ctx, r.drawingId, r.page, Number.POSITIVE_INFINITY);
  return [
    {
      ...base,
      kind: "keymap",
      heading: `${title} · mapa`,
      label: "mapa",
      crop: map.crop,
      zoom: map.zoom,
      measurementIds: ids(r.markings),
      countedIds: ids(r.markings),
      counted: r.markings,
      rowsScope: "region",
      frames,
    },
    ...parts,
  ];
}

/**
 * Quantity a marking adds to its item's total, as `totalsByRegion` computes it, with the repeat
 * of `zone` (the region reported, or the marking's own smallest zone).
 */
function markingQty(project: Project, k: Marking, zone: Zone | null): number | null {
  const q = measurementQty(k.m, k.item.kind, pageScale(project, k.m.drawingId, k.m.page));
  if (q === null) return null;
  return (
    (q + (k.item.kind === "linear" ? (k.m.vertical ?? 0) : 0)) *
    (k.item.factor ?? 1) *
    repeatOf(project, k.m, k.item.kind, zone)
  );
}

/**
 * Factor turning a derived run's length (repeated by the smallest zone around it, as the Dutos
 * and VRF tabs have it) into the length under `zone`'s repeat.
 */
const zoneRepeatRatio = (k: Marking, zone: Zone | null): number =>
  zone === k.zone ? 1 : (zone?.repeat ?? 1) / (k.zone?.repeat || 1);

/** Which zone's repeat applies to a marking in a list: its own smallest zone by default. */
type RepeatZone = (k: Marking) => Zone | null;
const ownZone: RepeatZone = (k) => k.zone;

const DIAMETER_DESC = (a: Diameter, b: Diameter) => diameterIndex(b) - diameterIndex(a);
const ROLE_ORDER: Record<VrfRole, number> = { main: 0, trunk: 1, branch: 2 };
const INSULATION_ORDER = Object.keys(INSULATION_LABELS) as DuctInsulation[];

/** Item rows and run breakdowns of a set of markings, each with the repeat of `zoneFor`. */
function listsOf(markings: readonly Marking[], ctx: Ctx, zoneFor = ownZone): ReportLists {
  const { project } = ctx;
  const rows = new Map<string, ReportItemRow>();
  const ducts = new Map<string, DuctBreakdownRow>();
  const vrf = new Map<string, VrfBreakdownRow>();
  for (const k of markings) {
    if (k.item.derived === "duct") {
      const run = ctx.duct.get(k.m.id);
      if (!run) continue;
      const { a, b, insulation } = run.spec;
      const key = `${k.item.id}|${a}|${b}|${insulation}`;
      const row = ducts.get(key) ?? {
        networkId: k.item.id,
        networkName: k.item.name,
        a,
        b,
        section: `${a}×${b}`,
        insulation,
        insulationLabel: INSULATION_LABELS[insulation],
        gauge: gaugeName(a, ctx.norma),
        runs: 0,
        length: 0,
        area: 0,
      };
      const length = run.length * zoneRepeatRatio(k, zoneFor(k));
      row.runs++;
      row.length += length;
      row.area += ((a + b) / 100) * 2 * length;
      ducts.set(key, row);
      continue;
    }
    if (k.item.derived === "vrf") {
      const run = ctx.vrf.get(k.m.id);
      if (!run) continue;
      const key = `${k.item.id}|${run.spec.role}|${run.gas}|${run.liquid}`;
      const row = vrf.get(key) ?? {
        systemId: k.item.id,
        systemName: k.item.name,
        role: run.spec.role,
        roleLabel: ROLE_LABELS[run.spec.role],
        gas: run.gas,
        liquid: run.liquid,
        runs: 0,
        length: 0,
      };
      row.runs++;
      row.length += Math.max(0, run.length) * zoneRepeatRatio(k, zoneFor(k));
      vrf.set(key, row);
      continue;
    }
    if (k.item.derived) continue;
    const row = rows.get(k.item.id) ?? {
      itemId: k.item.id,
      name: k.item.name,
      color: k.item.color,
      symbol: k.item.symbol,
      kind: k.item.kind,
      unit: itemUnit(k.item, project.unit),
      qty: 0,
      pricedQty: 0,
      count: 0,
      unscaled: 0,
    };
    const q = markingQty(project, k, zoneFor(k));
    row.count++;
    if (q === null) row.unscaled++;
    else row.qty += q;
    rows.set(k.item.id, row);
  }
  const rank = (id: string, m: Map<string, number>) => m.get(id) ?? Number.POSITIVE_INFINITY;
  const items = new Map(project.items.map((i) => [i.id, i]));
  return {
    rows: [...rows.values()]
      .map((r) => {
        const item = items.get(r.itemId);
        return item ? { ...r, pricedQty: pricedQty(item, r.qty) } : r;
      })
      .sort((a, b) => rank(a.itemId, ctx.itemRank) - rank(b.itemId, ctx.itemRank)),
    ducts: [...ducts.values()].sort(
      (x, y) =>
        rank(x.networkId, ctx.projectRank) - rank(y.networkId, ctx.projectRank) ||
        y.a - x.a ||
        y.b - x.b ||
        INSULATION_ORDER.indexOf(x.insulation) - INSULATION_ORDER.indexOf(y.insulation),
    ),
    vrf: [...vrf.values()].sort(
      (x, y) =>
        rank(x.systemId, ctx.projectRank) - rank(y.systemId, ctx.projectRank) ||
        ROLE_ORDER[x.role] - ROLE_ORDER[y.role] ||
        DIAMETER_DESC(x.gas, y.gas) ||
        DIAMETER_DESC(x.liquid, y.liquid),
    ),
  };
}

/** "1 página", "3 páginas", "1 mapa + 6 folhas". */
export function pagesLabel(kinds: readonly ReportPageKind[]): string {
  const maps = kinds.filter((k) => k === "keymap").length;
  const sheets = kinds.length - maps;
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  if (maps === 0) return n(sheets, "página", "páginas");
  return `${n(maps, "mapa", "mapas")} + ${n(sheets, "folha", "folhas")}`;
}

/** Drawing name as the report prints it: without the .pdf extension. */
const sheetName = (project: Project, drawingId: string): string =>
  drawingOf(project, drawingId)?.name.replace(/\.pdf$/i, "") ?? "";

/** Filtered markings with their zone, anchor and box, in project order. */
function collectMarkings(project: Project, filter: ReportFilter): Marking[] {
  const items = new Map(project.items.map((i) => [i.id, i]));
  const out: Marking[] = [];
  for (const m of project.measurements) {
    const item = items.get(m.itemId);
    if (!item || m.points.length === 0 || !matches(project, item, filter)) continue;
    out.push({
      m,
      item,
      zone: zoneOf(project, m, item.kind),
      anchor: anchorOf(item.kind, m.points),
      box: bbox(m.points),
    });
  }
  return out;
}

/** Does a region hold the marking? Its anchor lies inside the polygon, on the same sheet. */
const holds = (z: Zone, k: Marking): boolean =>
  z.drawingId === k.m.drawingId && z.page === k.m.page && pointInPolygon(k.anchor, z.points);

/** Markings each region holds (nested regions' markings included), by zone id, in input order. */
function markingsByRegion(project: Project, markings: readonly Marking[]): Map<string, Marking[]> {
  const out = new Map<string, Marking[]>();
  for (const z of project.zones) {
    const inside = markings.filter((k) => holds(z, k));
    if (inside.length) out.set(z.id, inside);
  }
  return out;
}

const drawingRank = (project: Project) => {
  const rank = new Map(project.drawings.map((d, i) => [d.id, i]));
  return (id: string) => rank.get(id) ?? Number.POSITIVE_INFINITY;
};

/** Markings grouped by sheet (drawing, page), in drawing order then page order. */
function bySheet(project: Project, markings: readonly Marking[]): Marking[][] {
  const groups = new Map<string, Marking[]>();
  for (const k of markings) {
    const key = `${k.m.drawingId}#${k.m.page}`;
    const g = groups.get(key);
    if (g) g.push(k);
    else groups.set(key, [k]);
  }
  const rank = drawingRank(project);
  return [...groups.values()].sort(
    (a, b) => rank(a[0].m.drawingId) - rank(b[0].m.drawingId) || a[0].m.page - b[0].m.page,
  );
}

export interface LocationCandidate {
  /** NO_LOCATION for "Sem local". */
  locationId: string;
  name: string;
  /** Regions the location is drawn as (0 for "Sem local"). */
  regions: number;
  /** Filtered markings inside it; 0 = greyed out in the dialog. */
  markings: number;
}

/**
 * The locations the dialog lists, with their regions and how many filtered markings each holds;
 * "Sem local" last, when markings lie outside every location.
 */
export function locationCandidates(project: Project, filter: ReportFilter): LocationCandidate[] {
  const markings = collectMarkings(project, filter);
  const byRegion = markingsByRegion(project, markings);
  const out: LocationCandidate[] = project.locations.map((l) => {
    const zones = project.zones.filter((z) => z.locationId === l.id);
    // as the report: everything inside its regions, nested locations included, once each
    const inside = new Set(zones.flatMap((z) => byRegion.get(z.id) ?? []));
    return { locationId: l.id, name: l.name, regions: zones.length, markings: inside.size };
  });
  const loose = markings.filter((k) => !k.zone).length;
  if (loose > 0) {
    out.push({ locationId: NO_LOCATION, name: UNASSIGNED_NAME, regions: 0, markings: loose });
  }
  return out;
}

/**
 * Plan a cutout report: the pages, in order (locations in project order, their regions by
 * drawing and page, "Sem local" last), and the cover summary. Deterministic for a given input.
 */
export function planReport(
  project: Project,
  filter: ReportFilter,
  options: ReportOptions = {},
): ReportPlan {
  const layout = reportLayout(options.paper, options.orientation);
  const frame = options.frame ?? { width: layout.frame.width, height: layout.frame.height };
  const floor = options.legibilityFloor ?? DEFAULT_LEGIBILITY_FLOOR;
  if (!(floor > 0)) throw new Error("The legibility floor must be positive");

  // derived runs: lengths as the Dutos tab has them, VRF tubes sized over the whole system
  const vrf = new Map<string, SizedRun>();
  const bySystem = vrfRunsBySystem(project);
  for (const item of project.items) {
    if (item.derived !== "vrf" || !matches(project, item, filter)) continue;
    const runs = bySystem.get(item.id) ?? [];
    if (runs.length === 0) continue;
    const brand = brandOf(options.vrfBrands ?? [], item.vrf?.brand);
    const bill = vrfBill(
      runs,
      brand,
      item.vrf?.hp ?? DEFAULT_SYSTEM_HP,
      project.vrfSettings ?? DEFAULT_VRF_SETTINGS,
    );
    for (const s of bill.sized) if (s.id) vrf.set(s.id, s);
  }
  const ctx: Ctx = {
    project,
    frame,
    floor,
    maxZoom: Math.max(options.maxZoom ?? DEFAULT_MAX_ZOOM, floor),
    marginPct: options.marginPct ?? DEFAULT_MARGIN_PCT,
    minMargin: options.minMargin ?? DEFAULT_MIN_MARGIN,
    overlap: Math.min(Math.max(options.tileOverlap ?? DEFAULT_TILE_OVERLAP, 0), 0.9),
    pageSize: options.pageSize,
    itemRank: new Map(
      [...project.items].sort(compareItemsForBudget).map((item, i) => [item.id, i]),
    ),
    projectRank: new Map(project.items.map((item, i) => [item.id, i])),
    duct: new Map(
      ductRuns(project)
        .filter((r) => r.id)
        .map((r) => [r.id as string, r]),
    ),
    vrf,
    norma: (project.duct ?? DEFAULT_DUCT_SETTINGS).norma,
  };

  const markings = collectMarkings(project, filter);
  const drafts: Draft[] = [];
  /**
   * Report pages and markings per cover entry (location id, NO_LOCATION); each marking with the
   * zone whose repeat it counts with (null = its own).
   */
  const entries = new Map<
    string,
    { name: string; markings: Map<Marking, Zone | null>; drafts: Draft[] }
  >();
  const skipped: ReportPlan["skipped"] = [];

  if (options.wholeSheet) {
    for (const sheet of bySheet(project, markings)) {
      const { drawingId, page } = sheet[0].m;
      const zones = project.zones.filter((z) => z.drawingId === drawingId && z.page === page);
      const size = options.pageSize?.(drawingId, page);
      const content = size
        ? { minX: 0, minY: 0, maxX: size.width, maxY: size.height }
        : withMargin(union([...sheet.map((k) => k.box), ...zones.map((z) => bbox(z.points))]), ctx);
      const fit = frameCrop(content, ctx, drawingId, page, Number.POSITIVE_INFINITY);
      const draft: Draft = {
        kind: "sheet",
        drawingId,
        drawingName: drawingOf(project, drawingId)?.name ?? "",
        page,
        scale: pageScale(project, drawingId, page),
        locationId: null,
        locationName: "",
        regionId: null,
        region: null,
        regionRepeat: 1,
        polygon: null,
        heading: `${sheetName(project, drawingId)} · p.${page + 1}`,
        crop: fit.crop,
        zoom: fit.zoom,
        measurementIds: sheet.map((k) => k.m.id),
        countedIds: sheet.map((k) => k.m.id),
        counted: sheet,
        rowsScope: "page",
      };
      drafts.push(draft);
      for (const k of sheet) {
        const id = k.zone?.locationId ?? NO_LOCATION;
        const name =
          id === NO_LOCATION
            ? UNASSIGNED_NAME
            : (project.locations.find((l) => l.id === id)?.name ?? "");
        const e = entries.get(id) ?? { name, markings: new Map(), drafts: [] as Draft[] };
        e.markings.set(k, k.zone);
        if (!e.drafts.includes(draft)) e.drafts.push(draft);
        entries.set(id, e);
      }
    }
  } else {
    const rank = drawingRank(project);
    const zoneIndex = new Map(project.zones.map((z, i) => [z.id, i]));
    const byZone = markingsByRegion(project, markings);
    const chosen = options.locationIds ? new Set(options.locationIds) : null;
    for (const loc of project.locations) {
      if (chosen && !chosen.has(loc.id)) continue;
      const regions = project.zones
        .filter((z) => z.locationId === loc.id)
        .sort(
          (a, b) =>
            rank(a.drawingId) - rank(b.drawingId) ||
            a.page - b.page ||
            (zoneIndex.get(a.id) ?? 0) - (zoneIndex.get(b.id) ?? 0),
        );
      const e = {
        name: loc.name,
        markings: new Map<Marking, Zone | null>(),
        drafts: [] as Draft[],
      };
      for (const zone of regions) {
        const inside = byZone.get(zone.id);
        if (!inside?.length) continue; // nothing selected here: no cutout
        const pages = planRegion(
          {
            drawingId: zone.drawingId,
            page: zone.page,
            locationId: loc.id,
            locationName: loc.name,
            zone,
            markings: inside,
          },
          ctx,
        );
        drafts.push(...pages);
        e.drafts.push(...pages);
        for (const k of inside) {
          // in two overlapping regions of the location: the smaller one's repeat
          const prev = e.markings.get(k);
          if (!prev || polygonArea(zone.points) < polygonArea(prev.points)) e.markings.set(k, zone);
        }
      }
      if (e.drafts.length) entries.set(loc.id, e);
      else skipped.push({ locationId: loc.id, name: loc.name });
    }
    if (options.includeUnassigned) {
      const loose = markings.filter((k) => !k.zone);
      const e = {
        name: UNASSIGNED_NAME,
        markings: new Map<Marking, Zone | null>(loose.map((k) => [k, null])),
        drafts: [] as Draft[],
      };
      for (const sheet of bySheet(project, loose)) {
        const pages = planRegion(
          {
            drawingId: sheet[0].m.drawingId,
            page: sheet[0].m.page,
            locationId: NO_LOCATION,
            locationName: UNASSIGNED_NAME,
            zone: null,
            markings: sheet,
          },
          ctx,
        );
        drafts.push(...pages);
        e.drafts.push(...pages);
      }
      if (e.drafts.length) entries.set(NO_LOCATION, e);
    }
  }

  // indices, key-map frames and "também em" now that every page has its place
  const indexOf = new Map(drafts.map((d, i) => [d, i]));
  const firstOfRegion = new Map<string, Draft>();
  for (const d of drafts) {
    if (d.regionId && !firstOfRegion.has(d.regionId)) firstOfRegion.set(d.regionId, d);
  }
  const pages: ReportPage[] = drafts.map((d, index) => {
    const { counted, region, frames, ...rest } = d;
    const alsoIn: SheetRef[] = [];
    if (d.regionId && d.locationId) {
      for (const other of firstOfRegion.values()) {
        if (other.locationId !== d.locationId) continue;
        if (other.drawingId === d.drawingId && other.page === d.page) continue;
        if (alsoIn.some((s) => s.drawingId === other.drawingId && s.page === other.page)) continue;
        alsoIn.push({
          drawingId: other.drawingId,
          page: other.page,
          label: `${sheetName(project, other.drawingId)} p.${other.page + 1}`,
          pageIndex: indexOf.get(other) ?? 0,
        });
      }
    }
    const lists = region ? listsOf(counted, ctx, () => region) : listsOf(counted, ctx);
    const page: ReportPage = { ...rest, index, alsoIn, ...lists };
    if (frames) {
      // frames are in the order their pages follow the key map
      page.frames = frames.map((f, i) => ({ ...f, pageIndex: index + 1 + i }));
    }
    return page;
  });

  // cover: one entry per location, in report order, "Sem local" last
  const order = [...entries.keys()].sort((a, b) => {
    if (a === NO_LOCATION || b === NO_LOCATION) return a === NO_LOCATION ? 1 : -1;
    const ra = project.locations.findIndex((l) => l.id === a);
    const rb = project.locations.findIndex((l) => l.id === b);
    return ra - rb;
  });
  const locations: ReportLocationSummary[] = order.map((id) => {
    const e = entries.get(id)!;
    const idx = e.drafts.map((d) => indexOf.get(d) ?? 0).sort((a, b) => a - b);
    const marks = [...e.markings.keys()];
    // other locations whose markings (smallest zone, as the budget) lie in this one's regions
    const inner = new Set(
      options.wholeSheet || id === NO_LOCATION
        ? []
        : marks.map((k) => k.zone?.locationId).filter((l) => l !== undefined && l !== id),
    );
    return {
      locationId: id,
      name: e.name,
      regions: new Set(e.drafts.map((d) => d.regionId).filter(Boolean)).size,
      markings: marks.length,
      pages: idx,
      pagesLabel: pagesLabel(e.drafts.map((d) => d.kind)),
      containsLocations: project.locations.filter((l) => inner.has(l.id)).map((l) => l.name),
      ...listsOf(marks, ctx, (k) => e.markings.get(k) ?? null),
    };
  });
  // the grand total counts each marking once, with budget semantics (own smallest zone)
  const all = new Set(order.flatMap((id) => [...(entries.get(id)?.markings.keys() ?? [])]));
  const filterLabel = describeFilter(project, filter);
  return {
    layout,
    frame,
    legibilityFloor: floor,
    filterLabel,
    cover: {
      filterLabel,
      locations,
      nested: locations.some((l) => l.containsLocations.length > 0),
      totals: listsOf(
        markings.filter((k) => all.has(k)),
        ctx,
      ),
    },
    pages,
    skipped,
  };
}
