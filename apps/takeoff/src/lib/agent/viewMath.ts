/**
 * Arithmetic of the pictures the agent looks at: which region of the page, at how many pixels
 * per point, and where the coordinate grid goes. The grid is how the agent points: its lines
 * are labelled in page points, so a position read off the picture is already a page coordinate.
 */
import type { PageSize, Region } from "./context";

/** Sharpest picture offered: beyond this a small region is only being upscaled. */
export const MAX_PX_PER_PT = 8;
export const DEFAULT_VIEW_PX = 1400;
export const MAX_VIEW_PX = 2000;
export const MIN_VIEW_PX = 400;

/** The requested region cut to the page (the whole page when none); null when it misses it. */
export function clampRegion(region: Region | undefined, size: PageSize): Region | null {
  if (!region) return { x: 0, y: 0, w: size.w, h: size.h };
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const x1 = Math.min(size.w, region.x + region.w);
  const y1 = Math.min(size.h, region.y + region.h);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Pixels per page point so the region's longest side is `maxPx`, without upscaling too far. */
export function viewScale(region: Region, maxPx: number): number {
  const px = Math.min(MAX_VIEW_PX, Math.max(MIN_VIEW_PX, maxPx));
  return Math.min(MAX_PX_PER_PT, px / Math.max(region.w, region.h));
}

/**
 * Grid spacing in page points: the "round" step (1, 2 or 5 times a power of ten) that puts
 * about `target` lines across the region's longest side.
 */
export function gridStep(region: Region, target = 10): number {
  const span = Math.max(region.w, region.h);
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return Math.max(1, nice * pow);
}

/** Multiples of `step` inside [min, max]. */
export function gridLines(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}
