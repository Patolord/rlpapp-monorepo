/**
 * The cutout report's PDF writer: turns a `ReportPlan` into bytes with pdf-lib. It draws what the
 * plan says into the plan's layout boxes and makes no layout decisions of its own beyond fitting
 * text (long names shrink, then truncate) and flowing lists that overflow their box onto
 * continuation pages.
 *
 * The original drawing stays vector. Each distinct source page is embedded once as a Form
 * XObject in its own user space (`embedSheet`: one object copier per source PDF, so shared fonts
 * and images are copied once, and the sheet's content stream is copied still encoded); every
 * cutout of that page is a tiny wrapper form whose BBox is the crop in user space (the clip) and
 * whose Matrix maps it into the frame. File size grows with the distinct source pages, not with
 * the cutouts.
 *
 * Markings are painted from `markingShapes`, like the viewer canvas, mapped with `pageToFrame`.
 */
import fontkit from "@pdf-lib/fontkit";
import {
  appendBezierCurve,
  type Color,
  clip,
  closePath,
  concatTransformationMatrix,
  decodePDFRawStream,
  drawObject,
  drawSvgPath,
  endPath,
  fill,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  type PDFDocument as PDFDocumentType,
  type PDFFont,
  PDFName,
  PDFObjectCopier,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  PDFRawStream,
  type PDFRef,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setDashPattern,
  setFillingColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
} from "pdf-lib";
import type { Box, Pt } from "../geom";
import type { Kit } from "../kits";
import { labelCarriers, type MarkingShape, markingShapes } from "../markingShapes";
import type { SymbolDef } from "../symbols";
import { symbolDef } from "../symbols";
import type { Item, Measurement, Project } from "../types";
import { formatMoney, formatNumber, type PageScale, scaleRatio, type Unit } from "../units";
import {
  type PageRotation,
  type PageView,
  pageToFrame,
  rectToPdfUserSpace,
  userToFrameTransform,
  type ViewportTransform,
  viewportSize,
  viewportTransform,
} from "./coords";
import { type LabelSize, labelCandidates, placeLabel } from "./labels";
import { omittedNote } from "./pages";
import type {
  DuctBreakdownRow,
  Rect,
  ReportItemRow,
  ReportLists,
  ReportPage,
  ReportPlan,
  Size,
  VrfBreakdownRow,
} from "./plan";

// ---------------------------------------------------------------------------------------------
// Sources

/** A drawing's original PDF, as read from disk, with the viewport transforms captured in session. */
export interface ReportSource {
  bytes: Uint8Array;
  /**
   * pdf.js `viewport.transform` at scale 1 per page (from the open session). Pages without one
   * get theirs from the PDF's own boxes (`pageViewport`), which is the same matrix.
   */
  transforms?: readonly (ViewportTransform | undefined)[];
}

/** A source PDF parsed by pdf-lib, with the page-space geometry of each page. */
export interface LoadedSource {
  doc: PDFDocumentType;
  transforms: ViewportTransform[];
  sizes: Size[];
}

export type LoadedSources = Map<string, LoadedSource>;

const normRotation = (deg: number): PageRotation => {
  if (deg % 90 !== 0) return 0;
  return (((deg % 360) + 360) % 360) as PageRotation;
};

/**
 * The pdf.js viewport (scale 1) of a page from its boxes, read with pdf-lib: visible box =
 * CropBox ∩ MediaBox (MediaBox when they do not meet), `/Rotate` normalised like pdf.js does.
 */
export function pageViewport(page: PDFPage): {
  transform: ViewportTransform;
  width: number;
  height: number;
} {
  const norm = (r: { x: number; y: number; width: number; height: number }) =>
    [
      Math.min(r.x, r.x + r.width),
      Math.min(r.y, r.y + r.height),
      Math.max(r.x, r.x + r.width),
      Math.max(r.y, r.y + r.height),
    ] as const;
  const media = norm(page.getMediaBox());
  const crop = norm(page.getCropBox());
  let view: PageView = [
    Math.max(media[0], crop[0]),
    Math.max(media[1], crop[1]),
    Math.min(media[2], crop[2]),
    Math.min(media[3], crop[3]),
  ];
  if (view[2] <= view[0] || view[3] <= view[1]) view = media;
  const rotate = normRotation(page.getRotation().angle);
  return { transform: viewportTransform(view, rotate), ...viewportSize(view, rotate) };
}

/** Parse the source PDFs once (for planning with their page sizes, then writing). */
export async function loadReportSources(
  sources: Record<string, ReportSource>,
): Promise<LoadedSources> {
  const out: LoadedSources = new Map();
  for (const [drawingId, src] of Object.entries(sources)) {
    const doc = await PDFDocument.load(src.bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const transforms: ViewportTransform[] = [];
    const sizes: Size[] = [];
    doc.getPages().forEach((p, i) => {
      const vp = pageViewport(p);
      const t = src.transforms?.[i] ?? vp.transform;
      transforms.push(t);
      sizes.push({ width: vp.width, height: vp.height });
    });
    out.set(drawingId, { doc, transforms, sizes });
  }
  return out;
}

/** `ReportOptions.pageSize` from loaded sources. */
export const sourcePageSize =
  (sources: LoadedSources) =>
  (drawingId: string, page: number): Size | undefined =>
    sources.get(drawingId)?.sizes[page];

// ---------------------------------------------------------------------------------------------
// Options

export interface ReportFonts {
  /** TTF bytes with Portuguese accents (Liberation Sans in the app). */
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface WriteOptions {
  project: Project;
  fonts: ReportFonts;
  /** Material, labour and total columns (default off: the report goes to contractors). */
  prices?: boolean;
  /** Quantity labels on the markings, duct section a×b on runs (default on). */
  labels?: boolean;
  /**
   * The catalog's kit presets: a kit run's label follows its kit's current label, like on
   * screen (without them, the label saved with the run).
   */
  kits?: readonly Kit[];
  /** Wash out the drawing outside the region polygon (default on). */
  washOut?: boolean;
  /** Cover page with the summary per location and the page index (default on). */
  cover?: boolean;
  /** Date printed in the headers; default today (pt-BR). */
  date?: string;
  /** Drawings left out because their PDF was not found; listed on the cover. */
  missing?: readonly string[];
  /**
   * Text runs of a source page, page space (as `lib/pdf/text` extracts them), for drawings open
   * in the session. Labels are placed off them; without them labels only avoid each other.
   */
  textBoxes?: (drawingId: string, page: number) => readonly Box[] | undefined;
  /**
   * Draw only these pages: plan page indices (each with its list continuations) and/or the
   * cover. The layout and the numbering stay those of the whole report ("página n de N", the
   * cover's index, key-map and "também em" references), and only the source sheets those pages
   * show are embedded, so the preview can write the page in view at once. Default: every page.
   */
  pages?: readonly (number | "cover")[];
  /** Told, once laid out and before drawing, which report pages the output holds, in order. */
  onPages?: (pages: readonly WrittenPage[]) => void;
  /** Called after each page is drawn (await it to let the UI update). */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

/** A page of the output PDF, as `WriteOptions.onPages` describes it. */
export interface WrittenPage {
  /** Its number in the whole report, from 1 ("página n de N"). */
  number: number;
  /** Pages in the whole report (N). */
  total: number;
  /** Plan page it shows; undefined for the cover. */
  planIndex?: number;
  /** 0 for the page itself, 1… for the continuation pages of its list. */
  continuation: number;
}

// ---------------------------------------------------------------------------------------------
// Drawing primitives

/** Output points per screen pixel: markings print at the size they have on screen at 60 %. */
const PX = 0.6;
const MARK_PX = 18;
const TEXT = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.86);
const FRAME_BLUE = rgb(0.169, 0.224, 0.565);
const WHITE = rgb(1, 1, 1);
const LABEL_BG = rgb(15 / 255, 15 / 255, 15 / 255);

const hexColor = (hex: string): Color => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(n)) return TEXT;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** One output page and what drawing on it needs. */
class Canvas {
  private states = new Map<string, PDFName>();
  constructor(
    readonly doc: PDFDocumentType,
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {}

  ops(...ops: (PDFOperator | undefined | false)[]) {
    this.page.pushOperators(...(ops.filter(Boolean) as PDFOperator[]));
  }

  /** ExtGState with fill / stroke opacity, one per value on the page. */
  alpha(fillAlpha: number, strokeAlpha = fillAlpha): PDFName {
    const key = `${fillAlpha}|${strokeAlpha}`;
    let name = this.states.get(key);
    if (!name) {
      const dict = this.doc.context.obj({ Type: "ExtGState", ca: fillAlpha, CA: strokeAlpha });
      name = this.page.node.newExtGState("GS", dict);
      this.states.set(key, name);
    }
    return name;
  }

  width(text: string, size: number, bold = false): number {
    return (bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(text, size);
  }

  /**
   * Text on a baseline. With `maxWidth` it shrinks to at most `minSize` and then ends in "…"
   * so it never runs past its box.
   */
  text(
    s: string,
    x: number,
    y: number,
    o: {
      size: number;
      bold?: boolean;
      color?: Color;
      maxWidth?: number;
      align?: "left" | "right" | "center";
      minSize?: number;
    },
  ) {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const { text, size } = fitText(font, s, o.size, o.maxWidth, o.minSize);
    if (!text) return;
    const w = font.widthOfTextAtSize(text, size);
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0;
    this.page.drawText(text, { x: x + dx, y, size, font, color: o.color ?? TEXT });
  }

  rect(r: Rect, o: { fill?: Color; stroke?: Color; width?: number; alpha?: number }) {
    this.ops(
      pushGraphicsState(),
      o.alpha !== undefined && setGraphicsState(this.alpha(o.alpha)),
      o.fill && setFillingColor(o.fill),
      o.stroke && setStrokingColor(o.stroke),
      o.stroke && setLineWidth(o.width ?? 0.5),
      rectangle(r.x, r.y, r.width, r.height),
      o.fill && o.stroke
        ? PDFOperator.of(PDFOperatorNames.FillNonZeroAndStroke)
        : o.fill
          ? fill()
          : stroke(),
      popGraphicsState(),
    );
  }

  line(a: Pt, b: Pt, color: Color, width = 0.5) {
    this.ops(
      pushGraphicsState(),
      setStrokingColor(color),
      setLineWidth(width),
      moveTo(a.x, a.y),
      lineTo(b.x, b.y),
      stroke(),
      popGraphicsState(),
    );
  }
}

/** Shrink, then truncate with an ellipsis, until the text fits `maxWidth`. */
function fitText(
  font: PDFFont,
  s: string,
  size: number,
  maxWidth?: number,
  minSize = size * 0.8,
): { text: string; size: number } {
  const clean = s.replace(/\s+/g, " ").trim();
  if (maxWidth === undefined || font.widthOfTextAtSize(clean, size) <= maxWidth) {
    return { text: clean, size };
  }
  const shrunk = Math.max(minSize, size * (maxWidth / font.widthOfTextAtSize(clean, size)));
  if (font.widthOfTextAtSize(clean, shrunk) <= maxWidth) return { text: clean, size: shrunk };
  let lo = 0;
  let hi = clean.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(`${clean.slice(0, mid).trimEnd()}…`, shrunk) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return { text: lo > 0 ? `${clean.slice(0, lo).trimEnd()}…` : "", size: shrunk };
}

/** pdf-lib's SVG path operators with the optional fields optional. */
const svgOps = (
  d: string,
  o: Partial<Parameters<typeof drawSvgPath>[1]> & { x: number; y: number; scale: number },
): PDFOperator[] =>
  drawSvgPath(d, { color: undefined, borderColor: undefined, borderWidth: 0, ...o });

/** A circle as four Bézier arcs. */
function circleOps(c: Pt, r: number): PDFOperator[] {
  const k = 0.5523 * r;
  return [
    moveTo(c.x + r, c.y),
    appendBezierCurve(c.x + r, c.y + k, c.x + k, c.y + r, c.x, c.y + r),
    appendBezierCurve(c.x - k, c.y + r, c.x - r, c.y + k, c.x - r, c.y),
    appendBezierCurve(c.x - r, c.y - k, c.x - k, c.y - r, c.x, c.y - r),
    appendBezierCurve(c.x + k, c.y - r, c.x + r, c.y - k, c.x + r, c.y),
    closePath(),
  ];
}

/** A count symbol (24×24 SVG paths, y down) centred on `c`, `size` points wide. */
function drawSymbolAt(cv: Canvas, def: SymbolDef, c: Pt, size: number, color: Color) {
  const k = size / 24;
  const at = { x: c.x - size / 2, y: c.y + size / 2, scale: k };
  if (def.id === "dot") {
    cv.ops(
      ...svgOps(def.paths[0], { ...at, color, borderWidth: 0 }),
      ...svgOps(def.paths[0], {
        ...at,
        borderColor: rgb(0, 0, 0),
        borderWidth: (1.5 * PX) / k,
        graphicsState: cv.alpha(0.7),
      }),
    );
    return;
  }
  cv.ops(
    ...svgOps(def.paths[0], {
      ...at,
      color: WHITE,
      borderWidth: 0,
      graphicsState: cv.alpha(0.92),
    }),
  );
  for (const d of def.paths) {
    cv.ops(
      pushGraphicsState(),
      setLineJoin(LineJoinStyle.Round),
      ...svgOps(d, {
        ...at,
        borderColor: color,
        borderWidth: (2 * PX) / k,
        borderLineCap: LineCapStyle.Round,
      }),
      popGraphicsState(),
    );
  }
  for (const d of def.fills ?? []) cv.ops(...svgOps(d, { ...at, color, borderWidth: 0 }));
}

const PILL_TEXT = 11 * PX;

/** Size of a label pill, output points. */
const pillSize = (cv: Canvas, text: string): LabelSize => ({
  w: cv.width(text, PILL_TEXT) + 12 * PX,
  h: 18 * PX,
});

/** The viewer's label pill: dark box, item-coloured border, white text, centred on `c`. */
function drawLabelPill(cv: Canvas, text: string, c: Pt, accent: Color) {
  const size = PILL_TEXT;
  const { w, h } = pillSize(cv, text);
  const r = 4 * PX;
  const x = c.x - w / 2;
  const y = c.y - h / 2;
  const path = `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
  cv.ops(
    ...svgOps(path, {
      x,
      y: y + h,
      scale: 1,
      color: LABEL_BG,
      graphicsState: cv.alpha(0.85, 1),
      borderColor: accent,
      borderWidth: PX,
    }),
  );
  cv.text(text, c.x, c.y - size * 0.35, { size, color: WHITE, align: "center" });
}

// ---------------------------------------------------------------------------------------------
// Flowing lists (item table, duct and VRF breakdowns, cover tables)

export interface Row {
  h: number;
  draw: (cv: Canvas, x: number, top: number, width: number) => void;
}

/** A titled table: the title and head repeat when it continues in another column. */
export interface Block {
  title: (continued: boolean) => Row;
  head?: Row;
  rows: Row[];
  /** Height of what follows that must fit in the same column (a heading over its tables). */
  keep?: number;
  /**
   * Consecutive blocks sharing a group (a location on the cover: its heading and its tables)
   * start a new column together when they fit in one; when they do not, the group's heading
   * repeats ("(cont.)") atop each column they continue in.
   */
  group?: BlockGroup;
}

export interface BlockGroup {
  heading: (continued: boolean) => Row;
}

export interface Placed {
  row: Row;
  region: number;
  top: number;
}

const BLOCK_GAP = 8;

/**
 * Lay the blocks out top-down in `regionAt(0)`, `regionAt(1)`, …; returns the placements and
 * how many regions were used. Pure measuring: nothing is drawn yet.
 */
export function flowBlocks(
  blocks: readonly Block[],
  regionAt: (i: number) => Rect,
): { placed: Placed[]; regions: number } {
  const placed: Placed[] = [];
  let region = 0;
  let r = regionAt(0);
  let y = r.y + r.height;
  let empty = true;
  const next = () => {
    region++;
    r = regionAt(region);
    y = r.y + r.height;
    empty = true;
  };
  const put = (row: Row) => {
    placed.push({ row, region, top: y });
    y -= row.h;
    empty = false;
  };
  const room = () => y - r.y;
  const sum = (rows: readonly Row[]) => rows.reduce((s, row) => s + row.h, 0);
  const blockH = (b: Block) => sum([b.title(false), ...(b.head ? [b.head] : []), ...b.rows]);
  blocks.forEach((b, i) => {
    const groupStart = b.group !== undefined && blocks[i - 1]?.group !== b.group;
    if (groupStart && !empty) {
      // the whole group in the next column when it fits there but not in what is left here
      let h = 0;
      for (let j = i; j < blocks.length && blocks[j].group === b.group; j++) {
        h += (j > i ? BLOCK_GAP : 0) + blockH(blocks[j]);
      }
      if (h > room() - BLOCK_GAP && h <= regionAt(region + 1).height) next();
    }
    // a new column inside a group starts with the group's heading again
    const nextInGroup = () => {
      next();
      if (b.group && !groupStart) put(b.group.heading(true));
    };
    if (!empty) y -= BLOCK_GAP;
    const lead = (cont: boolean) => [b.title(cont), ...(b.head ? [b.head] : [])];
    // keep the title with the head and the first row
    if (!empty && sum(lead(false)) + (b.rows[0]?.h ?? 0) + (b.keep ?? 0) > room()) nextInGroup();
    for (const row of lead(false)) put(row);
    for (const row of b.rows) {
      // a row taller than a whole region is placed anyway rather than looping
      if (row.h > room() && !empty) {
        nextInGroup();
        for (const l of lead(true)) put(l);
      }
      put(row);
    }
  });
  return { placed, regions: region + 1 };
}

// table geometry, output points
const ROW_H = 10.5;
const ROW_SIZE = 7;
const HEAD_H = 11;
const HEAD_SIZE = 6.3;
const TITLE_H = 14;
const TITLE_SIZE = 8.5;
/** A heading keeps the title, head and first row of the next table with it. */
const KEEP = BLOCK_GAP + TITLE_H + HEAD_H + ROW_H;

interface Column {
  head: string;
  /** Fixed width; the one column without it takes the rest. */
  width?: number;
  align?: "left" | "right";
}

/** Column x positions and widths for a table width. */
function columnBoxes(cols: readonly Column[], width: number): { x: number; w: number }[] {
  const fixed = cols.reduce((s, c) => s + (c.width ?? 0), 0);
  const flex = Math.max(20, width - fixed);
  let x = 0;
  return cols.map((c) => {
    const w = c.width ?? flex;
    const box = { x, w };
    x += w;
    return box;
  });
}

const titleRow =
  (text: string, sub?: string): ((continued: boolean) => Row) =>
  (continued) => ({
    h: TITLE_H,
    draw: (cv, x, top, width) => {
      const label = continued ? `${text} (cont.)` : text;
      cv.text(label, x, top - TITLE_SIZE - 2, {
        size: TITLE_SIZE,
        bold: true,
        maxWidth: sub ? width * 0.62 : width,
      });
      if (sub) {
        cv.text(sub, x + width, top - TITLE_SIZE - 2, {
          size: ROW_SIZE - 0.5,
          color: MUTED,
          align: "right",
          maxWidth: width * 0.36,
        });
      }
    },
  });

const headRow = (cols: readonly Column[]): Row => ({
  h: HEAD_H,
  draw: (cv, x, top, width) => {
    const boxes = columnBoxes(cols, width);
    cols.forEach((c, i) => {
      const b = boxes[i];
      const pad = 2;
      cv.text(c.head, c.align === "right" ? x + b.x + b.w - pad : x + b.x + pad, top - 7.5, {
        size: HEAD_SIZE,
        bold: true,
        color: MUTED,
        align: c.align === "right" ? "right" : "left",
        maxWidth: b.w - 2 * pad,
      });
    });
    cv.line({ x, y: top - HEAD_H + 1 }, { x: x + width, y: top - HEAD_H + 1 }, RULE, 0.5);
  },
});

/** A plain row of cells; `swatch` draws in a leading column of its own. */
const cellsRow = (
  cols: readonly Column[],
  cells: readonly string[],
  o: { bold?: boolean; swatch?: (cv: Canvas, c: Pt) => void; rule?: boolean } = {},
): Row => ({
  h: ROW_H,
  draw: (cv, x, top, width) => {
    const boxes = columnBoxes(cols, width);
    const base = top - ROW_H + 3;
    if (o.rule) cv.line({ x, y: top - 0.5 }, { x: x + width, y: top - 0.5 }, RULE, 0.5);
    cols.forEach((c, i) => {
      const b = boxes[i];
      if (o.swatch && i === 0 && cells[0] === "") {
        o.swatch(cv, { x: x + b.x + b.w / 2, y: top - ROW_H / 2 });
        return;
      }
      const pad = 2;
      cv.text(cells[i] ?? "", c.align === "right" ? x + b.x + b.w - pad : x + b.x + pad, base, {
        size: ROW_SIZE,
        bold: o.bold,
        align: c.align === "right" ? "right" : "left",
        maxWidth: b.w - 2 * pad,
        minSize: ROW_SIZE * 0.85,
      });
    });
  },
});

/** The colour/symbol swatch of an item row. */
function swatch(row: ReportItemRow): (cv: Canvas, c: Pt) => void {
  const color = hexColor(row.color);
  return (cv, c) => {
    if (row.kind === "count") {
      drawSymbolAt(cv, symbolDef(row.symbol), c, 7.5, color);
    } else if (row.kind === "linear") {
      cv.ops(
        pushGraphicsState(),
        setStrokingColor(color),
        setLineWidth(2),
        setLineCap(LineCapStyle.Round),
        moveTo(c.x - 3.5, c.y),
        lineTo(c.x + 3.5, c.y),
        stroke(),
        popGraphicsState(),
      );
    } else {
      cv.rect({ x: c.x - 3.5, y: c.y - 3, width: 7, height: 6 }, { fill: color, alpha: 0.35 });
      cv.rect({ x: c.x - 3.5, y: c.y - 3, width: 7, height: 6 }, { stroke: color, width: 1 });
    }
  };
}

interface ListCtx {
  project: Project;
  prices: boolean;
  items: Map<string, Item>;
}

/**
 * The measured quantity (repeats applied, no waste): the report shows what is drawn, for the
 * contractor to check, not the budget's padded quantity. Prices, when on, use the same number,
 * so each row reads quantity × unit price.
 */
const qtyText = (ctx: ListCtx, row: ReportItemRow) =>
  formatNumber(row.qty, ctx.project.currency, row.kind === "count" ? 0 : 2);

/** Tables listing `lists`: items (with prices when on), then duct and VRF breakdowns. */
function listBlocks(
  lists: ReportLists,
  ctx: ListCtx,
  width: number,
  itemsTitle: string,
  itemsSub?: string,
): Block[] {
  const blocks: Block[] = [];
  const money = (v: number) => formatMoney(v, ctx.project.currency);
  const num = (v: number, d = 2) => formatNumber(v, ctx.project.currency, d);
  if (lists.rows.length > 0) {
    const wide = ctx.prices && width >= 360;
    const cols: Column[] = [
      { head: "", width: 12 },
      { head: "Item" },
      { head: "Un", width: 22 },
      { head: "Qtd", width: 44, align: "right" },
      ...(wide
        ? ([
            { head: "Material", width: 56, align: "right" },
            { head: "M.O.", width: 56, align: "right" },
            { head: "Total", width: 60, align: "right" },
          ] as Column[])
        : []),
    ];
    const rows: Row[] = [];
    let total = 0;
    for (const r of lists.rows) {
      const item = ctx.items.get(r.itemId);
      const mat = (item?.materialPrice ?? 0) * r.qty;
      const lab = (item?.laborPrice ?? 0) * r.qty;
      total += mat + lab;
      const name = r.unscaled > 0 ? `${r.name} (${r.unscaled} sem escala)` : r.name;
      const cells = ["", name, r.unit, qtyText(ctx, r)];
      if (wide) cells.push(money(mat), money(lab), money(mat + lab));
      rows.push(cellsRow(cols, cells, { swatch: swatch(r) }));
      if (ctx.prices && !wide) {
        rows.push({
          h: ROW_H - 1.5,
          draw: (cv, x, top, w) =>
            cv.text(
              `Mat. ${money(mat)} · M.O. ${money(lab)} · Total ${money(mat + lab)}`,
              x + w - 2,
              top - ROW_H + 4.5,
              { size: ROW_SIZE - 1, color: MUTED, align: "right", maxWidth: w - 14 },
            ),
        });
      }
    }
    if (ctx.prices) {
      const cells = wide
        ? ["", "Total", "", "", "", "", money(total)]
        : ["", "Total", "", money(total)];
      const totalCols = wide ? cols : [cols[0], cols[1], cols[2], { ...cols[3], width: 90 }];
      rows.push(cellsRow(totalCols, cells, { bold: true, rule: true }));
    }
    blocks.push({ title: titleRow(itemsTitle, itemsSub), head: headRow(cols), rows });
  }

  const ductCols: Column[] = [
    { head: "Seção", width: 38 },
    { head: "Isolamento" },
    { head: "Bitola", width: 30 },
    { head: "Compr. (m)", width: 44, align: "right" },
    { head: "Chapa (m²)", width: 44, align: "right" },
  ];
  for (const [name, rows] of groupBy(lists.ducts, (d) => d.networkName)) {
    const len = rows.reduce((s, r) => s + r.length, 0);
    const area = rows.reduce((s, r) => s + r.area, 0);
    blocks.push({
      title: titleRow(`Dutos · ${name}`),
      head: headRow(ductCols),
      rows: [
        ...rows.map((r: DuctBreakdownRow) =>
          cellsRow(ductCols, [r.section, r.insulationLabel, r.gauge, num(r.length), num(r.area)]),
        ),
        cellsRow(ductCols, ["Total", "", "", num(len), num(area)], { bold: true, rule: true }),
      ],
    });
  }

  const vrfCols: Column[] = [
    { head: "Trecho" },
    { head: "Gás", width: 34 },
    { head: "Líquido", width: 34 },
    { head: "Compr. (m)", width: 44, align: "right" },
  ];
  for (const [name, rows] of groupBy(lists.vrf, (v) => v.systemName)) {
    const len = rows.reduce((s, r) => s + r.length, 0);
    blocks.push({
      title: titleRow(`VRF · ${name}`),
      head: headRow(vrfCols),
      rows: [
        ...rows.map((r: VrfBreakdownRow) =>
          cellsRow(vrfCols, [r.roleLabel, `${r.gas}"`, `${r.liquid}"`, num(r.length)]),
        ),
        cellsRow(vrfCols, ["Total", "", "", num(len)], { bold: true, rule: true }),
      ],
    });
  }
  return blocks;
}

function groupBy<T>(list: readonly T[], key: (t: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const t of list) {
    const k = key(t);
    const g = out.get(k);
    if (g) g.push(t);
    else out.set(k, [t]);
  }
  return [...out.entries()];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Words of `text` in lines no wider than `maxWidth` (a word longer than that gets its own). */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** "a", "a e b", "a, b e c". */
const listPt = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;

/**
 * The cover's note when a location contains others (a floor around its rooms): its totals
 * include theirs, and the grand total still counts each item once. Undefined when none does.
 */
export function nestedNote(plan: ReportPlan, grandTotal: boolean): string | undefined {
  const outer = plan.cover.locations.filter((l) => l.containsLocations.length > 0);
  if (outer.length === 0) return undefined;
  const quoted = listPt(outer.map((l) => `“${l.name}”`));
  const inner = [...new Set(outer.flatMap((l) => l.containsLocations))];
  const head =
    outer.length === 1
      ? `O local ${quoted} inclui os itens dos locais dentro dele (${listPt(inner)})`
      : `Os locais ${quoted} incluem os itens dos locais dentro deles (${listPt(inner)})`;
  return grandTotal ? `${head}; o TOTAL GERAL conta cada item uma vez.` : `${head}.`;
}

/** A one-cell paragraph row (warnings, notes). */
const noteRow = (text: string, color: Color = TEXT): Row => ({
  h: ROW_H,
  draw: (cv, x, top, width) =>
    cv.text(text, x + 2, top - ROW_H + 3, { size: ROW_SIZE, color, maxWidth: width - 4 }),
});

// ---------------------------------------------------------------------------------------------
// The writer

const ITEMS_TITLE: Record<ReportPage["kind"], string> = {
  cutout: "Itens do local",
  keymap: "Total do local nesta planta",
  cluster: "Itens deste trecho",
  tile: "Itens desta folha",
  sheet: "Itens desta planta",
};

const sheetName = (name: string) => name.replace(/\.pdf$/i, "");

/** "3", "3–5", "3–5, 9": report page numbers as compact ranges. */
function pageRanges(nums: readonly number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  return parts.join(", ");
}

/** Round scale-bar length: 1, 2 or 5 × 10ⁿ units, at most `maxPt` long. */
function niceLength(ptPerUnit: number, maxPt: number): number {
  const raw = maxPt / ptPerUnit;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [5, 2, 1]) if (m * p <= raw) return m * p;
  return p;
}

/**
 * "1:31" / "1:7,5": the printed scale with a decimal comma, like the tables. Whole numbers from
 * 1:20 up (a tenth means nothing there), one decimal below.
 */
export function scaleCaption(pointsPerUnit: number, unit: Unit): string {
  const r = scaleRatio(pointsPerUnit, unit);
  const rounded = Math.round(r);
  if (r >= 20 || Math.abs(r - rounded) < 0.05) return `1:${rounded}`;
  return `1:${r.toFixed(1).replace(".", ",")}`;
}

/**
 * A source page as a Form XObject in its own user space (BBox = MediaBox, identity matrix), like
 * pdf-lib's `embedPages` but without its costs: only the resources are copied (not the whole
 * page node, whose content would be saved twice), and a single content stream keeps its encoded
 * bytes and filter instead of being inflated and deflated again. On a heavy sheet that is most of
 * the writing time. Several content streams are joined (they may split mid-operator) and
 * deflated, as pdf-lib does.
 */
function embedSheet(doc: PDFDocumentType, page: PDFPage, copier: PDFObjectCopier): PDFRef {
  const node = page.node;
  const m = page.getMediaBox();
  const dict = {
    Type: "XObject",
    Subtype: "Form",
    FormType: 1,
    BBox: [m.x, m.y, m.x + m.width, m.y + m.height],
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: copier.copy(node.Resources() ?? doc.context.obj({})),
  };
  const contents = node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((r) => node.context.lookup(r))
      : [contents];
  const only = streams.length === 1 ? streams[0] : undefined;
  if (only instanceof PDFRawStream) {
    const filter = only.dict.get(PDFName.of("Filter"));
    const parms = only.dict.get(PDFName.of("DecodeParms"));
    const stream = doc.context.stream(only.contents, {
      ...dict,
      ...(filter ? { Filter: copier.copy(filter) } : {}),
      ...(parms ? { DecodeParms: copier.copy(parms) } : {}),
    });
    return doc.context.register(stream);
  }
  const parts: Uint8Array[] = [];
  for (const s of streams) {
    if (s instanceof PDFRawStream) parts.push(decodePDFRawStream(s).decode());
    else if (s instanceof PDFContentStream) parts.push(s.getUnencodedContents());
    else continue;
    parts.push(Uint8Array.of(0x0a));
  }
  const joined = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of parts) {
    joined.set(a, at);
    at += a.length;
  }
  return doc.context.register(doc.context.flateStream(joined, dict));
}

/** A page of output: what to draw on it once all page numbers are known. */
interface OutPage {
  draw: (
    cv: Canvas,
    number: number,
    total: number,
    numberOf: (planIndex: number) => number,
  ) => void;
  /** Plan page it belongs to (continuations included); undefined for the cover. */
  planIndex?: number;
  /** 0 for the first page of a plan page (or the cover), 1… for continuations. */
  continuation: number;
}

/**
 * Write the report. `sources` maps drawing ids to their original PDF (bytes, or already parsed
 * with `loadReportSources`); a page whose source is missing gets an empty frame with a note.
 */
export async function writeReport(
  plan: ReportPlan,
  sources: Record<string, ReportSource> | LoadedSources,
  options: WriteOptions,
): Promise<Uint8Array> {
  const { project } = options;
  const loaded = sources instanceof Map ? sources : await loadReportSources(sources);
  const prices = options.prices ?? false;
  const labels = options.labels ?? true;
  const washOut = options.washOut ?? true;
  const date = options.date ?? new Date().toLocaleDateString("pt-BR");
  const layout = plan.layout;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Relatório de recortes · ${project.name}`);
  doc.setCreator("Takeoff");
  doc.setProducer("Takeoff (pdf-lib)");
  const fonts: Fonts = {
    regular: await doc.embedFont(options.fonts.regular, { subset: true }),
    bold: await doc.embedFont(options.fonts.bold, { subset: true }),
  };

  const wanted = options.pages ? new Set(options.pages) : null;
  const drawn = (key: number | "cover") => !wanted || wanted.has(key);

  const items = new Map(project.items.map((i) => [i.id, i]));
  const measurements = new Map<string, Measurement>(project.measurements.map((m) => [m.id, m]));
  const kits = new Map((options.kits ?? []).map((k) => [k.id, k]));
  const listCtx: ListCtx = { project, prices, items };

  // each distinct source page once, one object copier per source PDF (shared resources once)
  const embedded = new Map<string, PDFRef>();
  const usedPages = new Map<string, Set<number>>();
  for (const p of plan.pages) {
    const src = loaded.get(p.drawingId);
    if (!src || p.page >= src.doc.getPageCount() || !drawn(p.index)) continue;
    const srcPage = src.doc.getPage(p.page);
    if (!srcPage.node.Contents()) continue; // a blank page: nothing to embed
    const set = usedPages.get(p.drawingId) ?? new Set<number>();
    set.add(p.page);
    usedPages.set(p.drawingId, set);
  }
  for (const [drawingId, pages] of usedPages) {
    const src = loaded.get(drawingId);
    if (!src) continue;
    const copier = PDFObjectCopier.for(src.doc.context, doc.context);
    for (const i of [...pages].sort((a, b) => a - b)) {
      embedded.set(`${drawingId}#${i}`, embedSheet(doc, src.doc.getPage(i), copier));
    }
  }
  /** Wrapper forms per (sheet, crop, zoom): BBox = crop in user space, Matrix = into the frame. */
  const wrappers = new Map<string, PDFRef>();
  const wrapperFor = (p: ReportPage) => {
    const form = embedded.get(`${p.drawingId}#${p.page}`);
    const t = loaded.get(p.drawingId)?.transforms[p.page];
    if (!form || !t) return null;
    const key = `${p.drawingId}#${p.page}#${p.crop.minX},${p.crop.minY},${p.crop.maxX},${p.crop.maxY}@${p.zoom}`;
    let ref = wrappers.get(key);
    if (!ref) {
      const box = rectToPdfUserSpace(p.crop, t);
      const stream = doc.context.formXObject([drawObject("P")], {
        BBox: [box.minX, box.minY, box.maxX, box.maxY],
        Matrix: [...userToFrameTransform(t, p.crop, p.zoom)],
        Resources: { XObject: { P: form } },
      });
      ref = doc.context.register(stream);
      wrappers.set(key, ref);
    }
    return ref;
  };

  // ------------------------------------------------------------------- header and footer

  const headerLines = (cv: Canvas, title: string, line2: string, line3: string) => {
    const h = layout.header;
    const top = h.y + h.height;
    const dateW = cv.width(date, 8) + 12;
    cv.text(title, h.x, top - 13, { size: 13, bold: true, maxWidth: h.width - dateW, minSize: 9 });
    cv.text(date, h.x + h.width, top - 11, { size: 8, color: MUTED, align: "right" });
    cv.text(line2, h.x, top - 28, { size: 8.5, maxWidth: h.width });
    cv.text(line3, h.x, top - 41, { size: 8.5, color: MUTED, maxWidth: h.width });
    cv.line({ x: h.x, y: h.y + 2 }, { x: h.x + h.width, y: h.y + 2 }, RULE, 0.75);
  };
  const projectLine = [
    project.name,
    project.client && `Cliente: ${project.client}`,
    project.proposalNumber && `Proposta nº ${project.proposalNumber}`,
    project.site && `Obra: ${project.site}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const filterText = plan.filterLabel || "Todos os itens";

  const footer = (cv: Canvas, n: number, total: number, left?: string) => {
    const f = layout.footer;
    cv.line({ x: f.x, y: f.y + f.height - 2 }, { x: f.x + f.width, y: f.y + f.height - 2 }, RULE);
    const right = `página ${n} de ${total}`;
    cv.text(right, f.x + f.width, f.y + 5, { size: 7.5, color: MUTED, align: "right" });
    if (left) {
      cv.text(left, f.x, f.y + 5, {
        size: 7.5,
        color: MUTED,
        maxWidth: f.width - cv.width(right, 7.5) - 20,
      });
    }
  };

  // body columns of a continuation or cover page: as wide as the list box, side by side
  const body: Rect = (() => {
    const a = layout.frame;
    const b = layout.list;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  })();
  const GAP = 14;
  const perPage = Math.max(
    1,
    Math.floor((body.width + GAP) / (Math.min(layout.list.width, 320) + GAP)),
  );
  const colW = (body.width - (perPage - 1) * GAP) / perPage;
  const bodyColumn = (i: number): Rect => ({
    x: body.x + (i % perPage) * (colW + GAP),
    y: body.y,
    width: colW,
    height: body.height,
  });

  const outPages: OutPage[] = [];
  /** First output page (0-based) of each plan page; filled before anything is drawn. */
  const firstOut: number[] = [];
  const numberOf = (planIndex: number) => (firstOut[planIndex] ?? 0) + 1;

  // ------------------------------------------------------------------- cover

  if (options.cover ?? true) {
    const blocks: Block[] = [];
    const idxCols: Column[] = [
      { head: "Local" },
      { head: "Páginas", width: 76 },
      { head: "Pág.", width: 54, align: "right" },
    ];
    // page numbers are known only after the flow; resolved at draw time
    const idxRows: Row[] = plan.cover.locations.map((l) => ({
      h: ROW_H,
      draw: (cv, x, top, width) => {
        const nums = l.pages.map(numberOf);
        cellsRow(idxCols, [l.name, l.pagesLabel, pageRanges(nums)]).draw(cv, x, top, width);
      },
    }));
    if (idxRows.length === 0) idxRows.push(noteRow("Nenhum local com itens do filtro.", MUTED));
    blocks.push({ title: titleRow("Índice"), head: headRow(idxCols), rows: idxRows });
    const warnings: Row[] = [];
    if (options.missing?.length) {
      warnings.push(noteRow("Plantas não encontradas (fora do relatório):", rgb(0.7, 0.25, 0.1)));
      for (const name of options.missing) warnings.push(noteRow(`• ${sheetName(name)}`));
    }
    if (plan.skipped.length) {
      warnings.push(noteRow("Locais sem itens do filtro (não incluídos):", MUTED));
      warnings.push(noteRow(plan.skipped.map((s) => s.name).join(", "), MUTED));
    }
    const omitted = omittedNote(plan);
    if (omitted) {
      warnings.push(noteRow(omitted, MUTED));
      const names = (plan.omitted ?? []).join(", ");
      for (const line of wrapText(fonts.regular, names, ROW_SIZE, colW - 4)) {
        warnings.push(noteRow(line, MUTED));
      }
    }
    if (warnings.length) blocks.push({ title: titleRow("Avisos"), rows: warnings });
    const grandTotal = plan.cover.locations.length > 1;
    const note = nestedNote(plan, grandTotal);
    if (note) {
      const lines = wrapText(fonts.regular, note, ROW_SIZE, colW - 4);
      blocks.push({ title: titleRow("Observação"), rows: lines.map((t) => noteRow(t)) });
    }
    const group = (heading: (continued: boolean) => Row, inner: Block[]) => {
      const g: BlockGroup = { heading };
      blocks.push({ title: heading, rows: [], keep: KEEP, group: g });
      for (const b of inner) blocks.push({ ...b, group: g });
    };
    for (const l of plan.cover.locations) {
      const sub = `${plural(l.regions, "região", "regiões")} · ${plural(l.markings, "marcação", "marcações")}`;
      group(titleRow(l.name.toUpperCase(), sub), listBlocks(l, listCtx, colW, "Itens"));
    }
    if (grandTotal) {
      group(titleRow("TOTAL GERAL"), listBlocks(plan.cover.totals, listCtx, colW, "Itens"));
    }
    const { placed, regions } = flowBlocks(blocks, bodyColumn);
    const coverPages = Math.ceil(regions / perPage);
    for (let k = 0; k < coverPages; k++) {
      outPages.push({
        continuation: k,
        draw: (cv, n, total) => {
          headerLines(
            cv,
            k === 0 ? "Relatório de recortes" : "Relatório de recortes (continuação)",
            projectLine,
            `${filterText} · ${plan.pages.length} ${plan.pages.length === 1 ? "recorte" : "recortes"}`,
          );
          for (const pl of placed) {
            if (Math.floor(pl.region / perPage) !== k) continue;
            const r = bodyColumn(pl.region);
            pl.row.draw(cv, r.x, pl.top, r.width);
          }
          footer(cv, n, total);
        },
      });
    }
  }

  // ------------------------------------------------------------------- cutout pages

  for (const p of plan.pages) {
    firstOut[p.index] = outPages.length;
    const sub =
      p.rowsScope === "region" && p.regionRepeat > 1 ? `×${p.regionRepeat} incluído` : undefined;
    const blocks = listBlocks(p, listCtx, layout.list.width, ITEMS_TITLE[p.kind], sub);
    if (blocks.length === 0) {
      blocks.push({
        title: titleRow(ITEMS_TITLE[p.kind]),
        rows: [noteRow("Nada a listar.", MUTED)],
      });
    }
    const regionAt = (i: number) => (i === 0 ? layout.list : bodyColumn(i - 1));
    const { placed, regions } = flowBlocks(blocks, regionAt);
    const conts = Math.ceil((regions - 1) / perPage);
    const sheetLine = `Planta: ${sheetName(p.drawingName)} · p.${p.page + 1} · ${filterText}`;
    const alsoIn = p.alsoIn.length
      ? (n: (i: number) => number) =>
          `também em: ${p.alsoIn.map((s) => `${s.label} (pág. ${n(s.pageIndex)})`).join(", ")}`
      : undefined;
    for (let k = 0; k <= conts; k++) {
      outPages.push({
        planIndex: p.index,
        continuation: k,
        draw: (cv, n, total, numberOf) => {
          headerLines(
            cv,
            k === 0 ? p.heading : `${p.heading} (continuação)`,
            projectLine,
            sheetLine,
          );
          if (k === 0) drawFrame(cv, p, numberOf);
          for (const pl of placed) {
            const page = pl.region === 0 ? 0 : 1 + Math.floor((pl.region - 1) / perPage);
            if (page !== k) continue;
            const r = regionAt(pl.region);
            pl.row.draw(cv, r.x, pl.top, r.width);
          }
          footer(cv, n, total, alsoIn?.(numberOf));
        },
      });
    }
  }

  // ------------------------------------------------------------------- the frame

  function drawFrame(cv: Canvas, p: ReportPage, numberOf: (i: number) => number) {
    const fr: Rect = {
      x: layout.frame.x,
      y: layout.frame.y,
      width: plan.frame.width,
      height: plan.frame.height,
    };
    const toFrame = (pt: Pt): Pt => {
      const f = pageToFrame(pt, p.crop, p.zoom);
      return { x: fr.x + f.x, y: fr.y + f.y };
    };
    const wrapper = wrapperFor(p);
    if (wrapper) {
      const name = cv.page.node.newXObject("Cut", wrapper);
      cv.ops(
        pushGraphicsState(),
        concatTransformationMatrix(1, 0, 0, 1, fr.x, fr.y),
        drawObject(name),
        popGraphicsState(),
      );
    } else {
      cv.rect(fr, { fill: rgb(0.96, 0.96, 0.96) });
      cv.text("Planta não disponível", fr.x + fr.width / 2, fr.y + fr.height / 2, {
        size: 10,
        color: MUTED,
        align: "center",
      });
    }

    cv.ops(pushGraphicsState(), rectangle(fr.x, fr.y, fr.width, fr.height), clip(), endPath());

    // wash-out: the frame minus the region polygon, white at 70 %
    if (p.polygon && p.polygon.length >= 3) {
      const poly = p.polygon.map(toFrame);
      if (washOut) {
        cv.ops(
          pushGraphicsState(),
          setGraphicsState(cv.alpha(0.7)),
          setFillingColor(WHITE),
          rectangle(fr.x, fr.y, fr.width, fr.height),
          moveTo(poly[0].x, poly[0].y),
          ...poly.slice(1).map((q) => lineTo(q.x, q.y)),
          closePath(),
          PDFOperator.of(PDFOperatorNames.FillEvenOdd),
          popGraphicsState(),
        );
      }
      const loc = project.locations.find((l) => l.id === p.locationId);
      cv.ops(
        pushGraphicsState(),
        setStrokingColor(hexColor(loc?.color ?? "#2b3990")),
        setLineWidth(2 * PX),
        setDashPattern([10 * PX, 6 * PX], 0),
        moveTo(poly[0].x, poly[0].y),
        ...poly.slice(1).map((q) => lineTo(q.x, q.y)),
        closePath(),
        stroke(),
        popGraphicsState(),
      );
    }

    // key map: the pages it indexes, a tab with the page number at each frame's top-left
    const tabs = (p.frames ?? []).map((f) => {
      const a = toFrame({ x: f.crop.minX, y: f.crop.maxY });
      const b = toFrame({ x: f.crop.maxX, y: f.crop.minY });
      const label = `${f.label} · pág. ${numberOf(f.pageIndex)}`;
      const tab = { x: a.x, y: b.y - 13, width: cv.width(label, 8, true) + 8, height: 13 };
      return { frame: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }, tab, label };
    });

    // markings, then their labels on top, each placed off the sheet's text and the others
    const shapes: { shape: MarkingShape; color: Color }[] = [];
    const drawnHere = p.measurementIds
      .map((id) => measurements.get(id))
      .filter((m): m is Measurement => !!m && items.has(m.itemId) && m.points.length > 0);
    // one label per kit group, as on screen
    const carriers = labelCarriers(drawnHere, (m) => items.get(m.itemId)?.kind);
    for (const m of drawnHere) {
      const item = items.get(m.itemId);
      if (!item) continue;
      const shape = markingShapes(m, item, p.scale, { kits, bare: !carriers.has(m.id) });
      const color = hexColor(item.color);
      drawShape(cv, shape, toFrame, color);
      shapes.push({ shape, color });
    }
    if (labels) {
      const frameBox: Box = {
        minX: fr.x,
        minY: fr.y,
        maxX: fr.x + fr.width,
        maxY: fr.y + fr.height,
      };
      const boxToFrame = (b: Box): Box => {
        const a = toFrame({ x: b.minX, y: b.minY });
        const c = toFrame({ x: b.maxX, y: b.maxY });
        return {
          minX: Math.min(a.x, c.x),
          minY: Math.min(a.y, c.y),
          maxX: Math.max(a.x, c.x),
          maxY: Math.max(a.y, c.y),
        };
      };
      const meets = (b: Box) =>
        b.maxX > frameBox.minX &&
        b.minX < frameBox.maxX &&
        b.maxY > frameBox.minY &&
        b.minY < frameBox.maxY;
      const half = (MARK_PX * PX) / 2;
      const text: Box[] = [
        ...(options.textBoxes?.(p.drawingId, p.page) ?? []).map(boxToFrame).filter(meets),
        // the count symbols themselves
        ...shapes
          .filter(({ shape }) => shape.type === "symbol")
          .map(({ shape }) => {
            const c = toFrame(shape.type === "symbol" ? shape.at : { x: 0, y: 0 });
            return { minX: c.x - half, minY: c.y - half, maxX: c.x + half, maxY: c.y + half };
          }),
      ];
      // the key map's tabs are drawn over the labels: keep clear of them too
      const placed: Box[] = tabs.map(({ tab: t }) => ({
        minX: t.x,
        minY: t.y,
        maxX: t.x + t.width,
        maxY: t.y + t.height,
      }));
      for (const { shape, color } of shapes) {
        if (!shape.label) continue;
        const size = pillSize(cv, shape.label.text);
        const spot = placeLabel(labelCandidates(shape, toFrame, size, PX), size, {
          labels: placed,
          text,
          bounds: frameBox,
        });
        if (!spot) continue;
        placed.push(spot.box);
        drawLabelPill(cv, shape.label.text, spot.at, color);
      }
    }

    for (const { frame, tab, label } of tabs) {
      cv.rect(frame, { stroke: FRAME_BLUE, width: 1.2 });
      cv.rect(tab, { fill: FRAME_BLUE });
      cv.text(label, tab.x + 4, tab.y + 3.4, { size: 8, bold: true, color: WHITE });
    }
    cv.ops(popGraphicsState());

    drawScaleBar(cv, fr, p.scale, p.zoom);
    cv.rect(fr, { stroke: RULE, width: 0.75 });
  }

  function drawShape(cv: Canvas, shape: MarkingShape, toFrame: (pt: Pt) => Pt, color: Color) {
    if (shape.type === "symbol") {
      drawSymbolAt(cv, shape.symbol, toFrame(shape.at), MARK_PX * PX, color);
      return;
    }
    if (shape.type === "ring") {
      cv.ops(
        pushGraphicsState(),
        setStrokingColor(color),
        setLineWidth(2 * PX),
        ...circleOps(toFrame(shape.at), 11 * PX),
        stroke(),
        popGraphicsState(),
      );
      return;
    }
    const pts = shape.points.map(toFrame);
    const path = [
      moveTo(pts[0].x, pts[0].y),
      ...pts.slice(1).map((q) => lineTo(q.x, q.y)),
      ...(shape.closed ? [closePath()] : []),
    ];
    if (shape.closed) {
      cv.ops(
        pushGraphicsState(),
        setGraphicsState(cv.alpha(0.24)),
        setFillingColor(color),
        ...path,
        fill(),
        popGraphicsState(),
      );
    }
    cv.ops(
      pushGraphicsState(),
      setStrokingColor(color),
      setLineWidth(3 * PX),
      setLineJoin(LineJoinStyle.Round),
      setLineCap(LineCapStyle.Round),
      ...path,
      stroke(),
      setFillingColor(color),
      ...pts.map((q) => rectangle(q.x - 2.5 * PX, q.y - 2.5 * PX, 5 * PX, 5 * PX)),
      fill(),
      popGraphicsState(),
    );
  }

  /** The scale bar on an opaque white box in the frame's corner, so no line runs through it. */
  function drawScaleBar(cv: Canvas, fr: Rect, scale: PageScale | null, zoom: number) {
    const x = fr.x + 6;
    const y = fr.y + 6;
    const box = (width: number, height: number) =>
      cv.rect({ x, y, width, height }, { fill: WHITE, stroke: RULE, width: 0.5 });
    if (!scale) {
      const t = "Sem escala calibrada";
      box(cv.width(t, 7) + 12, 16);
      cv.text(t, x + 6, y + 5.5, { size: 7, color: MUTED });
      return;
    }
    const ptPerUnit = scale.pointsPerUnit * zoom;
    const len = niceLength(ptPerUnit, Math.min(120, fr.width * 0.3));
    const barW = len * ptPerUnit;
    const unit = scale.unit;
    const caption = `Escala ${scaleCaption(ptPerUnit, unit)} na folha impressa`;
    const lenText = `${formatNumber(len, "BRL", len < 1 ? 2 : 0)} ${unit}`;
    const pad = 7;
    const barSpan = barW + cv.width(lenText, 6.5) / 2 + cv.width("0", 6.5) / 2;
    box(Math.max(barSpan, cv.width(caption, 6.5)) + 2 * pad, 34);
    const bx = x + pad + cv.width("0", 6.5) / 2;
    const by = y + 17;
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      cv.rect(
        { x: bx + (i * barW) / segs, y: by, width: barW / segs, height: 3.5 },
        { fill: i % 2 === 0 ? TEXT : WHITE, stroke: TEXT, width: 0.4 },
      );
    }
    cv.text("0", bx, by + 6, { size: 6.5, align: "center" });
    cv.text(lenText, bx + barW, by + 6, { size: 6.5, align: "center" });
    cv.text(caption, x + pad, y + pad, { size: 6.5, color: MUTED });
  }

  // ------------------------------------------------------------------- draw everything

  const total = outPages.length;
  const selected = outPages
    .map((o, i) => ({ o, number: i + 1 }))
    .filter(({ o }) => drawn(o.planIndex ?? "cover"));
  options.onPages?.(
    selected.map(({ o, number }) => ({
      number,
      total,
      planIndex: o.planIndex,
      continuation: o.continuation,
    })),
  );
  const planned = new Set(selected.flatMap(({ o }) => o.planIndex ?? [])).size;
  const done = new Set<number>();
  for (const { o, number } of selected) {
    const page = doc.addPage([layout.page.width, layout.page.height]);
    const cv = new Canvas(doc, page, fonts);
    o.draw(cv, number, total, numberOf);
    const pi = o.planIndex;
    if (pi !== undefined && !done.has(pi)) {
      done.add(pi);
      await options.onProgress?.(done.size, planned);
    }
  }
  return doc.save();
}
