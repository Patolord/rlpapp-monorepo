/**
 * The picture kept with a "símbolo" memory: a small square of the drawing around a count mark,
 * rendered without the takeoff's markings, as a visual example for the agent. Browser only.
 */
import type { Pt } from "../geom";
import type { PageRenderer } from "../pdf/render";
import type { PageSize } from "./context";
import { clampRegion } from "./viewMath";

/** Side of the square, in page points (~23 mm on paper: a symbol and a little context). */
export const SYMBOL_CROP_PT = 64;
/** Pixels per point: a 256 px picture. */
const SYMBOL_CROP_SCALE = 4;

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
  const { canvas } = await renderer.renderRegion(page, SYMBOL_CROP_SCALE, region, 1);
  const png = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  canvas.width = canvas.height = 0;
  return png;
}
