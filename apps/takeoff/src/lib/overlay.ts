/**
 * Canvas painting of the viewer overlay: measurements, locations and labels in screen space.
 * Pure drawing; the Viewer decides what is visible, selected or hovered.
 */
import { bbox, type Pt, pointAlong, polygonArea, polygonCentroid, polylineLength } from "./geom";
import { drawSymbol } from "./symbols";
import type { Location } from "./types";
import { formatArea, formatLength, type Kind, type PageScale } from "./units";

/** Screen transform: CSS pixels per page point and the page origin on screen. */
export type View = { zoom: number; x: number; y: number };

const toScreen = (p: Pt, v: View): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });

export interface DrawOpts {
  selected: boolean;
  hover: boolean;
  dashed: boolean;
  /** Count marks: symbol id from lib/symbols (undefined = dot). */
  symbol?: string;
  /** Multiplier for the hatch fill of areas and locations (0 = outline only, default 1). */
  fillAlpha?: number;
  /** Linear runs: vertical length (project units) appended to the label. */
  vertical?: number;
  /** Times the measurement counts; shown as "×N" when above 1. */
  repeat?: number;
  /** Short prefix for the label (duct section). */
  tag?: string;
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
  const sp = pts.map((p) => toScreen(p, v));
  ctx.save();
  if (kind === "count") {
    const c = sp[0];
    const emphasis = o.selected || o.hover;
    drawSymbol(ctx, o.symbol, c.x, c.y, emphasis ? MARK_PX + 4 : MARK_PX, color, emphasis);
    if (o.selected) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#101a30";
      ctx.stroke();
    }
    if (o.repeat && o.repeat > 1) drawLabel(ctx, `×${o.repeat}`, c.x + 14, c.y - 12, color);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
  if (kind === "area") {
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
  // label
  let text: string;
  let at: Pt;
  if (kind === "linear") {
    const len = polylineLength(pts);
    text = scale
      ? formatLength(len / scale.pointsPerUnit, scale.unit)
      : `${len.toFixed(0)} pt · sem escala`;
    if (o.vertical) text += ` + ${formatLength(o.vertical, scale?.unit ?? "m")} vert.`;
    at = toScreen(pointAlong(pts, 0.5), v);
  } else {
    const area = polygonArea(pts);
    text = scale
      ? formatArea(area / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
      : `${area.toFixed(0)} pt² · sem escala`;
    at = toScreen(polygonCentroid(pts), v);
  }
  if (o.tag) text = `${o.tag} · ${text}`;
  if (o.repeat && o.repeat > 1) text += ` ×${o.repeat}`;
  drawLabel(ctx, text, at.x, at.y, color);
  ctx.restore();
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

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  accent: string,
) {
  ctx.save();
  ctx.font = "11px Cascadia Mono, Consolas, ui-monospace, monospace";
  const w = ctx.measureText(text).width + 12;
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
