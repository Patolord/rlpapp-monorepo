import { create } from "zustand";
import type { Box, Pt } from "./lib/geom";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

export interface Viewport {
  /** CSS pixels per page point. */
  zoom: number;
  /** Screen position of the page origin, CSS pixels. */
  x: number;
  y: number;
  set(v: Partial<Pick<Viewport, "zoom" | "x" | "y">>): void;
  zoomAt(sx: number, sy: number, factor: number): void;
  panBy(dx: number, dy: number): void;
  fit(pageW: number, pageH: number, viewW: number, viewH: number, padding?: number): void;
  /**
   * Zoom and position that show a page-space box centred in the view with a margin, never
   * closer than `maxZoom` (a tiny room should not fill the screen).
   */
  fitBox(box: Box, viewW: number, viewH: number, padding?: number, maxZoom?: number): View;
  /** Glides to a view over `ms` milliseconds; a new animation or a manual change cuts it short. */
  animateTo(target: View, ms?: number): void;
}

export type View = Pick<Viewport, "zoom" | "x" | "y">;

let animation = 0;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const useViewport = create<Viewport>((set, get) => ({
  zoom: 1,
  x: 0,
  y: 0,
  set: (v) => set(v),
  zoomAt: (sx, sy, factor) => {
    const { zoom, x, y } = get();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const k = next / zoom;
    set({ zoom: next, x: sx - (sx - x) * k, y: sy - (sy - y) * k });
  },
  panBy: (dx, dy) => set((s) => ({ x: s.x + dx, y: s.y + dy })),
  fit: (pageW, pageH, viewW, viewH, padding = 24) => {
    const zoom = Math.min((viewW - padding * 2) / pageW, (viewH - padding * 2) / pageH);
    set({
      zoom,
      x: (viewW - pageW * zoom) / 2,
      y: (viewH - pageH * zoom) / 2,
    });
  },
  fitBox: (box, viewW, viewH, padding = 48, maxZoom = 6) => {
    const w = Math.max(1, box.maxX - box.minX);
    const h = Math.max(1, box.maxY - box.minY);
    const zoom = Math.min(
      maxZoom,
      Math.max(MIN_ZOOM, Math.min((viewW - padding * 2) / w, (viewH - padding * 2) / h)),
    );
    return {
      zoom,
      x: viewW / 2 - ((box.minX + box.maxX) / 2) * zoom,
      y: viewH / 2 - ((box.minY + box.maxY) / 2) * zoom,
    };
  },
  animateTo: (target, ms = 280) => {
    cancelAnimationFrame(animation);
    const from = { zoom: get().zoom, x: get().x, y: get().y };
    const start = performance.now();
    const step = (now: number) => {
      const k = easeOut(Math.min(1, (now - start) / ms));
      set({
        zoom: from.zoom + (target.zoom - from.zoom) * k,
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
      });
      if (k < 1) animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
  },
}));

export const toScreen = (p: Pt, v: { zoom: number; x: number; y: number }): Pt => ({
  x: p.x * v.zoom + v.x,
  y: p.y * v.zoom + v.y,
});

export const toPage = (s: Pt, v: { zoom: number; x: number; y: number }): Pt => ({
  x: (s.x - v.x) / v.zoom,
  y: (s.y - v.y) / v.zoom,
});

/** How far a duplicate (Ctrl+D) lands from its original: a few screen pixels at the current zoom. */
export function duplicateOffset(): Pt {
  const d = 16 / useViewport.getState().zoom;
  return { x: d, y: d };
}
