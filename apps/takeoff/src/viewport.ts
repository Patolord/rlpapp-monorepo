import { create } from "zustand";
import type { Pt } from "./lib/geom";

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
}

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
}));

export const toScreen = (p: Pt, v: { zoom: number; x: number; y: number }): Pt => ({
  x: p.x * v.zoom + v.x,
  y: p.y * v.zoom + v.y,
});

export const toPage = (s: Pt, v: { zoom: number; x: number; y: number }): Pt => ({
  x: (s.x - v.x) / v.zoom,
  y: (s.y - v.y) / v.zoom,
});
