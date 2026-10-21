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
/** Hard cap on device pixels per view render (keeps canvases well under browser limits). */
const MAX_VIEW_PIXELS = 24_000_000;

const isCancelled = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  (e as { name?: string }).name === "RenderingCancelledException";

/**
 * Renders page regions with pdf.js. Keeps one cached low-res "base" per page and renders
 * the visible region at full resolution on demand; a newer view render cancels the older one.
 */
export class PageRenderer {
  private pages = new Map<number, Promise<PDFPageProxy>>();
  private bases = new Map<number, Promise<Rendered>>();
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

  renderBase(page: number): Promise<Rendered> {
    let p = this.bases.get(page);
    if (!p) {
      p = this.getPage(page).then(async (proxy) => {
        const vp = proxy.getViewport({ scale: 1 });
        const scale = BASE_PX / Math.max(vp.width, vp.height);
        const rect = { x: 0, y: 0, w: vp.width, h: vp.height };
        const { canvas, task } = this.start(proxy, scale, rect, 1);
        await task.promise;
        return { page, canvas, scale, dpr: 1, rect };
      });
      this.bases.set(page, p);
    }
    return p;
  }

  renderThumb(page: number, width = 160): Promise<string> {
    let p = this.thumbs.get(page);
    if (!p) {
      p = this.getPage(page).then(async (proxy) => {
        const vp = proxy.getViewport({ scale: 1 });
        const scale = width / vp.width;
        const { canvas, task } = this.start(
          proxy,
          scale,
          { x: 0, y: 0, w: vp.width, h: vp.height },
          1,
        );
        await task.promise;
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
    this.thumbs.clear();
  }
}
