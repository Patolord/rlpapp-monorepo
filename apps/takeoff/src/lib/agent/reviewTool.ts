/**
 * review_takeoff: the agent's check of its own pass before it reports, putting together what it
 * read and did not mark (scope.ts), what it never looked at (viewLog.ts) and what the marked
 * lines lack (coverage.ts).
 */
import { mergeCatalog } from "../catalog";
import { RUN_REACH_M, reviewCoverage } from "./coverage";
import { type ExpectedEntry, inventoryGaps, type PageSeen, unviewedGaps } from "./scope";
import { type AgentTool, json, ToolError } from "./toolTypes";

export const reviewTakeoff: AgentTool = {
  name: "review_takeoff",
  title: "Revisar o levantamento",
  description: `Check the takeoff for what first passes usually leave out, before you report: what the sheet asks for and is not marked (pass expected), parts of a page you never looked at closely enough to read, equipment with no run of its own system within ${RUN_REACH_M} m (refrigerant lines, drains and ducts are part of the takeoff, not extras), markings outside every location, lines off the catalog while it has similar materials, lines on no discipline tab, and lengths on pages without a scale. Also the totals per discipline (lines, pieces, length). Fix every gap or explain it in your report.`,
  inputSchema: {
    type: "object",
    properties: {
      expected: {
        type: "array",
        description:
          "Your inventory of the sheet: one entry per schedule row and per callout (a note with a leader naming a grille, louver, fan, detector...), including callouts at the foot or side of the sheet.",
        items: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description:
                'Where you read it and what it says: "Quadro: SS-05 (x3)", "Chamada: grelha 50x30 insuflamento antecâmara".',
            },
            item_id: { type: "string", description: "The line that quantifies it." },
            quantity: {
              type: "number",
              description: "Pieces written on the sheet or counted on the plan (count lines).",
            },
            note: {
              type: "string",
              description: "Why it is not marked: another sheet, by others, a doubt for the user.",
            },
          },
          required: ["source"],
        },
      },
    },
  },
  readOnly: true,
  async run(args, ctx) {
    const project = ctx.project();
    const expected = expectedEntries(args);
    // the pages worked on: those with markings, else the one shown
    const keys = new Set(project.measurements.map((m) => `${m.drawingId}#${m.page}`));
    if (keys.size === 0 && project.activeDrawingId) {
      keys.add(`${project.activeDrawingId}#${ctx.activePage()}`);
    }
    const pages: PageSeen[] = [];
    for (const key of keys) {
      const [drawingId, pageText] = key.split("#");
      const drawing = project.drawings.find((d) => d.id === drawingId);
      if (!drawing) continue;
      const page = Number(pageText);
      const size = (await ctx.doc(drawing)).sizes[page];
      if (!size) continue;
      pages.push({
        drawingId,
        drawingName: drawing.name,
        page,
        coverage: ctx.seen.coverage(drawingId, page, size),
      });
    }
    const report = reviewCoverage(project, mergeCatalog(ctx.catalog()));
    return json({
      ...report,
      gaps: [...inventoryGaps(project, expected), ...unviewedGaps(pages), ...report.gaps],
    });
  },
};

/** The expected list of review_takeoff, checked entry by entry; undefined when not passed. */
function expectedEntries(args: Record<string, unknown>): ExpectedEntry[] | undefined {
  if (args.expected === undefined) return undefined;
  if (!Array.isArray(args.expected)) throw new ToolError('"expected" must be a list.');
  return args.expected.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new ToolError(`expected[${i}] must be an object.`);
    const e = raw as Record<string, unknown>;
    const text = (k: string) => (typeof e[k] === "string" ? (e[k] as string).trim() : "");
    const source = text("source");
    if (!source) throw new ToolError(`expected[${i}] needs "source".`);
    const quantity = typeof e.quantity === "number" && e.quantity >= 0 ? e.quantity : undefined;
    return {
      source,
      ...(text("item_id") ? { itemId: text("item_id") } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(text("note") ? { note: text("note") } : {}),
    };
  });
}
