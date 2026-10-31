/**
 * Canvas painting of the viewer overlay: measurements, locations and labels in screen space.
 * Pure drawing; the Viewer decides what is visible, selected or hovered.
 */
import { bbox, type Pt, polygonArea, segmentMidpoint } from "./geom";
import { type LabelShape, type ShapeOpts, shapesOf } from "./markingShapes";
import { drawSymbol } from "./symbols";
import type { Location } from "./types";
import { formatArea, type Kind, type PageScale } from "./units";

/** Screen transform: CSS pixels per page point and the page origin on screen. */
export type View = { zoom: number; x: number; y: number };

const toScreen = (p: Pt, v: View): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });

/** Geometry and label come from lib/markingShapes (`ShapeOpts`); the rest is screen state. */
export interface DrawOpts extends ShapeOpts {
  selected: boolean;
  hover: boolean;
  dashed: boolean;
  /** Multiplier for the hatch fill of areas and locations (0 = outline only, default 1). */
  fillAlpha?: number;
}

const MARK_PX = 18;

export function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  v: View,
  pts: readonly Pt[],
  kind: Kind,
  color: string,
  scale: PageScale | null,
  o: DrawOpts,
) {
  const shape = shapesOf(pts, kind, scale, o);
  const sp = pts.map((p) => toScreen(p, v));
  ctx.save();
  if (shape.type === "symbol") {
    const c = sp[0];
    const emphasis = o.selected || o.hover;
    drawSymbol(ctx, shape.symbol.id, c.x, c.y, emphasis ? MARK_PX + 4 : MARK_PX, color, emphasis);
    if (o.selected) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#101a30";
      ctx.stroke();
    }
    if (shape.label) drawShapeLabel(ctx, v, shape.label, color);
    ctx.restore();
    return;
  }
  if (shape.type === "ring") {
    // fixed length placed by a click kit: a ring around the point, its length on hover
    const c = sp[0];
    ctx.beginPath();
    ctx.arc(c.x, c.y, o.selected || o.hover ? 13 : 11, 0, Math.PI * 2);
    ctx.lineWidth = o.selected || o.hover ? 3 : 2;
    ctx.strokeStyle = o.selected ? "#101a30" : color;
    ctx.stroke();
    if (o.hover && shape.label) drawShapeLabel(ctx, v, shape.label, color);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
  if (shape.closed) {
    ctx.closePath();
    const k = o.fillAlpha ?? 1;
    if (k > 0) {
      ctx.fillStyle = hexAlpha(color, (o.selected || o.hover ? 0.38 : 0.24) * k);
      ctx.fill();
    }
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (o.dashed) ctx.setLineDash([6, 4]);
  ctx.lineWidth = o.selected || o.hover ? 4 : 3;
  ctx.strokeStyle = o.selected ? "#101a30" : color;
  ctx.stroke();
  if (o.selected) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // vertices
  const vr = o.selected ? 4 : 2.5;
  for (const p of sp) {
    ctx.beginPath();
    ctx.rect(p.x - vr, p.y - vr, vr * 2, vr * 2);
    ctx.fillStyle = o.selected ? "#fff" : color;
    ctx.fill();
    if (o.selected) {
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (shape.label) drawShapeLabel(ctx, v, shape.label, color);
  ctx.restore();
}

/** A marking's label at its page-space anchor, shifted by its offset in screen pixels. */
function drawShapeLabel(ctx: CanvasRenderingContext2D, v: View, l: LabelShape, accent: string) {
  const at = toScreen(l.at, v);
  drawLabel(ctx, l.text, at.x + (l.offset?.x ?? 0), at.y + (l.offset?.y ?? 0), accent, l.beside);
}

/** Zones: dashed outline, faint fill, name + area label near the top of the polygon. */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  v: View,
  pts: readonly Pt[],
  loc: Location | null,
  scale: PageScale | null,
  o: DrawOpts,
) {
  if (pts.length < 2) return;
  const color = loc?.color ?? "#2b3990";
  const sp = pts.map((p) => toScreen(p, v));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
  ctx.closePath();
  const k = o.fillAlpha ?? 1;
  if (k > 0) {
    ctx.fillStyle = hexAlpha(color, (o.selected || o.hover ? 0.14 : 0.07) * k);
    ctx.fill();
  }
  ctx.setLineDash(o.dashed ? [4, 4] : [10, 6]);
  ctx.lineWidth = o.selected || o.hover ? 3 : 2;
  ctx.strokeStyle = o.selected ? "#101a30" : color;
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.selected) {
    for (const p of sp) {
      ctx.beginPath();
      ctx.rect(p.x - 4, p.y - 4, 8, 8);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  if (pts.length >= 3) {
    const area = polygonArea(pts);
    const areaText = scale
      ? formatArea(area / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
      : `${area.toFixed(0)} pt²`;
    const b = bbox(pts);
    const top = toScreen({ x: (b.minX + b.maxX) / 2, y: b.minY }, v);
    drawLabel(ctx, loc ? `${loc.name} · ${areaText}` : areaText, top.x, top.y + 12, color);
  }
  ctx.restore();
}

/** A vertex handle (index) or a segment midpoint handle (segment index) under the pointer. */
export interface HandleRef {
  index: number;
  mid: boolean;
}

/**
 * Edit handles of the one selected marking: a square on each vertex and, with `midpoints`, a
 * small diamond on each segment (the closing one too when `closed`) to drag a new vertex from.
 */
export function drawHandles(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  v: View,
  o: {
    midpoints: boolean;
    closed?: boolean;
    hot?: HandleRef | null;
    /** the hot vertex is being dragged: draw it as a small dot so the snap marker stays readable */
    dragging?: boolean;
  },
) {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#101a30";
  if (o.midpoints && pts.length >= 2) {
    const n = o.closed && pts.length > 2 ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const c = toScreen(segmentMidpoint(pts, i), v);
      const r = o.hot?.mid && o.hot.index === i ? 5.5 : 4;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - r);
      ctx.lineTo(c.x + r, c.y);
      ctx.lineTo(c.x, c.y + r);
      ctx.lineTo(c.x - r, c.y);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      ctx.stroke();
    }
  }
  pts.forEach((p, i) => {
    const c = toScreen(p, v);
    const hot = o.hot && !o.hot.mid && o.hot.index === i;
    if (hot && o.dragging) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.stroke();
      return;
    }
    const r = hot ? 6.5 : 5;
    ctx.beginPath();
    ctx.rect(Math.round(c.x) - r + 0.5, Math.round(c.y) - r + 0.5, r * 2 - 1, r * 2 - 1);
    ctx.fillStyle = hot ? "#facc15" : "#fff";
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  accent: string,
  /** `x` is the label's left edge instead of its centre. */
  fromLeft = false,
) {
  ctx.save();
  ctx.font = "11px Cascadia Mono, Consolas, ui-monospace, monospace";
  const w = ctx.measureText(text).width + 12;
  if (fromLeft) x += w / 2;
  const h = 18;
  const rx = Math.round(x - w / 2);
  const ry = Math.round(y - h / 2);
  ctx.fillStyle = "rgba(15,15,15,0.85)";
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

function hexAlpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
