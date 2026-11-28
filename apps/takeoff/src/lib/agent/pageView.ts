/**
 * The picture view_page returns: a region of the rendered page, the takeoff's markings on top
 * and a coordinate grid labelled in page points. Browser only (canvas); the arithmetic is in
 * viewMath.ts.
 */
import { drawMeasurement, drawZone, type View } from "../overlay";
import type { PageRenderer } from "../pdf/render";
import { pageScale } from "../quantities";
import { locationOf, type Project } from "../types";
import type { PageView, Region } from "./context";
import { gridLines, gridStep, viewScale } from "./viewMath";

const GRID_COLOR = "rgba(37, 99, 235, 0.38)";
const LABEL_BG = "rgba(255, 255, 255, 0.88)";
const LABEL_FG = "#1d4ed8";

function drawGrid(ctx: CanvasRenderingContext2D, region: Region, pxPerPt: number, step: number) {
  const { width, height } = ctx.canvas;
  const xs = gridLines(region.x, region.x + region.w, step);
  const ys = gridLines(region.y, region.y + region.h, step);
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of xs) {
    const px = Math.round((x - region.x) * pxPerPt) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
  }
  for (const y of ys) {
    const py = Math.round((y - region.y) * pxPerPt) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
  }
  ctx.stroke();
  // labels: x along the top edge, y along the left edge
  ctx.font = "bold 12px Consolas, ui-monospace, monospace";
  ctx.textBaseline = "top";
  const tag = (text: string, x: number, y: number) => {
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = LABEL_BG;
    ctx.fillRect(x, y, w, 15);
    ctx.fillStyle = LABEL_FG;
    ctx.fillText(text, x + 3, y + 2);
  };
  for (const x of xs) {
    const px = (x - region.x) * pxPerPt;
    if (px > 24 && px < width - 30) tag(`x${x}`, px + 2, 1);
  }
  for (const y of ys) {
    const py = (y - region.y) * pxPerPt;
    if (py > 18 && py < height - 16) tag(`y${y}`, 1, py + 2);
  }
  ctx.restore();
}

/** The takeoff's markings on this page, in the colours the viewer uses. */
function drawMarkings(
  ctx: CanvasRenderingContext2D,
  project: Project,
  drawingId: string,
  page: number,
  view: View,
) {
  const scale = pageScale(project, drawingId, page);
  const items = new Map(project.items.map((i) => [i.id, i]));
  const plain = { selected: false, hover: false, fillAlpha: 0.6 };
  for (const z of project.zones) {
    if (z.drawingId !== drawingId || z.page !== page || z.hidden) continue;
    drawZone(ctx, view, z.points, locationOf(project, z.locationId) ?? null, scale, {
      ...plain,
      dashed: z.ai === "suggested",
    });
  }
  for (const m of project.measurements) {
    if (m.drawingId !== drawingId || m.page !== page) continue;
    const item = items.get(m.itemId);
    if (!item) continue;
    drawMeasurement(ctx, view, m.points, item.kind, item.color, scale, {
      ...plain,
      dashed: m.ai === "suggested",
      symbol: item.symbol,
    });
  }
}

export async function renderPageView(
  renderer: PageRenderer,
  project: Project,
  drawingId: string,
  page: number,
  region: Region,
  opts: { maxPx: number; grid: boolean; markings: boolean },
): Promise<PageView> {
  const pxPerPt = viewScale(region, opts.maxPx);
  const rendered = await renderer.renderRegion(page, pxPerPt, region, 1);
  const canvas = rendered.canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  if (opts.markings) {
    drawMarkings(ctx, project, drawingId, page, {
      zoom: pxPerPt,
      x: -region.x * pxPerPt,
      y: -region.y * pxPerPt,
    });
  }
  const step = opts.grid ? gridStep(region) : 0;
  if (step > 0) drawGrid(ctx, region, pxPerPt, step);
  // Prefer WebP (5-8x smaller than PNG on engineering sheets) when supported by the webview.
  const webpPrefix = "data:image/webp;base64,";
  const pngPrefix = "data:image/png;base64,";
  const webpUrl = canvas.toDataURL("image/webp", 0.85);
  const useWebp = webpUrl.startsWith(webpPrefix);
  const mimeType = useWebp ? "image/webp" : "image/png";
  const png = useWebp
    ? webpUrl.slice(webpPrefix.length)
    : canvas.toDataURL("image/png").slice(pngPrefix.length);
  // release the pixels: these canvases are several megabytes each
  canvas.width = canvas.height = 0;
  return { png, mimeType, region, pxPerPt, gridStep: step };
}
