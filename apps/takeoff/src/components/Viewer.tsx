import { useEffect, useRef } from "react";
import {
  type Box,
  bbox,
  boxContains,
  boxesIntersect,
  dist,
  distToPolyline,
  orthoSnap,
  type Pt,
  pointAlong,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineLength,
  translate,
} from "../lib/geom";
import { magicArea } from "../lib/pdf/magic";
import type { Rect, Rendered } from "../lib/pdf/render";
import { type SnapHit, snapPoint } from "../lib/pdf/vectors";
import { pageScale } from "../lib/quantities";
import { session, useDoc } from "../lib/session";
import type { Measurement } from "../lib/types";
import { formatArea, formatLength, type Kind, type PageScale } from "../lib/units";
import { type Tool, useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { toPage, toScreen, useViewport } from "../viewport";

type Drag =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; button: number; moved: boolean }
  | { kind: "move"; ids: string[]; start: Pt }
  | { kind: "rect"; start: Pt }
  | { kind: "marquee"; start: Pt };

interface Interaction {
  draft: Pt[];
  cursor: Pt | null;
  eff: Pt | null;
  snapHit: SnapHit | null;
  drag: Drag | null;
  base: Rendered | null;
  view: Rendered | null;
  renderTimer: number;
  raf: number;
  hoverId: string | null;
  spaceDown: boolean;
  shiftDown: boolean;
  magicBusy: boolean;
  moveDelta: Pt | null;
  marquee: { a: Pt; b: Pt } | null;
  size: { w: number; h: number };
  needsFit: boolean;
}

const RENDER_DEBOUNCE_MS = 70;
const RENDER_MARGIN = 0.35;
const SNAP_PX = 10;
const HIT_PX = 6;
const DRAW_TOOLS: ReadonlySet<Tool> = new Set([
  "count",
  "linear",
  "area",
  "rect",
  "magic",
  "calibrate",
]);

const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5;

export function Viewer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const baseLayerRef = useRef<HTMLDivElement>(null);
  const viewLayerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const docId = useDoc((s) => s.docId);
  const numPages = useDoc((s) => s.numPages);
  const page = useStore((s) => s.page);
  const tool = useStore((s) => s.tool);

  const st = useRef<Interaction>({
    draft: [],
    cursor: null,
    eff: null,
    snapHit: null,
    drag: null,
    base: null,
    view: null,
    renderTimer: 0,
    raf: 0,
    hoverId: null,
    spaceDown: false,
    shiftDown: false,
    magicBusy: false,
    moveDelta: null,
    marquee: null,
    size: { w: 0, h: 0 },
    needsFit: false,
  });

  // ---------- helpers bound to refs ----------
  const helpers = useRef({
    pageSize(): { w: number; h: number } | null {
      const { sizes } = useDoc.getState();
      return sizes[useStore.getState().page] ?? null;
    },
    applyTransforms() {
      const s = st.current;
      const v = useViewport.getState();
      const size = this.pageSize();
      if (paperRef.current && size) {
        paperRef.current.style.transform = `translate(${v.x}px, ${v.y}px)`;
        paperRef.current.style.width = `${size.w * v.zoom}px`;
        paperRef.current.style.height = `${size.h * v.zoom}px`;
      }
      if (baseLayerRef.current && s.base) {
        baseLayerRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom / s.base.scale})`;
      }
      if (viewLayerRef.current && s.view) {
        const r = s.view.rect;
        viewLayerRef.current.style.transform = `translate(${v.x + r.x * v.zoom}px, ${v.y + r.y * v.zoom}px) scale(${v.zoom / s.view.scale})`;
      }
    },
    setLayer(layer: HTMLDivElement | null, r: Rendered | null) {
      if (!layer) return;
      layer.replaceChildren();
      if (!r) return;
      r.canvas.style.width = `${r.rect.w * r.scale}px`;
      r.canvas.style.height = `${r.rect.h * r.scale}px`;
      layer.appendChild(r.canvas);
    },
    requestDraw() {
      const s = st.current;
      if (s.raf) return;
      s.raf = requestAnimationFrame(() => {
        s.raf = 0;
        this.draw();
      });
    },
    scheduleRender() {
      const s = st.current;
      window.clearTimeout(s.renderTimer);
      s.renderTimer = window.setTimeout(() => this.render(), RENDER_DEBOUNCE_MS);
    },
    async render() {
      const s = st.current;
      const renderer = session.renderer;
      const size = this.pageSize();
      if (!renderer || !size || s.size.w === 0) return;
      const v = useViewport.getState();
      const curPage = useStore.getState().page;
      const vis: Rect = {
        x: -v.x / v.zoom,
        y: -v.y / v.zoom,
        w: s.size.w / v.zoom,
        h: s.size.h / v.zoom,
      };
      const x0 = Math.max(0, vis.x);
      const y0 = Math.max(0, vis.y);
      const x1 = Math.min(size.w, vis.x + vis.w);
      const y1 = Math.min(size.h, vis.y + vis.h);
      if (x1 <= x0 || y1 <= y0) return;
      const visible = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const cur = s.view;
      if (
        cur &&
        cur.page === curPage &&
        Math.abs(cur.scale - v.zoom) < 1e-6 &&
        rectContains(cur.rect, visible)
      ) {
        return;
      }
      const mx = vis.w * RENDER_MARGIN;
      const my = vis.h * RENDER_MARGIN;
      const rx0 = Math.max(0, vis.x - mx);
      const ry0 = Math.max(0, vis.y - my);
      const rx1 = Math.min(size.w, vis.x + vis.w + mx);
      const ry1 = Math.min(size.h, vis.y + vis.h + my);
      const rect = { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 };
      const t0 = performance.now();
      let r: Rendered | null = null;
      try {
        r = await renderer.renderView(curPage, v.zoom, rect, window.devicePixelRatio || 1);
      } catch (e) {
        console.error("render failed", e);
        return;
      }
      if (!r || r.page !== useStore.getState().page) return;
      s.view = r;
      this.setLayer(viewLayerRef.current, r);
      this.applyTransforms();
      if (import.meta.env.DEV) {
        console.debug(
          `view render ${(performance.now() - t0).toFixed(0)}ms @${v.zoom.toFixed(2)}x`,
        );
      }
    },
    async loadPage() {
      const s = st.current;
      const renderer = session.renderer;
      const curPage = useStore.getState().page;
      s.view = null;
      s.base = null;
      this.setLayer(viewLayerRef.current, null);
      this.setLayer(baseLayerRef.current, null);
      this.applyTransforms();
      if (!renderer) return;
      renderer.cancelView();
      this.scheduleRender();
      try {
        const base = await renderer.renderBase(curPage);
        if (useStore.getState().page !== curPage || session.renderer !== renderer) return;
        s.base = base;
        this.setLayer(baseLayerRef.current, base);
        this.applyTransforms();
      } catch (e) {
        console.error("base render failed", e);
      }
    },
    fit() {
      const size = this.pageSize();
      const s = st.current;
      if (!size) return;
      if (s.size.w === 0) {
        // the ResizeObserver may not have reported yet (fast PDF loads); measure directly
        const r = rootRef.current?.getBoundingClientRect();
        if (!r || r.width === 0) {
          s.needsFit = true;
          return;
        }
        s.size = { w: r.width, h: r.height };
      }
      s.needsFit = false;
      useViewport.getState().fit(size.w, size.h, s.size.w, s.size.h);
    },
    screenPt(e: { clientX: number; clientY: number }): Pt {
      const r = rootRef.current?.getBoundingClientRect();
      return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
    },
    effective(raw: Pt): { pt: Pt; hit: SnapHit | null } {
      const s = st.current;
      const { snap, ortho, tool: t, page: p } = useStore.getState();
      const v = useViewport.getState();
      let hit: SnapHit | null = null;
      if (snap && DRAW_TOOLS.has(t) && t !== "magic") {
        const idx = session.vectors.get(p);
        if (idx) hit = snapPoint(idx, raw, SNAP_PX / v.zoom);
      }
      if (hit) return { pt: { x: hit.x, y: hit.y }, hit };
      const anchor = s.draft[s.draft.length - 1];
      if (
        (ortho || s.shiftDown) &&
        anchor &&
        (t === "linear" || t === "area" || t === "calibrate")
      ) {
        return { pt: orthoSnap(anchor, raw), hit: null };
      }
      return { pt: raw, hit: null };
    },
    hitTest(raw: Pt): string | null {
      const { project, page: p } = useStore.getState();
      const v = useViewport.getState();
      const tol = HIT_PX / v.zoom;
      const items = new Map(project.items.map((i) => [i.id, i]));
      for (let i = project.measurements.length - 1; i >= 0; i--) {
        const m = project.measurements[i];
        if (m.page !== p) continue;
        const item = items.get(m.itemId);
        if (!item) continue;
        if (item.kind === "count") {
          if (dist(raw, m.points[0]) <= tol * 1.6) return m.id;
        } else if (item.kind === "linear") {
          if (distToPolyline(raw, m.points) <= tol) return m.id;
        } else if (pointInPolygon(raw, m.points) || distToPolyline(raw, m.points, true) <= tol) {
          return m.id;
        }
      }
      return null;
    },
    finishDraft() {
      const s = st.current;
      const store = useStore.getState();
      const pts = dedupe(s.draft);
      s.draft = [];
      s.snapHit = null;
      if (store.tool === "linear" && pts.length >= 2) {
        store.addMeasurement(store.resolveItem("linear"), store.page, pts);
      } else if (store.tool === "area" && pts.length >= 3) {
        store.addMeasurement(store.resolveItem("area"), store.page, pts);
      }
      this.requestDraw();
    },
    cancelDraft() {
      const s = st.current;
      s.draft = [];
      s.drag = null;
      s.marquee = null;
      s.moveDelta = null;
      this.requestDraw();
    },
    async runMagic(raw: Pt) {
      const s = st.current;
      const renderer = session.renderer;
      const size = this.pageSize();
      if (s.magicBusy || !renderer || !size) return;
      const store = useStore.getState();
      s.magicBusy = true;
      store.setStatus("Detecting enclosed area…");
      const t0 = performance.now();
      try {
        const res = await magicArea(renderer, store.page, raw, size);
        if (!res) {
          store.setStatus("No enclosed area found at that point");
        } else {
          store.addMeasurement(store.resolveItem("area"), store.page, res.polygon);
          store.setStatus(
            res.unbounded
              ? `Area detected in ${(performance.now() - t0).toFixed(0)} ms, but it reached the search limit — check the outline`
              : `Area detected in ${(performance.now() - t0).toFixed(0)} ms`,
          );
        }
      } catch (e) {
        store.setStatus(`Area detection failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        s.magicBusy = false;
        this.requestDraw();
      }
    },
    draw() {
      const cv = overlayRef.current;
      const s = st.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const { w: cw, h: ch } = s.size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const store = useStore.getState();
      const { project, page: p, selection, tool: t, calibration } = store;
      const v = useViewport.getState();
      const scale = pageScale(project, p);
      const items = new Map(project.items.map((i) => [i.id, i]));
      const sel = new Set(selection);
      const tl = toPage({ x: 0, y: 0 }, v);
      const br = toPage({ x: cw, y: ch }, v);
      const viewBox: Box = { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
      const pad = 20 / v.zoom;
      viewBox.minX -= pad;
      viewBox.minY -= pad;
      viewBox.maxX += pad;
      viewBox.maxY += pad;

      for (const m of project.measurements) {
        if (m.page !== p) continue;
        const item = items.get(m.itemId);
        if (!item) continue;
        if (!boxesIntersect(bbox(m.points), viewBox)) continue;
        const isSel = sel.has(m.id);
        const pts =
          isSel && s.moveDelta ? translate(m.points, s.moveDelta.x, s.moveDelta.y) : m.points;
        drawMeasurement(ctx, v, pts, item.kind, item.color, scale, {
          selected: isSel,
          hover: s.hoverId === m.id,
          dashed: false,
        });
      }

      const active = items.get(store.activeItemId ?? "");
      const color = active?.color ?? "#f97316";
      if (s.draft.length > 0 && s.eff) {
        const pts = [...s.draft, s.eff];
        const kind: Kind = t === "area" ? "area" : "linear";
        if (t === "calibrate") {
          drawMeasurement(ctx, v, pts, "linear", "#facc15", null, {
            selected: false,
            hover: false,
            dashed: true,
          });
        } else {
          drawMeasurement(ctx, v, pts, kind, color, scale, {
            selected: false,
            hover: false,
            dashed: true,
          });
        }
      }
      if (s.drag?.kind === "rect" && s.eff) {
        const a = s.drag.start;
        const b = s.eff;
        const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        drawMeasurement(ctx, v, pts, "area", color, scale, {
          selected: false,
          hover: false,
          dashed: true,
        });
      }
      if (s.marquee) {
        const { a, b } = s.marquee;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.restore();
      }
      if (calibration && calibration.page === p) {
        drawMeasurement(ctx, v, [calibration.a, calibration.b], "linear", "#facc15", null, {
          selected: true,
          hover: false,
          dashed: false,
        });
      }
      if (DRAW_TOOLS.has(t) && s.cursor && !s.drag) {
        const c = toScreen(s.eff ?? s.cursor, v);
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(c.y) + 0.5);
        ctx.lineTo(cw, Math.round(c.y) + 0.5);
        ctx.moveTo(Math.round(c.x) + 0.5, 0);
        ctx.lineTo(Math.round(c.x) + 0.5, ch);
        ctx.stroke();
        ctx.restore();
      }
      if (s.snapHit && !s.drag) {
        const c = toScreen(s.snapHit, v);
        ctx.save();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (s.snapHit.kind === "end") ctx.rect(c.x - 6, c.y - 6, 12, 12);
        else if (s.snapHit.kind === "mid") {
          ctx.moveTo(c.x, c.y - 7);
          ctx.lineTo(c.x + 7, c.y + 6);
          ctx.lineTo(c.x - 7, c.y + 6);
          ctx.closePath();
        } else ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },
  });

  // ---------- effects ----------
  useEffect(() => {
    const h = helpers.current;
    const root = rootRef.current;
    const cv = overlayRef.current;
    if (!root || !cv) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      st.current.size = { w: r.width, h: r.height };
      if (st.current.needsFit && r.width > 0) h.fit();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      h.requestDraw();
      h.scheduleRender();
    });
    ro.observe(root);
    const unsubV = useViewport.subscribe(() => {
      h.applyTransforms();
      h.requestDraw();
      h.scheduleRender();
    });
    const unsubS = useStore.subscribe(() => h.requestDraw());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e)) {
        st.current.spaceDown = e.type === "keydown";
        if (e.type === "keydown") e.preventDefault();
        updateCursor(root, st.current);
      }
      st.current.shiftDown = e.shiftKey;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sp = h.screenPt(e);
      const factor = Math.exp(-Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.22);
      useViewport.getState().zoomAt(sp.x, sp.y, factor);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    viewerApi.current = {
      hasDraft: () => st.current.draft.length > 0,
      finishDraft: () => h.finishDraft(),
      cancelDraft: () => h.cancelDraft(),
      popDraft: () => {
        st.current.draft.pop();
        h.requestDraw();
      },
      fit: () => h.fit(),
      zoomBy: (f) => {
        const s = st.current.size;
        useViewport.getState().zoomAt(s.w / 2, s.h / 2, f);
      },
      deleteSelection: () => {
        const store = useStore.getState();
        store.removeMeasurements(store.selection);
      },
      selectAllOnPage: () => {
        const store = useStore.getState();
        store.setSelection(
          store.project.measurements.filter((m) => m.page === store.page).map((m) => m.id),
        );
      },
    };
    return () => {
      ro.disconnect();
      unsubV();
      unsubS();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root.removeEventListener("wheel", onWheel);
      viewerApi.current = null;
    };
  }, []);

  // document opened: fit and load the page
  useEffect(() => {
    if (!docId) return;
    helpers.current.fit();
    void helpers.current.loadPage();
  }, [docId]);

  // page changed
  useEffect(() => {
    helpers.current.cancelDraft();
    if (!numPages) return;
    void helpers.current.loadPage();
  }, [page, numPages]);

  // tool changed: drop any draft, update cursor
  useEffect(() => {
    helpers.current.cancelDraft();
    if (rootRef.current) updateCursor(rootRef.current, st.current);
  }, [tool]);

  // ---------- pointer handlers ----------
  const onPointerDown = (e: React.PointerEvent) => {
    const h = helpers.current;
    const s = st.current;
    const root = rootRef.current;
    if (!root || !numPages) return;
    root.setPointerCapture(e.pointerId);
    const sp = h.screenPt(e);
    const v = useViewport.getState();
    const raw = toPage(sp, v);
    const store = useStore.getState();
    s.shiftDown = e.shiftKey;

    if (e.button === 1 || e.button === 2 || s.spaceDown || store.tool === "pan") {
      s.drag = {
        kind: "pan",
        sx: sp.x,
        sy: sp.y,
        ox: v.x,
        oy: v.y,
        button: e.button,
        moved: false,
      };
      updateCursor(root, s);
      return;
    }
    if (e.button !== 0) return;
    const { pt: eff } = h.effective(raw);

    switch (store.tool) {
      case "select": {
        const hit = h.hitTest(raw);
        if (hit) {
          let sel = store.selection;
          if (e.shiftKey) sel = sel.includes(hit) ? sel.filter((id) => id !== hit) : [...sel, hit];
          else if (!sel.includes(hit)) sel = [hit];
          store.setSelection(sel);
          if (sel.includes(hit)) s.drag = { kind: "move", ids: sel, start: raw };
        } else {
          if (!e.shiftKey) store.setSelection([]);
          s.drag = { kind: "marquee", start: sp };
          s.marquee = { a: sp, b: sp };
        }
        break;
      }
      case "count":
        store.addMeasurement(store.resolveItem("count"), store.page, [eff]);
        break;
      case "linear":
        s.draft.push(eff);
        break;
      case "area": {
        if (s.draft.length >= 3 && dist(eff, s.draft[0]) <= (SNAP_PX * 1.2) / v.zoom) {
          h.finishDraft();
        } else s.draft.push(eff);
        break;
      }
      case "rect":
        s.drag = { kind: "rect", start: eff };
        break;
      case "magic":
        void h.runMagic(raw);
        break;
      case "calibrate": {
        s.draft.push(eff);
        if (s.draft.length === 2) {
          store.setCalibration({ page: store.page, a: s.draft[0], b: s.draft[1] });
          s.draft = [];
        }
        break;
      }
      default:
        break;
    }
    h.requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const h = helpers.current;
    const s = st.current;
    if (!numPages) return;
    const sp = h.screenPt(e);
    const v = useViewport.getState();
    const raw = toPage(sp, v);
    s.cursor = raw;
    s.shiftDown = e.shiftKey;
    const d = s.drag;
    if (d?.kind === "pan") {
      d.moved = d.moved || Math.hypot(sp.x - d.sx, sp.y - d.sy) > 2;
      useViewport.getState().set({ x: d.ox + (sp.x - d.sx), y: d.oy + (sp.y - d.sy) });
      return;
    }
    const { pt: eff, hit } = h.effective(raw);
    s.eff = eff;
    s.snapHit = hit;
    if (d?.kind === "move") s.moveDelta = { x: raw.x - d.start.x, y: raw.y - d.start.y };
    else if (d?.kind === "marquee") s.marquee = { a: d.start, b: sp };
    else if (!d && useStore.getState().tool === "select") s.hoverId = h.hitTest(raw);
    h.requestDraw();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const h = helpers.current;
    const s = st.current;
    const d = s.drag;
    s.drag = null;
    const store = useStore.getState();
    const v = useViewport.getState();
    if (rootRef.current) updateCursor(rootRef.current, s);
    if (!d) return;
    if (d.kind === "pan") {
      if (d.button === 2 && !d.moved) {
        if (s.draft.length > 0) h.finishDraft();
        else if (store.tool !== "select") store.setTool("select");
      }
    } else if (d.kind === "move") {
      const delta = s.moveDelta;
      s.moveDelta = null;
      if (delta) store.moveMeasurements(d.ids, delta.x, delta.y);
    } else if (d.kind === "marquee") {
      const m = s.marquee;
      s.marquee = null;
      if (m && Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) > 3) {
        const a = toPage(m.a, v);
        const b = toPage(m.b, v);
        const box: Box = {
          minX: Math.min(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxX: Math.max(a.x, b.x),
          maxY: Math.max(a.y, b.y),
        };
        const ids = store.project.measurements
          .filter((mm) => mm.page === store.page && boxContains(box, bbox(mm.points)))
          .map((mm) => mm.id);
        store.setSelection(e.shiftKey ? Array.from(new Set([...store.selection, ...ids])) : ids);
      }
    } else if (d.kind === "rect") {
      const b = s.eff ?? d.start;
      const a = d.start;
      if (Math.abs(b.x - a.x) * v.zoom > 2 && Math.abs(b.y - a.y) * v.zoom > 2) {
        store.addMeasurement(store.resolveItem("area"), store.page, [
          a,
          { x: b.x, y: a.y },
          b,
          { x: a.x, y: b.y },
        ]);
      }
    }
    h.requestDraw();
  };

  const onDoubleClick = () => {
    const s = st.current;
    if (s.draft.length > 0) helpers.current.finishDraft();
  };

  const onPointerLeave = () => {
    st.current.cursor = null;
    st.current.snapHit = null;
    st.current.hoverId = null;
    helpers.current.requestDraw();
  };

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full touch-none overflow-hidden bg-neutral-800"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={paperRef}
        className="absolute left-0 top-0 origin-top-left bg-white shadow-[0_0_40px_rgba(0,0,0,0.6)]"
      />
      <div ref={baseLayerRef} className="absolute left-0 top-0 origin-top-left" />
      <div ref={viewLayerRef} className="absolute left-0 top-0 origin-top-left" />
      <canvas ref={overlayRef} className="absolute left-0 top-0" />
    </div>
  );
}

// ---------- drawing ----------

interface DrawOpts {
  selected: boolean;
  hover: boolean;
  dashed: boolean;
}

function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  v: { zoom: number; x: number; y: number },
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
    ctx.beginPath();
    ctx.arc(c.x, c.y, o.selected || o.hover ? 8 : 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.selected ? "#fff" : "rgba(0,0,0,0.7)";
    ctx.stroke();
    if (o.selected) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(sp[0].x, sp[0].y);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
  if (kind === "area") {
    ctx.closePath();
    ctx.fillStyle = hexAlpha(color, o.selected || o.hover ? 0.38 : 0.24);
    ctx.fill();
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (o.dashed) ctx.setLineDash([6, 4]);
  ctx.lineWidth = o.selected || o.hover ? 4 : 3;
  ctx.strokeStyle = o.selected ? "#ffffff" : color;
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
      : `${len.toFixed(0)} pt · no scale`;
    at = toScreen(pointAlong(pts, 0.5), v);
  } else {
    const area = polygonArea(pts);
    text = scale
      ? formatArea(area / (scale.pointsPerUnit * scale.pointsPerUnit), scale.unit)
      : `${area.toFixed(0)} pt² · no scale`;
    at = toScreen(polygonCentroid(pts), v);
  }
  drawLabel(ctx, text, at.x, at.y, color);
  ctx.restore();
}

function drawLabel(
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

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  return out;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}

function updateCursor(root: HTMLDivElement, s: Interaction) {
  const tool = useStore.getState().tool;
  if (s.drag?.kind === "pan") root.style.cursor = "grabbing";
  else if (s.spaceDown || tool === "pan") root.style.cursor = "grab";
  else if (tool === "select") root.style.cursor = "default";
  else root.style.cursor = "crosshair";
}

export type { Measurement };
