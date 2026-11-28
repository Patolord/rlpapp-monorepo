/**
 * The picture kept with a "símbolo" memory: a small square of the drawing around a count mark,
 * rendered without the takeoff's markings, as a visual example for the agent. Browser only.
 */
import { MAX_MEMORY_IMAGE } from "@rlpapp/shared/takeoff/agentMemory";
import type { Pt } from "../geom";
import type { PageRenderer } from "../pdf/render";
import type { PageSize } from "./context";
import { clampRegion } from "./viewMath";

/** Side of the square, in page points (~23 mm on paper: a symbol and a little context). */
export const SYMBOL_CROP_PT = 64;
/** Pixels per point tried in turn: the sharpest whose PNG fits the memory's size limit. */
const SYMBOL_CROP_SCALES = [4, 3, 2, 1.5];

export async function cropSymbol(
  renderer: PageRenderer,
  page: number,
  center: Pt,
  size: PageSize,
): Promise<string | null> {
  const half = SYMBOL_CROP_PT / 2;
  const region = clampRegion(
    { x: center.x - half, y: center.y - half, w: SYMBOL_CROP_PT, h: SYMBOL_CROP_PT },
    size,
  );
  if (!region) return null;
  for (const scale of SYMBOL_CROP_SCALES) {
    const { canvas } = await renderer.renderRegion(page, scale, region, 1);
    const png = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
    canvas.width = canvas.height = 0;
    // a dense piece of drawing makes a heavy PNG: the next, smaller picture is tried
    if (png.length <= MAX_MEMORY_IMAGE) return png;
  }
  return null;
}
