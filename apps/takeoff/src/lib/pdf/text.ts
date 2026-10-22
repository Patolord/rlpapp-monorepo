import type { PDFPageProxy } from "pdfjs-dist";
import type { Box, Pt } from "../geom";

/** A run of text on the page, in page space (viewport at scale 1). */
export interface TextBox extends Box {
  text: string;
  cx: number;
  cy: number;
  /** Line height in page points. */
  h: number;
}

/** Extract positioned text runs from a page. */
export async function extractText(page: PDFPageProxy): Promise<TextBox[]> {
  const content = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });
  const out: TextBox[] = [];
  for (const it of content.items) {
    if (!("str" in it)) continue;
    const text = it.str.trim();
    if (!text) continue;
    const [a, b, c, d, e, f] = it.transform as number[];
    const lx = Math.hypot(a, b) || 1;
    const ly = Math.hypot(c, d) || 1;
    const w = it.width;
    const h = it.height;
    const ux = [(a / lx) * w, (b / lx) * w];
    const uy = [(c / ly) * h, (d / ly) * h];
    const corners = [
      [e, f],
      [e + ux[0], f + ux[1]],
      [e + ux[0] + uy[0], f + ux[1] + uy[1]],
      [e + uy[0], f + uy[1]],
    ].map(([x, y]) => vp.convertToViewportPoint(x, y));
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, y] of corners) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    out.push({
      text,
      minX,
      minY,
      maxX,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      h: Math.min(maxX - minX, maxY - minY) || h,
    });
  }
  return out;
}

/** Smallest text box containing `p` (expanded by `pad` page points). */
export function textAt(boxes: readonly TextBox[], p: Pt, pad = 1.5): TextBox | null {
  let best: TextBox | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const t of boxes) {
    if (p.x < t.minX - pad || p.x > t.maxX + pad || p.y < t.minY - pad || p.y > t.maxY + pad) {
      continue;
    }
    const area = (t.maxX - t.minX) * (t.maxY - t.minY);
    if (area < bestArea) {
      best = t;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Nearest text run to `p` within `maxDist` page points (0 when inside the box). CAD exports
 * often place the searchable text some distance from the drawn glyph outlines, so a pure
 * containment test misses what the user is pointing at.
 */
export function textNear(boxes: readonly TextBox[], p: Pt, maxDist = 80): TextBox | null {
  const inside = textAt(boxes, p);
  if (inside) return inside;
  let best: TextBox | null = null;
  let bestD = maxDist;
  for (const t of boxes) {
    const dx = Math.max(t.minX - p.x, 0, p.x - t.maxX);
    const dy = Math.max(t.minY - p.y, 0, p.y - t.maxY);
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Text runs whose centre lies inside `box`, merged into lines (same baseline, left to right)
 * and returned top to bottom. Used to turn a legend / material list into item names.
 */
export function textLinesIn(boxes: readonly TextBox[], box: Box): string[] {
  const inside = boxes.filter(
    (t) => t.cx >= box.minX && t.cx <= box.maxX && t.cy >= box.minY && t.cy <= box.maxY,
  );
  inside.sort((a, b) => a.cy - b.cy || a.minX - b.minX);
  const lines: { cy: number; h: number; runs: TextBox[] }[] = [];
  for (const t of inside) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(t.cy - last.cy) <= Math.max(last.h, t.h) * 0.6) {
      last.runs.push(t);
    } else {
      lines.push({ cy: t.cy, h: t.h, runs: [t] });
    }
  }
  return lines
    .map((l) =>
      l.runs
        .sort((a, b) => a.minX - b.minX)
        .map((r) => r.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 1);
}
