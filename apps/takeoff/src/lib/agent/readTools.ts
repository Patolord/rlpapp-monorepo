/**
 * The agent's eyes: the takeoff as it stands, pictures and text of the drawings, and the
 * detectors that turn "this room" or "this symbol" into geometry. None of them changes the
 * takeoff. They read the rendered page: PDF layers, blocks and embedded text are hints at best,
 * since drawings arrive exploded, mis-layered or scanned.
 */
import { aiStats } from "../aiReview";
import { kindForUnit, mergeCatalog, searchCatalog } from "../catalog";
import { polygonArea, polylineLength, simplify } from "../geom";
import { kitMode } from "../kits";
import { itemTotals, itemUnit, measurementQty, pageScale } from "../quantities";
import { foldName } from "../text";
import { locationOf, regionsOf } from "../types";
import type { PageScale } from "../units";
import {
  DRAWING_SCHEMA,
  optBool,
  optNum,
  optRect,
  optStr,
  PAGE_SCHEMA,
  POINT_SCHEMA,
  point,
  points,
  RECT_SCHEMA,
  rect,
} from "./args";
import { resolvePage } from "./target";
import { type AgentTool, json, r1, ToolError, type ToolResult } from "./toolTypes";
import { clampRegion, DEFAULT_VIEW_PX, MAX_VIEW_PX, MIN_VIEW_PX } from "./viewMath";

const scaleInfo = (scale: PageScale | null) =>
  scale ? { label: scale.label, points_per_unit: r1(scale.pointsPerUnit), unit: scale.unit } : null;

/** A polygon thinned to at most `max` vertices, for reporting (the stored outline keeps them all). */
function thin<P extends { x: number; y: number }>(pts: readonly P[], max: number) {
  let out = [...pts];
  for (let eps = 0.5; out.length > max && eps < 64; eps *= 2) out = simplify(pts, eps) as P[];
  return out.map((p) => ({ x: r1(p.x), y: r1(p.y) }));
}

const getTakeoff: AgentTool = {
  name: "get_takeoff",
  title: "Takeoff em andamento",
  description:
    "The takeoff open in the app: its drawings (PDFs) with each page's size in page points and scale, the budget items with their measured quantities, the locations (ambientes) and how many AI suggestions wait for review. Start here. A page whose scale is null is not calibrated: lengths and areas on it cannot be quantified until set_scale.",
  inputSchema: { type: "object", properties: {} },
  readOnly: true,
  async run(_args, ctx) {
    const project = ctx.project();
    const totals = itemTotals(project);
    const drawings = [];
    for (const d of project.drawings) {
      try {
        const doc = await ctx.doc(d);
        drawings.push({
          id: d.id,
          name: d.name,
          shown_in_app: d.id === project.activeDrawingId,
          pages: doc.sizes.map((s, i) => ({
            page: i + 1,
            width: r1(s.w),
            height: r1(s.h),
            scale: scaleInfo(d.pages[i]?.scale ?? null),
          })),
        });
      } catch (e) {
        drawings.push({
          id: d.id,
          name: d.name,
          shown_in_app: d.id === project.activeDrawingId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return json({
      name: project.name,
      client: project.client,
      site: project.site,
      discipline: project.system,
      length_unit: project.unit,
      drawings,
      items: project.items.map((i) => {
        const t = totals.get(i.id);
        return {
          id: i.id,
          name: i.name,
          kind: i.kind,
          unit: itemUnit(i, project.unit),
          group: i.group,
          discipline: i.system || project.system,
          quantity: t ? r1(t.qty) : 0,
          markings: t?.count ?? 0,
          from_catalog: !!i.catalogId,
          ...(i.derived ? { managed_by_app: i.derived } : {}),
        };
      }),
      locations: project.locations.map((l) => ({
        id: l.id,
        name: l.name,
        regions: regionsOf(project, l.id).length,
      })),
      ai_review: aiStats(project),
    });
  },
};

const listMarkings: AgentTool = {
  name: "list_markings",
  title: "Marcações da página",
  description:
    'What is already marked on one page: location regions and measurements, with their ids, points and review state ("suggested" = made by an AI and not yet reviewed by the user; absent = drawn by a person). Check it before marking, so nothing is marked twice.',
  inputSchema: {
    type: "object",
    properties: { drawing: DRAWING_SCHEMA, page: PAGE_SCHEMA },
  },
  readOnly: true,
  async run(args, ctx) {
    const { drawing, page } = await resolvePage(args, ctx);
    const project = ctx.project();
    const scale = pageScale(project, drawing.id, page);
    const items = new Map(project.items.map((i) => [i.id, i]));
    const here = <T extends { drawingId: string; page: number }>(x: T) =>
      x.drawingId === drawing.id && x.page === page;
    return json({
      drawing: drawing.id,
      page: page + 1,
      scale: scaleInfo(scale),
      locations: project.zones.filter(here).map((z) => ({
        id: z.id,
        location: locationOf(project, z.locationId)?.name ?? "",
        points: thin(z.points, 24),
        ...(z.repeat ? { repeat: z.repeat } : {}),
        ...(z.ai ? { ai: z.ai } : {}),
      })),
      measurements: project.measurements.filter(here).map((m) => {
        const item = items.get(m.itemId);
        const qty = item ? measurementQty(m, item.kind, scale) : null;
        return {
          id: m.id,
          item_id: m.itemId,
          item: item?.name ?? "",
          kind: item?.kind ?? "",
          points: thin(m.points, 24),
          quantity: qty === null ? null : r1(qty),
          ...(m.linkId ? { kit_group: m.linkId } : {}),
          ...(m.ai ? { ai: m.ai } : {}),
        };
      }),
    });
  },
};

const viewPage: AgentTool = {
  name: "view_page",
  title: "Ver a planta",
  description:
    "A picture of a page, or of a region of it, with a coordinate grid labelled in page points: read a position off the grid and it is already the coordinate the other tools take. A whole A1/A0 sheet in one picture is only an overview (text is unreadable): look at the whole page first to find the areas of interest, then call again with a region a few hundred points wide to read labels and symbols. The takeoff's markings are drawn on top unless markings is false.",
  inputSchema: {
    type: "object",
    properties: {
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      region: {
        ...RECT_SCHEMA,
        description: "Region to look at, in page points. Omit for the whole page.",
      },
      max_px: {
        type: "integer",
        minimum: MIN_VIEW_PX,
        maximum: MAX_VIEW_PX,
        description: `Longest side of the picture in pixels (default ${DEFAULT_VIEW_PX}).`,
      },
      grid: { type: "boolean", description: "Draw the coordinate grid (default true)." },
      markings: { type: "boolean", description: "Draw the takeoff's markings (default true)." },
    },
  },
  readOnly: true,
  async run(args, ctx): Promise<ToolResult> {
    const { drawing, doc, page, size } = await resolvePage(args, ctx);
    const region = clampRegion(optRect(args, "region"), size);
    if (!region) {
      throw new ToolError(
        `The region is outside the page, which is ${r1(size.w)} × ${r1(size.h)} points.`,
      );
    }
    const view = await doc.view(page, region, {
      maxPx: optNum(args, "max_px", { min: MIN_VIEW_PX, max: MAX_VIEW_PX }) ?? DEFAULT_VIEW_PX,
      grid: optBool(args, "grid") ?? true,
      markings: optBool(args, "markings") ?? true,
    });
    return {
      content: [
        { type: "image", data: view.png, mimeType: "image/png" },
        {
          type: "text",
          text: JSON.stringify({
            drawing: drawing.id,
            page: page + 1,
            page_size: { width: r1(size.w), height: r1(size.h) },
            region: {
              x: r1(view.region.x),
              y: r1(view.region.y),
              w: r1(view.region.w),
              h: r1(view.region.h),
            },
            pixels_per_point: Math.round(view.pxPerPt * 100) / 100,
            grid_step_points: view.gridStep,
          }),
        },
      ],
    };
  },
};

/** Text runs returned per call; a dense sheet has thousands. */
const MAX_TEXT_RUNS = 400;

const readText: AgentTool = {
  name: "read_text",
  title: "Texto da planta",
  description:
    "The selectable text of a page (or of a region), each run with the page coordinates of its centre: room names, equipment tags, capacities, the legend, the title block. Treat it as a hint, not as the truth: many drawings carry their text as outlines or are scans (the result is then empty), and CAD exports can place a run away from where it is drawn. What view_page shows is what counts.",
  inputSchema: {
    type: "object",
    properties: {
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      region: {
        ...RECT_SCHEMA,
        description: "Only text centred in this region. Omit for the page.",
      },
      contains: {
        type: "string",
        description: "Only runs containing this text (accents and case ignored).",
      },
    },
  },
  readOnly: true,
  async run(args, ctx) {
    const { drawing, doc, page } = await resolvePage(args, ctx);
    const region = optRect(args, "region");
    const needle = foldName(optStr(args, "contains") ?? "");
    const all = await doc.text(page);
    const picked = all
      .filter(
        (t) =>
          (!region ||
            (t.cx >= region.x &&
              t.cx <= region.x + region.w &&
              t.cy >= region.y &&
              t.cy <= region.y + region.h)) &&
          (!needle || foldName(t.text).includes(needle)),
      )
      .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    return json({
      drawing: drawing.id,
      page: page + 1,
      runs_on_page: all.length,
      matched: picked.length,
      truncated: picked.length > MAX_TEXT_RUNS,
      ...(all.length === 0
        ? {
            note: "This page has no selectable text (outlined text or a scan). Read it from view_page instead.",
          }
        : {}),
      runs: picked.slice(0, MAX_TEXT_RUNS).map((t) => ({
        text: t.text,
        x: r1(t.cx),
        y: r1(t.cy),
        height: r1(t.h),
      })),
    });
  },
};

const detectRoom: AgentTool = {
  name: "detect_room",
  title: "Detectar ambiente",
  description:
    "The outline of the enclosed space around a point: the app fills the blank area between the drawn lines and traces its boundary, so the precision comes from the drawing and not from your estimate. Give a point clearly inside the room, on blank paper (not on a line, a hatch or a text). unbounded true means the fill leaked (an open door, an open plan, a missing wall): the outline is then not the room. To create the location directly, pass the same point to create_location.",
  inputSchema: {
    type: "object",
    properties: { drawing: DRAWING_SCHEMA, page: PAGE_SCHEMA, point: POINT_SCHEMA },
    required: ["point"],
  },
  readOnly: true,
  async run(args, ctx) {
    const { drawing, doc, page } = await resolvePage(args, ctx);
    const seed = point(args, "point");
    const room = await doc.detectRoom(page, seed);
    if (!room) {
      throw new ToolError(
        "No enclosed space at that point: it is on a line or off the page. Pick a point on blank paper inside the room.",
      );
    }
    const scale = pageScale(ctx.project(), drawing.id, page);
    const area = polygonArea(room.polygon);
    return json({
      drawing: drawing.id,
      page: page + 1,
      unbounded: room.unbounded,
      vertices: room.polygon.length,
      polygon: thin(room.polygon, 40),
      area_page_points2: Math.round(area),
      area: scale ? r1(area / (scale.pointsPerUnit * scale.pointsPerUnit)) : null,
      area_unit: scale ? `${scale.unit}²` : null,
    });
  },
};

/** Matches returned per search. */
const MAX_HITS = 300;

const findSimilar: AgentTool = {
  name: "find_similar",
  title: "Localizar símbolos semelhantes",
  description:
    "Every place on the page that looks like the symbol inside a box (image comparison at 0°, 90°, 180° and 270°; it does not depend on CAD blocks, so exploded drawings work). Draw the box tight around one clean instance of the symbol, without neighbouring lines or text. The boxed instance itself comes back with a score near 1. Look at a few of the lower-scored matches with view_page before counting them: similar is not identical, and the copy of the symbol in the legend is a match too.",
  inputSchema: {
    type: "object",
    properties: {
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      box: { ...RECT_SCHEMA, description: "Tight box around one instance of the symbol." },
      min_score: {
        type: "number",
        minimum: 0.5,
        maximum: 0.99,
        description: "Lowest similarity kept, 0.5 to 0.99 (default 0.75).",
      },
    },
    required: ["box"],
  },
  readOnly: true,
  async run(args, ctx) {
    const { drawing, doc, page, size } = await resolvePage(args, ctx);
    const box = clampRegion(rect(args, "box"), size);
    if (!box || box.w < 3 || box.h < 3) {
      throw new ToolError("The box is off the page or too small to hold a symbol.");
    }
    const minScore = optNum(args, "min_score", { min: 0.5, max: 0.99 }) ?? 0.75;
    const hits = (await doc.findSimilar(page, box, minScore)).sort((a, b) => b.score - a.score);
    return json({
      drawing: drawing.id,
      page: page + 1,
      matches: hits.length,
      truncated: hits.length > MAX_HITS,
      hits: hits.slice(0, MAX_HITS).map((h) => ({
        x: r1(h.x),
        y: r1(h.y),
        score: Math.round(h.score * 100) / 100,
      })),
    });
  },
};

const measure: AgentTool = {
  name: "measure",
  title: "Medir",
  description:
    "The length of a path (and the area, when closed) in page points and, when the page has a scale, in real units. Use it to check a scale before trusting it: measure a dimension line whose value is written on the drawing, or a door (usually 0.80 m wide), and compare. Scales printed in title blocks are often wrong for the sheet as plotted.",
  inputSchema: {
    type: "object",
    properties: {
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      points: { type: "array", items: POINT_SCHEMA, minItems: 2 },
      closed: {
        type: "boolean",
        description: "Treat the points as a polygon and report its area.",
      },
    },
    required: ["points"],
  },
  readOnly: true,
  async run(args, ctx) {
    const { drawing, page } = await resolvePage(args, ctx);
    const pts = points(args, "points", 2);
    const closed = optBool(args, "closed") ?? false;
    const scale = pageScale(ctx.project(), drawing.id, page);
    const length = polylineLength(pts, closed);
    const area = closed && pts.length >= 3 ? polygonArea(pts) : null;
    return json({
      drawing: drawing.id,
      page: page + 1,
      scale: scaleInfo(scale),
      length_page_points: r1(length),
      length: scale ? Math.round((length / scale.pointsPerUnit) * 1000) / 1000 : null,
      ...(area !== null
        ? {
            area_page_points2: Math.round(area),
            area: scale
              ? Math.round((area / (scale.pointsPerUnit * scale.pointsPerUnit)) * 100) / 100
              : null,
          }
        : {}),
      unit: scale?.unit ?? null,
    });
  },
};

const searchCatalogTool: AgentTool = {
  name: "search_catalog",
  title: "Buscar no catálogo",
  description:
    'Search the company\'s material catalog (names in Portuguese: "grelha", "tubo de cobre 1/4", "exaustor"). Every word of the query must be in the name or group. Use the exact name of a result in create_item so the budget line is linked to the company material and priced from it.',
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 30, description: "Default 12." },
    },
    required: ["query"],
  },
  readOnly: true,
  async run(args, ctx) {
    const query = optStr(args, "query") ?? "";
    const limit = Math.round(optNum(args, "limit", { min: 1, max: 30 }) ?? 12);
    const entries = searchCatalog(mergeCatalog(ctx.catalog()), query, limit);
    return json({
      results: entries.map((e) => ({
        name: e.name,
        unit: e.unit,
        kind: kindForUnit(e.unit),
        group: e.group,
        ...(e.system ? { discipline: e.system } : {}),
        material_price: e.materialPrice,
        labor_price: e.laborPrice,
        ...(e.sku ? { sku: e.sku } : {}),
      })),
    });
  },
};

const listKits: AgentTool = {
  name: "list_kits",
  title: "Kits",
  description:
    'The kit presets: one drawn run (or one click) measures every material of a preset at once, e.g. a split\'s line set draws copper, insulation and cable together. A kit whose mode is "linear" is drawn as a run; "count" is placed with one point. Prefer a kit to separate items whenever one fits what is drawn.',
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Only kits whose name contains this." } },
  },
  readOnly: true,
  async run(args, ctx) {
    const needle = foldName(optStr(args, "query") ?? "");
    const kits = ctx.catalog().kits.filter((k) => !needle || foldName(k.name).includes(needle));
    return json({
      kits: kits.map((k) => ({
        id: k.id,
        name: k.name,
        mode: kitMode(k),
        ...(k.label ? { label: k.label } : {}),
        components: k.components.map((c) => ({ name: c.name, kind: c.kind, factor: c.factor })),
      })),
    });
  },
};

export const READ_TOOLS: AgentTool[] = [
  getTakeoff,
  listMarkings,
  viewPage,
  readText,
  detectRoom,
  findSimilar,
  measure,
  searchCatalogTool,
  listKits,
];
