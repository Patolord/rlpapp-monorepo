/**
 * Which drawing and page a tool call is about. The agent names pages as people do (from 1) and
 * may leave the drawing out to mean the one shown in the app.
 */
import { activeDrawing, type Drawing, drawingOf } from "../types";
import { optNum, optStr } from "./args";
import type { AgentContext, DrawingDoc, PageSize } from "./context";
import type { Target } from "./edits";
import { ToolError } from "./toolTypes";

export interface ResolvedPage extends Target {
  drawing: Drawing;
  doc: DrawingDoc;
  size: PageSize;
}

export function resolveDrawing(args: Record<string, unknown>, ctx: AgentContext): Drawing {
  const project = ctx.project();
  const id = optStr(args, "drawing");
  const drawing = id ? drawingOf(project, id) : activeDrawing(project);
  if (!drawing) {
    throw new ToolError(
      id
        ? `No drawing with id "${id}". Call get_takeoff for the drawings of this takeoff.`
        : "No drawing is open in the app. Ask the user to open the PDFs of the takeoff first.",
    );
  }
  return drawing;
}

/** The drawing, its opened PDF and the 0-based page a call names (default: the page in view). */
export async function resolvePage(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ResolvedPage> {
  const drawing = resolveDrawing(args, ctx);
  const asked = optNum(args, "page", { min: 1 });
  if (asked !== undefined && !Number.isInteger(asked)) {
    throw new ToolError('"page" must be a whole number (pages start at 1).');
  }
  // the default is the page in view when the call arrived, not when the PDF finished loading
  const inView = drawing.id === ctx.project().activeDrawingId ? ctx.activePage() : 0;
  const doc = await ctx.doc(drawing);
  const page = asked !== undefined ? asked - 1 : inView;
  const size = doc.sizes[page];
  if (!size) {
    throw new ToolError(
      `"${drawing.name}" has ${doc.sizes.length} page(s); page ${page + 1} does not exist.`,
    );
  }
  return { drawing, drawingId: drawing.id, doc, page, size };
}
