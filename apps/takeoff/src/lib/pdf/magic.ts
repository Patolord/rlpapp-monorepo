import type { Pt } from "../geom";
import { simplify } from "../geom";
import type { PageRenderer, Rect } from "./render";

/** Luminance below which a pixel counts as ink (a barrier for the fill). */
const INK = 170;
/** Pixels of barrier dilation: closes hairline gaps between wall lines. */
const DILATE = 1;
const WINDOW_PX = 1600;

export interface MagicResult {
  polygon: Pt[];
  /** True when the fill reached the edge of the largest search window (likely not an enclosed room). */
  unbounded: boolean;
}

/**
 * Click-to-area: rasterize a window around `seed`, flood-fill the non-ink region containing it,
 * trace the outer boundary and simplify it into a page-space polygon.
 * Starts at a fine scale and widens the window when the region touches the border.
 */
export async function magicArea(
  renderer: PageRenderer,
  page: number,
  seed: Pt,
  pageSize: { w: number; h: number },
): Promise<MagicResult | null> {
  const scales = [2, 1, 0.5, 0.25];
  for (const scale of scales) {
    const half = WINDOW_PX / scale / 2;
    const rect: Rect = {
      x: Math.max(0, seed.x - half),
      y: Math.max(0, seed.y - half),
      w: 0,
      h: 0,
    };
    rect.w = Math.min(pageSize.w, seed.x + half) - rect.x;
    rect.h = Math.min(pageSize.h, seed.y + half) - rect.y;
    const r = await renderer.renderRegion(page, scale, rect, 1);
    const result = fillAndTrace(r.canvas, {
      x: (seed.x - rect.x) * scale,
      y: (seed.y - rect.y) * scale,
    });
    if (!result) return null;
    const coversPage = rect.x <= 0 && rect.y <= 0 && rect.w >= pageSize.w && rect.h >= pageSize.h;
    if (!result.touchesBorder || coversPage || scale === scales[scales.length - 1]) {
      const polygon = simplify(
        result.contour.map((p) => ({ x: rect.x + p.x / scale, y: rect.y + p.y / scale })),
        1.2 / scale,
      );
      if (polygon.length < 3) return null;
      return { polygon, unbounded: result.touchesBorder };
    }
  }
  return null;
}

function fillAndTrace(
  canvas: HTMLCanvasElement,
  seed: Pt,
): { contour: Pt[]; touchesBorder: boolean } | null {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, w, h).data;
  // barrier mask: 1 = ink
  const ink = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < ink.length; i++, p += 4) {
    const lum = (img[p] * 299 + img[p + 1] * 587 + img[p + 2] * 114) / 1000;
    if (lum < INK) ink[i] = 1;
  }
  const barrier = DILATE > 0 ? dilate(ink, w, h, DILATE) : ink;
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || barrier[sy * w + sx]) return null;

  // scanline flood fill
  const region = new Uint8Array(w * h);
  const stack: number[] = [sy * w + sx];
  let touchesBorder = false;
  let minX = sx;
  let minY = sy;
  let maxX = sx;
  let maxY = sy;
  while (stack.length) {
    const start = stack.pop()!;
    if (region[start] || barrier[start]) continue;
    const y = Math.floor(start / w);
    let x0 = start - y * w;
    let x1 = x0;
    while (x0 > 0 && !barrier[y * w + x0 - 1]) x0--;
    while (x1 < w - 1 && !barrier[y * w + x1 + 1]) x1++;
    if (x0 === 0 || x1 === w - 1 || y === 0 || y === h - 1) touchesBorder = true;
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (region[i]) continue;
      region[i] = 1;
      if (y > 0 && !region[i - w] && !barrier[i - w]) stack.push(i - w);
      if (y < h - 1 && !region[i + w] && !barrier[i + w]) stack.push(i + w);
    }
  }
  // grow the region back over the dilation band so the boundary sits on the ink, not inside it
  const grown = DILATE > 0 ? dilateWithin(region, ink, w, h, DILATE) : region;
  const contour = traceOuter(grown, w, h, minX, minY, maxX + DILATE, maxY + DILATE);
  return contour ? { contour, touchesBorder } : null;
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Dilate `region` by r but never onto pixels that are ink in the original mask. */
function dilateWithin(region: Uint8Array, ink: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(region);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!region[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && !ink[yy * w + xx]) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Moore-neighbour tracing of the outer boundary of the 8-connected blob containing the bbox's top-left-most pixel. */
function traceOuter(
  mask: Uint8Array,
  w: number,
  h: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Pt[] | null {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  let start: Pt | null = null;
  outer: for (let y = Math.max(0, minY - 1); y <= Math.min(h - 1, maxY + 1); y++) {
    for (let x = Math.max(0, minX - 1); x <= Math.min(w - 1, maxX + 1); x++) {
      if (at(x, y)) {
        start = { x, y };
        break outer;
      }
    }
  }
  if (!start) return null;
  // neighbours clockwise starting from west
  const N = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];
  const contour: Pt[] = [start];
  let cx = start.x;
  let cy = start.y;
  let back = 0; // index of the neighbour we came from (west for the start pixel)
  const limit = (maxX - minX + maxY - minY + 4) * 8;
  for (let steps = 0; steps < limit; steps++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const idx = (back + k) % 8;
      const nx = cx + N[idx][0];
      const ny = cy + N[idx][1];
      if (at(nx, ny)) {
        cx = nx;
        cy = ny;
        back = (idx + 4) % 8; // direction pointing back at the pixel we came from
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    if (cx === start.x && cy === start.y) break;
    contour.push({ x: cx, y: cy });
  }
  return contour.length >= 3 ? contour : null;
}
