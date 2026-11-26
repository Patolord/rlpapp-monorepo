/**
 * The agent's hands: scale, budget lines, locations (ambientes) and measurements. Every marking
 * is a suggestion the user reviews (lib/aiReview); each call is one undo step. The agent cannot
 * touch what a person drew, change prices, save the file or send the budget.
 */
import { mergeCatalog } from "../catalog";
import { dist, type Pt, polygonArea } from "../geom";
import { kitRun } from "../kitRun";
import { kitMode } from "../kits";
import { pageScale } from "../quantities";
import { foldName } from "../text";
import { DISCIPLINE_SUGGESTIONS, drawingOf, type Project } from "../types";
import {
  INPUT_UNITS,
  type InputUnit,
  metricScale,
  type PageScale,
  ratioLabel,
  toBaseUnit,
} from "../units";
import {
  DRAWING_SCHEMA,
  num,
  oneOf,
  optBool,
  optNum,
  optPoints,
  optStr,
  PAGE_SCHEMA,
  POINT_SCHEMA,
  point,
  points,
  shapes,
  str,
  stringList,
} from "./args";
import { rankCatalog } from "./catalogMatch";
import type { AgentContext, PageSize } from "./context";
import {
  addAiMeasurements,
  addAiZone,
  catalogEntryNamed,
  disciplineFor,
  disciplineOptions,
  findOrCreateItem,
  removeAiSuggestions,
  withPageScale,
} from "./edits";
import { resolvePage } from "./target";
import { type AgentTool, json, r1, ToolError } from "./toolTypes";

const KINDS = ["count", "linear", "area"] as const;

/**
 * Apply an edit to the takeoff as it is at this moment, provided it still holds the drawing the
 * call resolved. Loading a PDF or tracing a room takes time, and the user may open another
 * takeoff or remove the drawing meanwhile: an edit must never land on a takeoff it was not
 * computed for. Throws (and changes nothing) when the drawing is gone.
 */
function editOnDrawing<T extends { project: Project }>(
  ctx: AgentContext,
  drawingId: string,
  edit: (project: Project) => T,
): T {
  const out: { result?: T } = {};
  ctx.commit((p) => {
    if (!drawingOf(p, drawingId)) return p;
    out.result = edit(p);
    return out.result.project;
  });
  if (!out.result) {
    throw new ToolError(
      "The takeoff changed while this call was running: the drawing it was aimed at is no longer part of the open takeoff. Nothing was marked. Call get_takeoff and start again.",
    );
  }
  return out.result;
}

/** Refuses points outside the page: a marking there counts but cannot be seen or reviewed. */
function assertOnPage(pts: readonly Pt[], size: PageSize): void {
  const off = pts.find((p) => p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h);
  if (off) {
    throw new ToolError(
      `The point (${r1(off.x)}, ${r1(off.y)}) is off the page, which is ${r1(size.w)} × ${r1(size.h)} points.`,
    );
  }
}

const setScale: AgentTool = {
  name: "set_scale",
  title: "Definir a escala",
  description:
    "Set the scale of a page, in one of two ways. ratio: the N of a metric 1:N scale (50 for 1:50). calibrate: two points on the page and the real distance between them, the reliable way when a dimension is drawn (pick the two ends of a dimension line and pass its written value). A scale read from the title block is a claim: confirm it with measure against a written dimension before relying on it, and tell the user when they disagree. Returns the scale as set.",
  inputSchema: {
    type: "object",
    properties: {
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      ratio: { type: "number", minimum: 1, maximum: 5000, description: "N of a 1:N scale." },
      calibrate: {
        type: "object",
        description: "Two points and the real distance between them.",
        properties: {
          a: POINT_SCHEMA,
          b: POINT_SCHEMA,
          length: { type: "number", description: "Real distance between a and b." },
          unit: { type: "string", enum: INPUT_UNITS, description: "Unit of length (default m)." },
        },
        required: ["a", "b", "length"],
      },
      all_pages: {
        type: "boolean",
        description: "Apply to every page of the drawing (default false).",
      },
    },
  },
  readOnly: false,
  async run(args, ctx) {
    const { drawing, doc, page, size } = await resolvePage(args, ctx);
    const project = ctx.project();
    const ratio = optNum(args, "ratio", { min: 1, max: 5000 });
    const cal = args.calibrate as Record<string, unknown> | undefined;
    let scale: PageScale;
    if (cal && typeof cal === "object") {
      const a = point(cal, "a");
      const b = point(cal, "b");
      assertOnPage([a, b], size);
      const length = num(cal, "length", { min: 1e-6 });
      const unit = (cal.unit === undefined ? "m" : oneOf(cal, "unit", INPUT_UNITS)) as InputUnit;
      const span = dist(a, b);
      if (span < 2) throw new ToolError("The two calibration points are too close together.");
      const pointsPerUnit = span / toBaseUnit(length, unit, project.unit);
      scale = { pointsPerUnit, unit: project.unit, label: ratioLabel(pointsPerUnit, project.unit) };
    } else if (ratio !== undefined) {
      if (project.unit !== "m") {
        throw new ToolError(
          "This takeoff is in feet: set its scale with calibrate, not with a ratio.",
        );
      }
      scale = metricScale(ratio);
    } else {
      throw new ToolError('Pass either "ratio" (N of 1:N) or "calibrate" ({a, b, length}).');
    }
    const before = pageScale(project, drawing.id, page);
    const all = optBool(args, "all_pages") ?? false;
    editOnDrawing(ctx, drawing.id, (p) => ({
      project: withPageScale(p, { drawingId: drawing.id, page }, scale, doc.sizes.length, all),
    }));
    ctx.notify(`IA: escala ${scale.label} em ${drawing.name}, página ${page + 1}`);
    return json({
      drawing: drawing.id,
      page: page + 1,
      all_pages: all,
      scale: { label: scale.label, points_per_unit: r1(scale.pointsPerUnit), unit: scale.unit },
      previous: before ? before.label : null,
    });
  },
};

const createItem: AgentTool = {
  name: "create_item",
  title: "Criar item do orçamento",
  description:
    'The budget line a material is measured on; returns its id for add_markings. Pass the exact name of a search_catalog result to link the line to the company material and take its price and unit (then kind is not needed). Every line goes on a discipline (budget tab), one per system on the drawing: exhaust, outside air, stair pressurisation, fire detection, AC... Never leave different systems on one tab. For something the catalog does not carry, pass a descriptive name, its kind ("count" pieces, "linear" a length, "area") and why_not_catalog; when the catalog has similar materials you are shown them first, because the brand or model on a drawing is usually only a reference and the company\'s equivalent is what goes in the budget. Calling it again with the same name returns the existing line, so it is safe to repeat.',
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Catalog name (exact) or a descriptive name in Portuguese.",
      },
      kind: {
        type: "string",
        enum: KINDS,
        description: "Needed only when the catalog does not have it.",
      },
      group: {
        type: "string",
        description:
          'Budget section, e.g. "Equipamentos", "Bocas de Ar", "Tubulações". Default: the catalog\'s.',
      },
      discipline: {
        type: "string",
        description: `Budget tab the line goes on: ${DISCIPLINE_SUGGESTIONS.map((d) => `"${d}"`).join(", ")}, or a tab the takeoff already has. Needed unless the catalog material carries one or the takeoff is a single system.`,
      },
      why_not_catalog: {
        type: "string",
        description:
          "Off-catalog lines only, when the catalog has similar materials: why none of them is this material (in Portuguese; it goes in your report).",
      },
    },
    required: ["name"],
  },
  readOnly: false,
  async run(args, ctx) {
    const name = str(args, "name");
    const project = ctx.project();
    const catalog = ctx.catalog();
    const merged = mergeCatalog(catalog);
    const entry = catalogEntryNamed(merged, name);
    const existing = entry
      ? undefined
      : project.items.find((i) => !i.derived && foldName(i.name) === foldName(name.trim()));
    const kind = args.kind === undefined ? existing?.kind : oneOf(args, "kind", KINDS);
    if (!entry && !existing) {
      const similar = rankCatalog(merged, name, 5);
      if (similar.length > 0 && !optStr(args, "why_not_catalog")) {
        throw new ToolError(
          `"${name}" is not in the catalog, but the catalog has similar materials:\n${similar.map((r) => `- ${r.entry.name} (${r.entry.unit}, ${r.entry.group})`).join("\n")}\nA brand or model on the drawing is usually a reference: if one of these does the same job at the same size, create the line with its exact name. Otherwise call again with "kind" and "why_not_catalog".`,
        );
      }
      if (!kind) {
        throw new ToolError(
          `"${name}" is not in the catalog. Search it with search_catalog and use the exact name, or pass "kind" to create a line the catalog does not carry.`,
        );
      }
    }
    const system = disciplineFor(project, optStr(args, "discipline"), entry, existing);
    if (system === null) {
      throw new ToolError(
        `Pass "discipline": the budget tab this line goes on, one per system on the drawing (never every system on one tab). Options: ${disciplineOptions(project).join(", ")}.`,
      );
    }
    const found = findOrCreateItem(project, catalog, merged, {
      name,
      kind,
      group: optStr(args, "group"),
      system,
    });
    if (!found) throw new ToolError(`"${name}" could not be created.`);
    ctx.commit(() => found.project);
    if (found.created) ctx.notify(`IA: item criado: ${found.item.name}`);
    return json({
      item_id: found.item.id,
      name: found.item.name,
      kind: found.item.kind,
      discipline: found.item.system || project.system,
      created: found.created,
      from_catalog: found.fromCatalog,
      material_price: found.item.materialPrice,
    });
  },
};

const createLocation: AgentTool = {
  name: "create_location",
  title: "Marcar ambiente",
  description:
    "Mark a location (ambiente, pavimento, zona) on a page; measurements inside it are grouped under it in the budget. Give its name as written on the drawing and either point (a position on blank paper inside the room: the app traces the room's outline from the drawn walls, the precise way) or polygon (your own outline, for a space that does not close, such as an open plan or a room with an open door). The same name on another page or drawing joins the same location. repeat multiplies what is measured inside (20 identical apartments drawn once). It is created as a suggestion for the user to review.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name as written on the drawing." },
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      point: { ...POINT_SCHEMA, description: "A point inside the room, on blank paper." },
      polygon: {
        type: "array",
        items: POINT_SCHEMA,
        minItems: 3,
        description: "Outline, when point does not work.",
      },
      repeat: {
        type: "integer",
        minimum: 1,
        description: "Identical spaces this one stands for (default 1).",
      },
    },
    required: ["name"],
  },
  readOnly: false,
  async run(args, ctx) {
    const name = str(args, "name");
    const target = await resolvePage(args, ctx);
    const given = optPoints(args, "polygon", 3);
    if (given) assertOnPage(given, target.size);
    let outline = given;
    if (!outline) {
      if (args.point === undefined) throw new ToolError('Pass either "point" or "polygon".');
      const room = await target.doc.detectRoom(target.page, point(args, "point"));
      if (!room) {
        throw new ToolError(
          "No enclosed space at that point: it is on a line or off the page. Pick a point on blank paper inside the room, or pass a polygon.",
        );
      }
      if (room.unbounded) {
        throw new ToolError(
          "The space around that point does not close (an open door, an open plan or a missing wall), so its outline would leak into the neighbours. Look at the area with view_page and pass a polygon instead.",
        );
      }
      outline = room.polygon;
    }
    const repeat = optNum(args, "repeat", { min: 1, max: 10_000 });
    const placed = outline;
    const made = editOnDrawing(ctx, target.drawingId, (p) =>
      addAiZone(p, { drawingId: target.drawingId, page: target.page }, name, placed, repeat),
    );
    ctx.notify(`IA: ambiente ${made.location.name} em ${target.drawing.name}`);
    const scale = pageScale(made.project, target.drawingId, target.page);
    const area = polygonArea(outline);
    return json({
      region_id: made.zone.id,
      location_id: made.location.id,
      location: made.location.name,
      new_location: made.created,
      traced_from_drawing: !given,
      vertices: outline.length,
      area: scale ? r1(area / (scale.pointsPerUnit * scale.pointsPerUnit)) : null,
      area_unit: scale ? `${scale.unit}²` : null,
    });
  },
};

const addMarkings: AgentTool = {
  name: "add_markings",
  title: "Marcar medições",
  description:
    "Measure an item on a page, as suggestions for the user to review. For a count item pass points: one position per piece (the centre of each symbol; the hits of find_similar can go straight in). For a linear item pass paths: each a polyline along the run. For an area item pass paths: each a polygon. A count mark on top of an existing mark of the same item is skipped. Lengths and areas need the page's scale (set_scale). Returns the ids of what was created.",
  inputSchema: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "Id from create_item or get_takeoff." },
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      points: {
        type: "array",
        items: POINT_SCHEMA,
        description: "Count items: one point per piece.",
      },
      paths: {
        type: "array",
        items: { type: "array", items: POINT_SCHEMA },
        description: "Linear items: polylines. Area items: polygons.",
      },
      label: {
        type: "string",
        description: 'Short label shown on the drawing, e.g. the tag "VE-01".',
      },
    },
    required: ["item_id"],
  },
  readOnly: false,
  async run(args, ctx) {
    const itemId = str(args, "item_id");
    const target = await resolvePage(args, ctx);
    const project = ctx.project();
    const item = project.items.find((i) => i.id === itemId);
    if (!item) throw new ToolError(`No item with id "${itemId}". Call get_takeoff or create_item.`);
    if (item.derived) {
      throw new ToolError(
        `"${item.name}" is a ${item.derived === "duct" ? "duct network" : "VRF system"} kept by the app from its own runs; it cannot be measured with add_markings.`,
      );
    }
    let list: { x: number; y: number }[][];
    if (item.kind === "count") {
      if (args.points === undefined) {
        throw new ToolError(`"${item.name}" is a count item: pass "points", one per piece.`);
      }
      list = points(args, "points").map((p) => [p]);
    } else {
      if (args.paths === undefined) {
        throw new ToolError(
          item.kind === "linear"
            ? `"${item.name}" is a linear item: pass "paths", each a polyline.`
            : `"${item.name}" is an area item: pass "paths", each a polygon.`,
        );
      }
      list = shapes(args, "paths", item.kind === "linear" ? 2 : 3);
    }
    assertOnPage(list.flat(), target.size);
    const label = optStr(args, "label");
    const made = editOnDrawing(ctx, target.drawingId, (p) =>
      addAiMeasurements(p, { drawingId: target.drawingId, page: target.page }, item, list, {
        label,
      }),
    );
    if (made.ids.length > 0) {
      ctx.notify(`IA: ${made.ids.length} marcação(ões) de ${item.name} em ${target.drawing.name}`);
    }
    const unscaled =
      item.kind !== "count" && !pageScale(made.project, target.drawingId, target.page);
    return json({
      item: item.name,
      created: made.ids.length,
      ids: made.ids,
      ...(made.skipped ? { skipped_duplicates: made.skipped } : {}),
      ...(unscaled
        ? { warning: "This page has no scale: these markings have no quantity until set_scale." }
        : {}),
    });
  },
};

const addKitRun: AgentTool = {
  name: "add_kit_run",
  title: "Marcar com kit",
  description:
    'Measure every material of a kit at once (see list_kits), as a suggestion for the user to review. A kit whose mode is "linear" takes points as the polyline of the run (e.g. the refrigerant line from the evaporator to the condenser); a "count" kit takes a single point where the equipment is. The budget lines are created from the catalog as needed and the measurements stay grouped.',
  inputSchema: {
    type: "object",
    properties: {
      kit_id: { type: "string", description: "Id from list_kits." },
      drawing: DRAWING_SCHEMA,
      page: PAGE_SCHEMA,
      points: { type: "array", items: POINT_SCHEMA, minItems: 1 },
    },
    required: ["kit_id", "points"],
  },
  readOnly: false,
  async run(args, ctx) {
    const kitId = str(args, "kit_id");
    const target = await resolvePage(args, ctx);
    const catalog = ctx.catalog();
    const kit = catalog.kits.find((k) => k.id === kitId);
    if (!kit) throw new ToolError(`No kit with id "${kitId}". Call list_kits.`);
    if (kit.components.length === 0) throw new ToolError(`The kit "${kit.name}" has no materials.`);
    const linear = kitMode(kit) === "linear";
    const run = points(args, "points", linear ? 2 : 1);
    assertOnPage(run, target.size);
    const { project: next, ids } = editOnDrawing(ctx, target.drawingId, (p) => {
      const project = kitRun(p, catalog, kit, {
        drawingId: target.drawingId,
        page: target.page,
        points: run,
        ai: "suggested",
      });
      const known = new Set(p.measurements.map((m) => m.id));
      return {
        project,
        ids: project.measurements.filter((m) => !known.has(m.id)).map((m) => m.id),
      };
    });
    ctx.notify(`IA: kit ${kit.name} em ${target.drawing.name}`);
    return json({
      kit: kit.name,
      created: ids.length,
      ids,
      ...(linear && !pageScale(next, target.drawingId, target.page)
        ? { warning: "This page has no scale: the run has no length until set_scale." }
        : {}),
    });
  },
};

const removeSuggestions: AgentTool = {
  name: "remove_suggestions",
  title: "Desfazer sugestões",
  description:
    "Take back markings you created that the user has not reviewed yet (a location region or a measurement, by id; a kit run goes as a whole). Use it to correct your own mistakes. Markings drawn by a person, or already accepted or edited by the user, are never removed: they come back in kept.",
  inputSchema: {
    type: "object",
    properties: { ids: { type: "array", items: { type: "string" }, minItems: 1 } },
    required: ["ids"],
  },
  readOnly: false,
  async run(args, ctx) {
    const result = removeAiSuggestions(ctx.project(), stringList(args, "ids"));
    ctx.commit(() => result.project);
    if (result.removed.length > 0) {
      ctx.notify(`IA: ${result.removed.length} sugestão(ões) desfeita(s)`);
    }
    return json({ removed: result.removed, kept: result.kept });
  },
};

export const WRITE_TOOLS: AgentTool[] = [
  setScale,
  createItem,
  createLocation,
  addMarkings,
  addKitRun,
  removeSuggestions,
];
