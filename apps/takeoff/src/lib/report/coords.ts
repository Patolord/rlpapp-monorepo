/**
 * Coordinates between the app's page space and PDF user space, for the cutout report.
 *
 * Markings and regions are stored in page space: PDF points with the origin at the top-left of
 * the page as displayed, which is pdf.js `getViewport({ scale: 1 })` space. That viewport has
 * already applied the page's `/Rotate` and the offset of its CropBox (or MediaBox), so a point
 * in page space is not a point of the PDF content stream. pdf-lib (`embedPage`, `drawPage`)
 * works in PDF user space: origin at the bottom-left of the unrotated MediaBox coordinate
 * system, y up. The viewport's affine `transform` ([a, b, c, d, e, f], as `PageViewport`
 * exposes it) maps user space to page space; its inverse goes back, like pdf.js's
 * `viewport.convertToPdfPoint`. Capture the transform of each page while the document is open
 * and hand it to these functions.
 */
import type { Box, Pt } from "../geom";

/** Affine matrix in PDF order [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type ViewportTransform = readonly [number, number, number, number, number, number];

/** A page's visible box in user space, [x0, y0, x1, y1] (pdf.js `page.view`). */
export type PageView = readonly [number, number, number, number];

/** Page rotation, degrees clockwise (the PDF `/Rotate` entry, normalised). */
export type PageRotation = 0 | 90 | 180 | 270;

/** Apply an affine matrix to a point. */
export const applyTransform = (p: Pt, t: ViewportTransform): Pt => ({
  x: t[0] * p.x + t[2] * p.y + t[4],
  y: t[1] * p.x + t[3] * p.y + t[5],
});

/** Inverse of an affine matrix; throws when it is singular (a degenerate viewport). */
export function invertTransform(t: ViewportTransform): ViewportTransform {
  const [a, b, c, d, e, f] = t;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error("Singular viewport transform");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** `m` after `t`: the matrix that applies `t` first, then `m`. */
export const composeTransforms = (
  m: ViewportTransform,
  t: ViewportTransform,
): ViewportTransform => [
  m[0] * t[0] + m[2] * t[1],
  m[1] * t[0] + m[3] * t[1],
  m[0] * t[2] + m[2] * t[3],
  m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4],
  m[1] * t[4] + m[3] * t[5] + m[5],
];

/** Page space (top-left of the displayed page, y down) → PDF user space. */
export const toPdfUserSpace = (pt: Pt, t: ViewportTransform): Pt =>
  applyTransform(pt, invertTransform(t));

/** PDF user space → page space (top-left of the displayed page, y down). */
export const fromPdfUserSpace = (pt: Pt, t: ViewportTransform): Pt => applyTransform(pt, t);

/** Axis-aligned box around four transformed corners (exact for multiples of 90°). */
function mapBox(rect: Box, t: ViewportTransform): Box {
  const corners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ].map((p) => applyTransform(p, t));
  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y)),
  };
}

/**
 * A page-space rectangle (a crop box) as an axis-aligned box in PDF user space: what
 * `PDFDocument.embedPage(page, { left: minX, bottom: minY, right: maxX, top: maxY })` takes.
 * On a rotated sheet the box turns with the page, so the same area of the drawing is clipped.
 */
export const rectToPdfUserSpace = (rect: Box, t: ViewportTransform): Box =>
  mapBox(rect, invertTransform(t));

/** A user-space box back in page space. */
export const rectFromPdfUserSpace = (rect: Box, t: ViewportTransform): Box => mapBox(rect, t);

/**
 * The viewport transform pdf.js computes for `getViewport({ scale: 1, rotation })` of a page
 * whose visible box is `view` (CropBox ∩ MediaBox) and whose `/Rotate` is `rotate`
 * (`PageViewport` constructor, userUnit 1, no offset, not flipped). Lets tests and callers
 * without pdf.js build the same matrix.
 */
export function viewportTransform(view: PageView, rotate: PageRotation): ViewportTransform {
  const [x0, y0, x1, y1] = view;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const [ra, rb, rc, rd] =
    rotate === 90
      ? [0, 1, 1, 0]
      : rotate === 180
        ? [-1, 0, 0, 1]
        : rotate === 270
          ? [0, -1, -1, 0]
          : [1, 0, 0, -1];
  const swap = ra === 0;
  const ox = swap ? Math.abs(cy - y0) : Math.abs(cx - x0);
  const oy = swap ? Math.abs(cx - x0) : Math.abs(cy - y0);
  // `+ 0` turns the -0 the rotation products can give into 0, so matrices compare cleanly
  return [ra, rb, rc, rd, ox - ra * cx - rc * cy + 0, oy - rb * cx - rd * cy + 0];
}

/** Size of the displayed page (page space) for a visible box and rotation. */
export function viewportSize(
  view: PageView,
  rotate: PageRotation,
): { width: number; height: number } {
  const w = view[2] - view[0];
  const h = view[3] - view[1];
  return rotate === 90 || rotate === 270 ? { width: h, height: w } : { width: w, height: h };
}

/**
 * The matrix that draws PDF user space into a report frame: the page-space `crop` scaled by
 * `zoom`, with the frame's origin at its bottom-left and y up (pdf-lib's convention), so the
 * crop's top-left lands at (0, crop height × zoom). Pass it as `embedPage`'s transformation
 * matrix and draw the embedded page at the frame's corner with scale 1.
 */
export function userToFrameTransform(
  t: ViewportTransform,
  crop: Box,
  zoom: number,
): ViewportTransform {
  // page space → frame: fx = (x − minX)·zoom, fy = (maxY − y)·zoom
  const pageToFrame: ViewportTransform = [zoom, 0, 0, -zoom, -crop.minX * zoom, crop.maxY * zoom];
  return composeTransforms(pageToFrame, t);
}

/** A page-space point (a marking vertex) in frame coordinates (bottom-left origin, y up). */
export const pageToFrame = (pt: Pt, crop: Box, zoom: number): Pt => ({
  x: (pt.x - crop.minX) * zoom,
  y: (crop.maxY - pt.y) * zoom,
});
