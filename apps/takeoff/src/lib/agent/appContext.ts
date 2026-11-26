/**
 * The agent tools' view of the running app: the store's takeoff and catalog, and the drawings'
 * PDFs opened through the session (any drawing of the takeoff, not only the one in view).
 */
import { useStore } from "../../store";
import { magicArea } from "../pdf/magic";
import { crop, type Gray } from "../pdf/visual";
import { findVisual, rasterizePage, searchScale } from "../pdf/visualClient";
import { ensureDocText, loadPdf, type OpenDoc } from "../session";
import type { Drawing } from "../types";
import { renderInBackground } from "./background";
import type { AgentContext, DrawingDoc, Region } from "./context";
import { renderPageView } from "./pageView";
import { ToolError } from "./toolTypes";
import { ViewLog } from "./viewLog";

/** Search rasters kept: one page of a sheet is ~10 MB of grey pixels. */
const MAX_RASTERS = 2;
const rasters = new Map<
  string,
  { entry: OpenDoc; raster: Promise<{ scale: number; gray: Gray }> }
>();

function searchRaster(entry: OpenDoc, page: number) {
  const key = `${entry.key}#${page}`;
  const cached = rasters.get(key);
  // the same path may have been parsed again since (a revision written over the file): a
  // raster is only good for the parsed document it was rendered from
  if (cached && cached.entry === entry) {
    // refresh its place in the eviction order
    rasters.delete(key);
    rasters.set(key, cached);
    return cached.raster;
  }
  const raster = (async () => {
    const proxy = await entry.doc.getPage(page + 1);
    const size = entry.sizes[page];
    const scale = searchScale(size.w, size.h);
    return { scale, gray: await renderInBackground(() => rasterizePage(proxy, scale)) };
  })();
  rasters.delete(key);
  rasters.set(key, { entry, raster });
  void raster.catch(() => {
    if (rasters.get(key)?.raster === raster) rasters.delete(key);
  });
  while (rasters.size > MAX_RASTERS) {
    const oldest = rasters.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    rasters.delete(oldest);
  }
  return raster;
}

function drawingDoc(entry: OpenDoc, drawing: Drawing): DrawingDoc {
  return {
    sizes: entry.sizes,
    text: (page) => ensureDocText(entry.key, page) ?? Promise.resolve([]),
    // every render here must finish with the window minimised or covered (see background.ts)
    view: (page, region, opts) =>
      renderInBackground(() =>
        renderPageView(entry.renderer, useStore.getState().project, drawing.id, page, region, opts),
      ),
    detectRoom: (page, seed, opts) =>
      renderInBackground(() => magicArea(entry.renderer, page, seed, entry.sizes[page], opts)),
    async findSimilar(page, box: Region, minScore) {
      const { scale, gray } = await searchRaster(entry, page);
      const tpl = crop(gray, box.x * scale, box.y * scale, box.w * scale, box.h * scale);
      const matches = await findVisual(gray, tpl, { minScore });
      return matches.map((m) => ({ x: m.cx / scale, y: m.cy / scale, score: m.score }));
    },
  };
}

export const appContext: AgentContext = {
  seen: new ViewLog(),
  project: () => useStore.getState().project,
  commit: (mutate) => useStore.getState().commit(mutate),
  catalog: () => useStore.getState().catalog,
  async doc(drawing) {
    if (!drawing.path) {
      throw new ToolError(`The drawing "${drawing.name}" has no PDF file on this machine.`);
    }
    try {
      return drawingDoc(await loadPdf(drawing.path), drawing);
    } catch (e) {
      throw new ToolError(
        `Could not open the PDF of "${drawing.name}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
  activePage: () => useStore.getState().page,
  memory: () => useStore.getState().refreshAgentMemory(),
  proposeMemory: (input) => useStore.getState().addAgentMemory(input, true),
  notify: (message) => useStore.getState().setStatus(message),
};
