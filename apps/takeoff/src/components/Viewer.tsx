import { useEffect, useRef } from "react";
import {
  type Box,
  bbox,
  boxContains,
  boxesIntersect,
  dist,
  distToPolyline,
  hitMidpoint,
  hitVertex,
  insertVertex,
  moveVertex,
  orthoSnap,
  type Pt,
  pointInPolygon,
  removeVertex,
  translate,
} from "../lib/geom";
import { kitMode } from "../lib/kits";
import { drawHandles, drawLabel, drawMeasurement, drawZone, type HandleRef } from "../lib/overlay";
import { magicArea } from "../lib/pdf/magic";
import { isCancelled, type Rect, type Rendered } from "../lib/pdf/render";
import { type TextBox, textLinesIn, textNear } from "../lib/pdf/text";
import { type SnapHit, snapPoint } from "../lib/pdf/vectors";
import { crop } from "../lib/pdf/visual";
import { ensureRaster, findVisual } from "../lib/pdf/visualClient";
import { isEditableTarget } from "../lib/platform";
import { pageScale, zoneOf } from "../lib/quantities";
import { type Joined, joinedAt, reshape } from "../lib/reshape";
import { ensureText, session, useDoc } from "../lib/session";
import { locationOf } from "../lib/types";
import type { Kind } from "../lib/units";
import { vrfTag } from "../lib/vrf";
import { type Tool, useStore } from "../store";
import { viewerApi } from "../viewerApi";
import { toPage, toScreen, useViewport } from "../viewport";

type Drag =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; button: number; moved: boolean }
  | { kind: "move"; ids: string[]; start: Pt }
  | { kind: "rect"; start: Pt }
  | { kind: "similar"; start: Pt }
  | { kind: "legend"; start: Pt; startScreen: Pt; text: TextBox | null; moved: boolean }
  | { kind: "marquee"; start: Pt }
  | {
      kind: "vertex";
      id: string;
      /** Vertex being dragged; with `insert`, the new vertex between index - 1 and index. */
      index: number;
      insert: boolean;
      /** Points before the drag, restored by Esc. */
      orig: Pt[];
      /** Neighbouring vertex the ortho lock measures from. */
      anchor: Pt | null;
      /** Run ends joined to a dragged endpoint (duct and VRF runs); Ctrl leaves them. */
      joined: Joined | null;
      startScreen: Pt;
      moved: boolean;
    };

/** The one selected marking whose vertices can be edited. */
interface EditTarget {
  id: string;
  points: Pt[];
  closed: boolean;
  /** Fewest points it may keep: 2 for a run, 3 for an area or a location region. */
  min: number;
}

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
  similarBusy: boolean;
  moveDelta: Pt | null;
  /** Live geometry of a vertex drag by marking id (kit members and joined runs included). */
  reshape: Map<string, Pt[]> | null;
  /** Edit handle under the pointer (select tool). */
  hoverHandle: (HandleRef & { id: string }) | null;
  marquee: { a: Pt; b: Pt } | null;
  size: { w: number; h: number };
  needsFit: boolean;
  /** Box to centre once the page can be measured, or to restore if a fit lands right after it. */
  pendingFocus: { box: Box; at: number } | null;
  hoverText: TextBox | null;
}

const RENDER_DEBOUNCE_MS = 70;
const RENDER_MARGIN = 0.35;
const SNAP_PX = 10;
const HIT_PX = 6;
const HANDLE_PX = 8;
const DRAW_TOOLS: ReadonlySet<Tool> = new Set([
  "count",
  "linear",
  "area",
  "rect",
  "magic",
  "calibrate",
  "zone",
  "similar",
  "kit",
  "duct",
  "vrf",
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
  // the symbol search needs the page as an image: render it while the user draws the box
  useEffect(() => {
    if (tool === "similar" && numPages > 0) void ensureRaster(page);
  }, [tool, page, numPages]);

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
    similarBusy: false,
    moveDelta: null,
    reshape: null,
    hoverHandle: null,
    marquee: null,
    size: { w: 0, h: 0 },
    needsFit: false,
    pendingFocus: null,
    hoverText: null,
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
      const dpr = window.devicePixelRatio || 1;
      // device pixels per page point the screen needs right now
      const need = v.zoom * dpr;
      const crisp = (r: Rendered) => r.scale * r.dpr >= need - 1e-6;
      // no base yet: loadPage schedules a render as soon as it lands
      if (!s.base || s.base.page !== curPage) return;
      // the cached base already has enough pixels: nothing to render (overview zooms)
      if (crisp(s.base)) {
        if (s.view) {
          s.view = null;
          this.setLayer(viewLayerRef.current, null);
        }
        return;
      }
      const cur = s.view;
      if (cur && cur.page === curPage && crisp(cur) && rectContains(cur.rect, visible)) return;
      // medium zooms: one full-page render at mid resolution, then panning is free
      if (need <= renderer.hiScale(size.w, size.h)) {
        const ready = renderer.hiIfReady(curPage);
        renderer.cancelView();
        const hi = await (ready ?? renderer.renderHi(curPage));
        const now = useViewport.getState();
        if (useStore.getState().page !== curPage || session.renderer !== renderer) return;
        if (now.zoom * dpr > hi.scale * hi.dpr + 1e-6) return; // zoomed in meanwhile
        if (s.view !== hi) {
          s.view = hi;
          this.setLayer(viewLayerRef.current, hi);
          this.applyTransforms();
        }
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
        r = await renderer.renderView(curPage, v.zoom, rect, dpr);
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
      void ensureText(curPage);
      try {
        const base = await renderer.renderBase(curPage);
        if (useStore.getState().page !== curPage || session.renderer !== renderer) return;
        s.base = base;
        this.setLayer(baseLayerRef.current, base);
        this.applyTransforms();
        this.scheduleRender();
      } catch (e) {
        if (!isCancelled(e)) console.error("base render failed", e);
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
      // a focus asked for just before this fit (switching drawing, first measure) wins over it
      const pending = s.pendingFocus;
      if (pending && performance.now() - pending.at < 1000) {
        s.pendingFocus = null;
        this.focusBox(pending.box, false);
      }
    },
    focusBox(box: Box, animate = true) {
      const size = this.pageSize();
      const s = st.current;
      if (s.size.w === 0) {
        const r = rootRef.current?.getBoundingClientRect();
        if (r && r.width > 0) s.size = { w: r.width, h: r.height };
      }
      s.pendingFocus = { box, at: performance.now() };
      if (!size || s.size.w === 0) return; // fit() applies it once the page is measurable
      const v = useViewport.getState();
      const target = v.fitBox(box, s.size.w, s.size.h);
      if (animate) v.animateTo(target);
      else v.set(target);
    },
    screenPt(e: { clientX: number; clientY: number }): Pt {
      const r = rootRef.current?.getBoundingClientRect();
      return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
    },
    effective(raw: Pt): { pt: Pt; hit: SnapHit | null } {
      const s = st.current;
      const { snap, ortho, tool: t, page: p } = useStore.getState();
      const v = useViewport.getState();
      // a dragged vertex snaps and locks like a drawn point, from its neighbouring vertex
      const vd = s.drag?.kind === "vertex" ? s.drag : null;
      let hit: SnapHit | null = null;
      if (snap && ((DRAW_TOOLS.has(t) && t !== "magic") || vd)) {
        const idx = session.vectors.get(p);
        if (idx) hit = snapPoint(idx, raw, SNAP_PX / v.zoom);
      }
      if (hit) return { pt: { x: hit.x, y: hit.y }, hit };
      const anchor = vd ? vd.anchor : s.draft[s.draft.length - 1];
      if (
        (ortho || s.shiftDown) &&
        anchor &&
        (vd || t === "linear" || t === "area" || t === "calibrate" || t === "zone")
      ) {
        return { pt: orthoSnap(anchor, raw), hit: null };
      }
      return { pt: raw, hit: null };
    },
    hitPreview(raw: Pt): number {
      const { similarPreview: pv, similarThreshold, project, page: p } = useStore.getState();
      if (!pv || pv.drawingId !== project.activeDrawingId || pv.page !== p) return -1;
      let best = -1;
      let bd = Math.max(pv.w, pv.h) / 2;
      pv.matches.forEach((m, i) => {
        if (m.score < similarThreshold) return;
        const d = Math.hypot(m.x - raw.x, m.y - raw.y);
        if (d <= bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    },
    hitTest(raw: Pt): string | null {
      const { project, page: p, systemFilter } = useStore.getState();
      const v = useViewport.getState();
      const tol = HIT_PX / v.zoom;
      const items = new Map(project.items.map((i) => [i.id, i]));
      const did = project.activeDrawingId;
      for (let i = project.measurements.length - 1; i >= 0; i--) {
        const m = project.measurements[i];
        if (m.drawingId !== did || m.page !== p) continue;
        const item = items.get(m.itemId);
        if (!item) continue;
        if (systemFilter !== null && (item.system || project.system || "") !== systemFilter)
          continue;
        if (item.kind === "count") {
          if (dist(raw, m.points[0]) <= tol * 1.6) return m.id;
        } else if (item.kind === "linear") {
          if (distToPolyline(raw, m.points) <= tol) return m.id;
        } else if (pointInPolygon(raw, m.points) || distToPolyline(raw, m.points, true) <= tol) {
          return m.id;
        }
      }
      for (let i = project.zones.length - 1; i >= 0; i--) {
        const z = project.zones[i];
        if (
          z.drawingId === did &&
          z.page === p &&
          distToPolyline(raw, z.points, true) <= tol * 1.5
        ) {
          return z.id;
        }
      }
      return null;
    },
    editTarget(): EditTarget | null {
      const { project, selection, page: p, systemFilter } = useStore.getState();
      if (selection.length === 0) return null;
      const did = project.activeDrawingId;
      if (selection.length === 1) {
        const z = project.zones.find((x) => x.id === selection[0]);
        if (z) {
          if (z.drawingId !== did || z.page !== p || z.points.length < 3) return null;
          return { id: z.id, points: z.points, closed: true, min: 3 };
        }
      }
      // one measurement, or one kit group (its members share the geometry)
      const sel = new Set(selection);
      const ms = project.measurements.filter((m) => sel.has(m.id));
      if (ms.length !== selection.length) return null;
      const link = ms[0]?.linkId;
      if (ms.length > 1 && (!link || ms.some((m) => m.linkId !== link))) return null;
      const items = new Map(project.items.map((i) => [i.id, i]));
      for (const m of ms) {
        const item = items.get(m.itemId);
        if (!item || item.kind === "count" || m.points.length < 2) continue;
        if (m.drawingId !== did || m.page !== p) continue;
        if (systemFilter !== null && (item.system || project.system || "") !== systemFilter)
          continue;
        const closed = item.kind === "area";
        return { id: m.id, points: m.points, closed, min: closed ? 3 : 2 };
      }
      return null;
    },
    hitHandle(raw: Pt): (HandleRef & { id: string }) | null {
      const t = this.editTarget();
      if (!t) return null;
      const tol = HANDLE_PX / useViewport.getState().zoom;
      const i = hitVertex(t.points, raw, tol);
      if (i >= 0) return { id: t.id, index: i, mid: false };
      const j = hitMidpoint(t.points, raw, tol, t.closed);
      if (j >= 0) return { id: t.id, index: j, mid: true };
      return null;
    },
    startVertexDrag(handle: HandleRef & { id: string }, sp: Pt) {
      const t = this.editTarget();
      if (!t || t.id !== handle.id) return;
      const pts = t.points;
      const insert = handle.mid;
      const index = insert ? handle.index + 1 : handle.index;
      const anchor = insert
        ? pts[handle.index]
        : index > 0
          ? pts[index - 1]
          : t.closed
            ? pts[pts.length - 1]
            : pts[1];
      st.current.drag = {
        kind: "vertex",
        id: t.id,
        index,
        insert,
        orig: pts,
        anchor,
        joined: insert ? null : joinedAt(useStore.getState().project, t.id, index),
        startScreen: sp,
        moved: false,
      };
      st.current.hoverHandle = null;
    },
    /** Removes a vertex of the edited marking; false when it is not one (nothing to do). */
    removeVertexAt(id: string, index: number): boolean {
      const t = this.editTarget();
      if (!t || t.id !== id || index >= t.points.length) return false;
      const store = useStore.getState();
      const next = removeVertex(t.points, index, t.min);
      if (next) store.setPoints(id, next);
      else {
        store.setStatus(
          t.closed
            ? "Uma área precisa de pelo menos 3 pontos"
            : "Uma linha precisa de pelo menos 2 pontos",
        );
      }
      st.current.hoverHandle = null;
      this.requestDraw();
      return true;
    },
    /** Esc while dragging a vertex: back to the geometry before the drag. */
    cancelVertexDrag(): boolean {
      const s = st.current;
      if (s.drag?.kind !== "vertex") return false;
      s.drag = null;
      s.reshape = null;
      s.snapHit = null;
      if (rootRef.current) updateCursor(rootRef.current, s);
      this.requestDraw();
      return true;
    },
    finishDraft() {
      const s = st.current;
      const store = useStore.getState();
      const pts = dedupe(s.draft);
      s.draft = [];
      s.snapHit = null;
      if (store.tool === "kit" && pts.length >= 2) {
        if (store.activeKitId) store.addKitRun(store.activeKitId, store.page, pts);
        else store.setKitPickerOpen(true);
      } else if (store.tool === "duct" && pts.length >= 2) {
        store.setPendingDuct({ page: store.page, points: pts });
      } else if (store.tool === "vrf" && pts.length >= 2) {
        store.setPendingVrf({ page: store.page, points: pts });
      } else if (store.tool === "linear" && pts.length >= 2) {
        store.addMeasurement(store.resolveItem("linear"), store.page, pts);
      } else if (store.tool === "area" && pts.length >= 3) {
        store.addMeasurement(store.resolveItem("area"), store.page, pts);
      } else if (store.tool === "zone" && pts.length >= 3) {
        store.setPendingZone({ page: store.page, points: pts });
      }
      this.requestDraw();
    },
    cancelDraft() {
      const s = st.current;
      s.draft = [];
      s.drag = null;
      s.marquee = null;
      s.moveDelta = null;
      s.reshape = null;
      s.hoverText = null;
      this.requestDraw();
    },
    async runSimilar(box: Box) {
      const store = useStore.getState();
      const doc = session.doc;
      const s = st.current;
      if (!doc || s.similarBusy) return;
      s.similarBusy = true;
      store.setStatus("Procurando símbolos parecidos na página…");
      const t0 = performance.now();
      try {
        const w = box.maxX - box.minX;
        const hgt = box.maxY - box.minY;
        const raster = await ensureRaster(store.page);
        if (!raster) return;
        const { scale } = raster;
        const tpl = crop(raster.gray, box.minX * scale, box.minY * scale, w * scale, hgt * scale);
        const matches = await findVisual(raster.gray, tpl, { minScore: 0.5 });
        const now = useStore.getState();
        const itemId = now.resolveItem("count");
        now.setSimilarPreview({
          drawingId: now.project.activeDrawingId,
          page: store.page,
          itemId,
          matches: matches.map((m) => ({ x: m.cx / scale, y: m.cy / scale, score: m.score })),
          excluded: [],
          w,
          h: hgt,
        });
        const ms = (performance.now() - t0).toFixed(0);
        const n = matches.filter((m) => m.score >= now.similarThreshold).length;
        now.setStatus(
          n > 0
            ? `${n} símbolos parecidos em ${ms} ms · ajuste a sensibilidade, clique para excluir, Enter marca`
            : `Nenhum símbolo parecido (${ms} ms) · baixe a sensibilidade ou desenhe a caixa mais justa`,
        );
      } catch (e) {
        useStore
          .getState()
          .setStatus(`Busca falhou: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        s.similarBusy = false;
      }
    },
    async runMagic(raw: Pt) {
      const s = st.current;
      const renderer = session.renderer;
      const size = this.pageSize();
      if (s.magicBusy || !renderer || !size) return;
      const store = useStore.getState();
      s.magicBusy = true;
      store.setStatus("Detectando ambiente fechado…");
      const t0 = performance.now();
      try {
        const res = await magicArea(renderer, store.page, raw, size);
        if (!res) {
          store.setStatus("Nenhum ambiente fechado encontrado nesse ponto");
        } else {
          store.addMeasurement(store.resolveItem("area"), store.page, res.polygon);
          store.setStatus(
            res.unbounded
              ? `Área detectada em ${(performance.now() - t0).toFixed(0)} ms, mas atingiu o limite de busca — confira o contorno`
              : `Área detectada em ${(performance.now() - t0).toFixed(0)} ms`,
          );
        }
      } catch (e) {
        store.setStatus(`Falha na detecção de área: ${e instanceof Error ? e.message : String(e)}`);
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
      const {
        project,
        page: p,
        selection,
        tool: t,
        calibration,
        zoneFilter,
        systemFilter,
        similarPreview,
        similarThreshold,
        zonesVisible,
        zoneOpacity,
        fillOpacity,
        fillsVisible,
      } = store;
      const fillK = fillsVisible ? fillOpacity : 0;
      const v = useViewport.getState();
      const did = project.activeDrawingId;
      const scale = pageScale(project, did, p);
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

      for (const z of project.zones) {
        if (z.drawingId !== did || z.page !== p) continue;
        const isSel = sel.has(z.id) || zoneFilter === z.locationId;
        const pts =
          s.reshape?.get(z.id) ??
          (isSel && s.moveDelta ? translate(z.points, s.moveDelta.x, s.moveDelta.y) : z.points);
        if (!boxesIntersect(bbox(pts), viewBox)) continue;
        // hidden locations (globally or individually) still show while selected or filtered
        if ((!zonesVisible || z.hidden) && !isSel) continue;
        ctx.globalAlpha = isSel ? 1 : zoneOpacity;
        drawZone(ctx, v, pts, locationOf(project, z.locationId) ?? null, scale, {
          selected: isSel,
          hover: s.hoverId === z.id,
          dashed: false,
          fillAlpha: fillK,
        });
        ctx.globalAlpha = 1;
      }
      if (store.pendingZone && store.pendingZone.page === p) {
        drawZone(ctx, v, store.pendingZone.points, null, scale, {
          selected: true,
          hover: false,
          dashed: true,
        });
      }

      for (const m of project.measurements) {
        if (m.drawingId !== did || m.page !== p) continue;
        const item = items.get(m.itemId);
        if (!item) continue;
        if (systemFilter !== null && (item.system || project.system || "") !== systemFilter)
          continue;
        const isSel = sel.has(m.id);
        const pts =
          s.reshape?.get(m.id) ??
          (isSel && s.moveDelta ? translate(m.points, s.moveDelta.x, s.moveDelta.y) : m.points);
        if (!boxesIntersect(bbox(pts), viewBox)) continue;
        const outside =
          zoneFilter !== null && (zoneOf(project, m, item.kind)?.locationId ?? "") !== zoneFilter;
        if (outside) ctx.globalAlpha = 0.18;
        drawMeasurement(ctx, v, pts, item.kind, item.color, scale, {
          selected: isSel,
          hover: s.hoverId === m.id,
          dashed: false,
          symbol: item.symbol,
          fillAlpha: fillK,
          vertical: m.vertical,
          repeat: m.repeat,
          tag: m.duct
            ? `${m.duct.a}×${m.duct.b}`
            : m.vrf
              ? vrfTag(m.vrf, item.vrf?.hp ?? 0)
              : undefined,
        });
        ctx.globalAlpha = 1;
      }

      // vertex handles of the one selected marking (hidden while it is moved whole)
      const edit = t === "select" && !s.moveDelta ? this.editTarget() : null;
      if (edit) {
        const vd = s.drag?.kind === "vertex" ? s.drag : null;
        const hover = s.hoverHandle?.id === edit.id ? s.hoverHandle : null;
        drawHandles(ctx, s.reshape?.get(edit.id) ?? edit.points, v, {
          midpoints: !vd,
          closed: edit.closed,
          hot: vd ? { index: vd.index, mid: false } : hover,
          dragging: !!vd,
        });
      }

      if (similarPreview && similarPreview.drawingId === did && similarPreview.page === p) {
        const pvItem = items.get(similarPreview.itemId);
        const pvColor = pvItem?.color ?? "#f97316";
        const hw = (similarPreview.w / 2) * v.zoom;
        const hh = (similarPreview.h / 2) * v.zoom;
        similarPreview.matches.forEach((m, i) => {
          if (m.score < similarThreshold) return;
          const excluded = similarPreview.excluded.includes(i);
          const c = toScreen({ x: m.x, y: m.y }, v);
          ctx.save();
          ctx.globalAlpha = excluded ? 0.35 : 0.9;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = excluded ? "#dc2626" : pvColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(c.x - hw, c.y - hh, hw * 2, hh * 2);
          if (excluded) {
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(c.x - 6, c.y - 6);
            ctx.lineTo(c.x + 6, c.y + 6);
            ctx.moveTo(c.x + 6, c.y - 6);
            ctx.lineTo(c.x - 6, c.y + 6);
            ctx.stroke();
          }
          ctx.restore();
          if (!excluded) {
            ctx.globalAlpha = 0.7;
            drawMeasurement(ctx, v, [{ x: m.x, y: m.y }], "count", pvColor, scale, {
              selected: false,
              hover: false,
              dashed: true,
              symbol: pvItem?.symbol,
            });
            ctx.globalAlpha = 1;
          }
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
        } else if (t === "zone") {
          drawZone(ctx, v, pts, null, scale, { selected: false, hover: false, dashed: true });
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
      if (s.hoverText) {
        const a = toScreen({ x: s.hoverText.minX, y: s.hoverText.minY }, v);
        const b = toScreen({ x: s.hoverText.maxX, y: s.hoverText.maxY }, v);
        ctx.save();
        ctx.strokeStyle = "#facc15";
        ctx.fillStyle = "rgba(250,204,21,0.15)";
        ctx.lineWidth = 1.5;
        ctx.fillRect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4);
        ctx.strokeRect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4);
        ctx.restore();
        if (s.cursor) {
          const c = toScreen(s.cursor, v);
          drawLabel(ctx, `Alt+clique: "${s.hoverText.text}"`, c.x, c.y - 22, "#facc15");
        }
      }
      if (s.marquee) {
        const { a, b } = s.marquee;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(43,57,144,0.9)";
        ctx.fillStyle = "rgba(43,57,144,0.08)";
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
        ctx.strokeStyle = "rgba(16,26,48,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(c.y) + 0.5);
        ctx.lineTo(cw, Math.round(c.y) + 0.5);
        ctx.moveTo(Math.round(c.x) + 0.5, 0);
        ctx.lineTo(Math.round(c.x) + 0.5, ch);
        ctx.stroke();
        ctx.restore();
      }
      if (s.snapHit && (!s.drag || s.drag.kind === "vertex")) {
        const c = toScreen(s.snapHit, v);
        ctx.save();
        ctx.beginPath();
        if (s.snapHit.kind === "end") ctx.rect(c.x - 6, c.y - 6, 12, 12);
        else if (s.snapHit.kind === "mid") {
          ctx.moveTo(c.x, c.y - 7);
          ctx.lineTo(c.x + 7, c.y + 6);
          ctx.lineTo(c.x - 7, c.y + 6);
          ctx.closePath();
        } else ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        // dark halo under the yellow so the marker's shape reads on any background
        ctx.strokeStyle = "rgba(16,26,48,0.75)";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
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
      if (e.key === " " && !isEditableTarget(e)) {
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
      focusBox: (box) => h.focusBox(box),
      zoomBy: (f) => {
        const s = st.current.size;
        useViewport.getState().zoomAt(s.w / 2, s.h / 2, f);
      },
      cancelDrag: () => h.cancelVertexDrag(),
      removeHoveredVertex: () => {
        const hv = st.current.hoverHandle;
        if (!hv || hv.mid || useStore.getState().tool !== "select") return false;
        return h.removeVertexAt(hv.id, hv.index);
      },
      deleteSelection: () => {
        const store = useStore.getState();
        store.removeMeasurements(store.selection);
      },
      selectAllOnPage: () => {
        const store = useStore.getState();
        store.setSelection(
          store.project.measurements
            .filter((m) => m.drawingId === store.project.activeDrawingId && m.page === store.page)
            .map((m) => m.id),
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

  // page changed (the helpers read it from the store)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on page change
  useEffect(() => {
    helpers.current.cancelDraft();
    if (!numPages) return;
    void helpers.current.loadPage();
  }, [page, numPages]);

  // tool changed: drop any draft, update cursor (updateCursor reads the tool from the store)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on tool change
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

    if (e.altKey && e.button === 0 && store.tool === "select" && !s.spaceDown) {
      // Alt+click on a vertex of the selected marking removes it
      const handle = h.hitHandle(raw);
      if (handle && !handle.mid && h.removeVertexAt(handle.id, handle.index)) return;
    }
    if (e.altKey && e.button === 0) {
      // Alt+click: name the item from the text under the cursor; Alt+drag: capture a legend
      const texts = session.texts.get(store.page) ?? [];
      s.drag = {
        kind: "legend",
        start: raw,
        startScreen: sp,
        text: textNear(texts, raw),
        moved: false,
      };
      return;
    }
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

    if (store.similarPreview && (store.tool === "similar" || store.tool === "select")) {
      const i = h.hitPreview(raw);
      if (i >= 0) {
        store.toggleSimilarMatch(i);
        return;
      }
    }

    switch (store.tool) {
      case "select": {
        // the selected marking's handles win over whatever lies under them
        const handle = h.hitHandle(raw);
        if (handle) {
          h.startVertexDrag(handle, sp);
          updateCursor(root, s);
          break;
        }
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
      case "kit": {
        const kit = store.catalog.kits.find((k) => k.id === store.activeKitId);
        if (!kit) {
          store.setKitPickerOpen(true);
          break;
        }
        if (kitMode(kit) === "count") store.addKitRun(kit.id, store.page, [eff]);
        else s.draft.push(eff);
        break;
      }
      case "linear":
      case "duct":
      case "vrf":
        s.draft.push(eff);
        break;
      case "area": {
        if (s.draft.length >= 3 && dist(eff, s.draft[0]) <= (SNAP_PX * 1.2) / v.zoom) {
          h.finishDraft();
        } else s.draft.push(eff);
        break;
      }
      case "zone": {
        if (s.draft.length >= 3 && dist(eff, s.draft[0]) <= (SNAP_PX * 1.2) / v.zoom) {
          h.finishDraft();
        } else s.draft.push(eff);
        break;
      }
      case "rect":
        s.drag = { kind: "rect", start: eff };
        break;
      case "similar":
        s.drag = { kind: "similar", start: raw };
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
    else if (d?.kind === "vertex") {
      d.moved = d.moved || Math.hypot(sp.x - d.startScreen.x, sp.y - d.startScreen.y) > 2;
      if (d.moved) {
        const pts = d.insert
          ? insertVertex(d.orig, d.index - 1, eff)
          : moveVertex(d.orig, d.index, eff);
        s.reshape = reshape(useStore.getState().project, d.id, pts, e.ctrlKey ? null : d.joined);
      }
    } else if (d?.kind === "marquee") s.marquee = { a: d.start, b: sp };
    else if (d?.kind === "similar") s.marquee = { a: toScreen(d.start, v), b: sp };
    else if (d?.kind === "legend") {
      d.moved = d.moved || Math.hypot(sp.x - d.startScreen.x, sp.y - d.startScreen.y) > 3;
      s.marquee = d.moved ? { a: d.startScreen, b: sp } : null;
    } else if (!d && useStore.getState().tool === "select") {
      s.hoverId = h.hitTest(raw);
      s.hoverHandle = h.hitHandle(raw);
      if (rootRef.current) updateCursor(rootRef.current, s);
    }
    if (!d && e.altKey) {
      s.hoverText = textNear(session.texts.get(useStore.getState().page) ?? [], raw);
    } else if (s.hoverText) s.hoverText = null;
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
    } else if (d.kind === "vertex") {
      const next = s.reshape?.get(d.id);
      s.reshape = null;
      s.snapHit = null;
      if (d.moved && next) store.setPoints(d.id, next, e.ctrlKey ? null : d.joined);
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
        const ids = [...store.project.measurements, ...store.project.zones]
          .filter(
            (mm) =>
              mm.drawingId === store.project.activeDrawingId &&
              mm.page === store.page &&
              boxContains(box, bbox(mm.points)),
          )
          .map((mm) => mm.id);
        store.setSelection(e.shiftKey ? Array.from(new Set([...store.selection, ...ids])) : ids);
      }
    } else if (d.kind === "similar") {
      s.marquee = null;
      const b = s.cursor ?? d.start;
      const box: Box = {
        minX: Math.min(d.start.x, b.x),
        minY: Math.min(d.start.y, b.y),
        maxX: Math.max(d.start.x, b.x),
        maxY: Math.max(d.start.y, b.y),
      };
      if ((box.maxX - box.minX) * v.zoom > 4 && (box.maxY - box.minY) * v.zoom > 4) {
        h.runSimilar(box);
      }
    } else if (d.kind === "legend") {
      s.marquee = null;
      if (!d.moved) {
        if (d.text) store.nameActiveItem(d.text.text);
        else store.setStatus("Nenhum texto do desenho nesse ponto");
      } else {
        const b = s.cursor ?? d.start;
        const box: Box = {
          minX: Math.min(d.start.x, b.x),
          minY: Math.min(d.start.y, b.y),
          maxX: Math.max(d.start.x, b.x),
          maxY: Math.max(d.start.y, b.y),
        };
        const lines = textLinesIn(session.texts.get(store.page) ?? [], box);
        if (lines.length) store.setLegendCandidates(lines);
        else store.setStatus("Nenhum texto do desenho dentro da caixa");
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
    st.current.hoverHandle = null;
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
        className="absolute left-0 top-0 origin-top-left bg-white shadow-[0_0_40px_rgba(16,26,48,0.25)]"
      />
      <div ref={baseLayerRef} className="absolute left-0 top-0 origin-top-left" />
      <div ref={viewLayerRef} className="absolute left-0 top-0 origin-top-left" />
      <canvas ref={overlayRef} className="absolute left-0 top-0" />
    </div>
  );
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  return out;
}

function updateCursor(root: HTMLDivElement, s: Interaction) {
  const tool = useStore.getState().tool;
  if (s.drag?.kind === "pan") root.style.cursor = "grabbing";
  else if (s.spaceDown || tool === "pan") root.style.cursor = "grab";
  else if (tool === "select") {
    const handle = s.drag?.kind === "vertex" ? { mid: false } : s.hoverHandle;
    root.style.cursor = handle ? (handle.mid ? "copy" : "move") : "default";
  } else root.style.cursor = "crosshair";
}
