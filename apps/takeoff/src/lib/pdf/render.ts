import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rendered {
  page: number;
  canvas: HTMLCanvasElement;
  /** CSS pixels per page point. */
  scale: number;
  /** Device pixels per CSS pixel the canvas was rendered at. */
  dpr: number;
  /** Page-space rectangle covered by the canvas. */
  rect: Rect;
}

/** Longest side of the low-resolution base render, in device pixels. */
const BASE_PX = 2400;
/** Longest side of the mid-resolution full-page render used for medium zooms. */
const HI_PX = 4000;
/** Full-page mid-resolution renders kept per document (each is ~40 MB on an A0). */
const MAX_HI = 2;
/** Hard cap on device pixels per view render (keeps canvases well under browser limits). */
const MAX_VIEW_PIXELS = 24_000_000;

export const isCancelled = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  (e as { name?: string }).name === "RenderingCancelledException";

/**
 * Renders page regions with pdf.js. A pdf.js render costs about the same whatever the region
 * (every drawing operator runs), so full-page renders are cached at two resolutions and the
 * visible region is only rendered on demand when zoomed in beyond both. A newer view render
 * cancels the older one.
 */
export class PageRenderer {
  private pages = new Map<number, Promise<PDFPageProxy>>();
  private bases = new Map<number, Promise<Rendered>>();
  private his = new Map<number, Promise<Rendered>>();
  private thumbs = new Map<number, Promise<string>>();
  private viewTask: RenderTask | null = null;
  private viewGen = 0;

  constructor(
    readonly doc: PDFDocumentProxy,
    private readonly prepare: (page: number, proxy: PDFPageProxy) => Promise<void>,
  ) {}

  getPage(page: number): Promise<PDFPageProxy> {
    let p = this.pages.get(page);
    if (!p) {
      p = this.doc.getPage(page + 1).then(async (proxy) => {
        await this.prepare(page, proxy);
        return proxy;
      });
      this.pages.set(page, p);
    }
    return p;
  }

  private start(proxy: PDFPageProxy, scale: number, rect: Rect, dpr: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(rect.w * scale * dpr));
    canvas.height = Math.max(1, Math.ceil(rect.h * scale * dpr));
    const viewport = proxy.getViewport({
      scale: scale * dpr,
      offsetX: -rect.x * scale * dpr,
      offsetY: -rect.y * scale * dpr,
    });
    const task = proxy.render({ canvas, viewport, background: "#ffffff" });
    return { canvas, task };
  }

  private renderFull(page: number, longest: number): Promise<Rendered> {
    return this.getPage(page).then(async (proxy) => {
      const vp = proxy.getViewport({ scale: 1 });
      const scale = longest / Math.max(vp.width, vp.height);
      const rect = { x: 0, y: 0, w: vp.width, h: vp.height };
      const t0 = performance.now();
      const { canvas, task } = this.start(proxy, scale, rect, 1);
      await task.promise;
      if (import.meta.env.DEV) {
        console.debug(
          `full render ${longest}px page ${page + 1}: ${(performance.now() - t0).toFixed(0)}ms`,
        );
      }
      return { page, canvas, scale, dpr: 1, rect };
    });
  }

  /** Low-resolution full page, rendered once and kept for the document's lifetime. */
  renderBase(page: number): Promise<Rendered> {
    let p = this.bases.get(page);
    if (!p) {
      p = this.renderFull(page, BASE_PX);
      this.bases.set(page, p);
    }
    return p;
  }

  /** CSS pixels per point the mid-resolution level provides for a page of this size. */
  hiScale(pageW: number, pageH: number): number {
    return HI_PX / Math.max(pageW, pageH);
  }

  /** Mid-resolution full page; at most MAX_HI pages are kept. */
  renderHi(page: number): Promise<Rendered> {
    let p = this.his.get(page);
    if (!p) {
      p = this.renderFull(page, HI_PX);
      this.his.set(page, p);
      while (this.his.size > MAX_HI) {
        const oldest = this.his.keys().next().value;
        if (oldest === undefined || oldest === page) break;
        this.his.delete(oldest);
      }
    } else {
      // refresh LRU order
      this.his.delete(page);
      this.his.set(page, p);
    }
    return p;
  }

  /** The mid-resolution render if it is already finished (never starts one). */
  hiIfReady(page: number): Promise<Rendered> | null {
    return this.his.get(page) ?? null;
  }

  /** Thumbnail scaled down from the base render (no extra pdf.js pass). */
  renderThumb(page: number, width = 160): Promise<string> {
    let p = this.thumbs.get(page);
    if (!p) {
      p = this.renderBase(page).then((base) => {
        const canvas = document.createElement("canvas");
        const k = width / base.canvas.width;
        canvas.width = width;
        canvas.height = Math.max(1, Math.round(base.canvas.height * k));
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(base.canvas, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      });
      this.thumbs.set(page, p);
    }
    return p;
  }

  /** Render an arbitrary region without touching the view-render cancellation chain. */
  async renderRegion(page: number, scale: number, rect: Rect, dpr = 1): Promise<Rendered> {
    const proxy = await this.getPage(page);
    const { canvas, task } = this.start(proxy, scale, rect, dpr);
    await task.promise;
    return { page, canvas, scale, dpr, rect };
  }

  /** Render the visible region; returns null if superseded by a newer call. */
  async renderView(page: number, scale: number, rect: Rect, dpr: number): Promise<Rendered | null> {
    const gen = ++this.viewGen;
    this.viewTask?.cancel();
    this.viewTask = null;
    const proxy = await this.getPage(page);
    if (gen !== this.viewGen) return null;
    let useDpr = dpr;
    const px = rect.w * scale * rect.h * scale * dpr * dpr;
    if (px > MAX_VIEW_PIXELS) useDpr = dpr * Math.sqrt(MAX_VIEW_PIXELS / px);
    const { canvas, task } = this.start(proxy, scale, rect, useDpr);
    this.viewTask = task;
    try {
      await task.promise;
    } catch (e) {
      if (isCancelled(e)) return null;
      throw e;
    }
    if (gen !== this.viewGen) return null;
    this.viewTask = null;
    return { page, canvas, scale, dpr: useDpr, rect };
  }

  cancelView(): void {
    this.viewGen++;
    this.viewTask?.cancel();
    this.viewTask = null;
  }

  destroy(): void {
    this.cancelView();
    this.pages.clear();
    this.bases.clear();
    this.his.clear();
    this.thumbs.clear();
  }
}
