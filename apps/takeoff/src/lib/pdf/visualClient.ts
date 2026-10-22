import type { PDFPageProxy } from "pdfjs-dist";
import { session, useDoc } from "../session";
import { type Gray, type Match, type MatchOptions, matchTemplate, toGray } from "./visual";
import type { VisualRequest, VisualResponse } from "./visual.worker";

/** Render a page at `scale` px per point and return its ink image. */
export async function rasterizePage(proxy: PDFPageProxy, scale: number): Promise<Gray> {
  const viewport = proxy.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await proxy.render({ canvas, viewport, background: "#ffffff" }).promise;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d indisponível");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  return toGray(img.data, img.width, img.height);
}

/** Pixels per point for the search raster: 1.5 px/pt, capped so the page stays under 4000 px. */
export function searchScale(pageW: number, pageH: number): number {
  return Math.min(1.5, 4000 / Math.max(1, pageW, pageH));
}

export interface PageRaster {
  docId: number;
  page: number;
  scale: number;
  gray: Gray;
}

/** The search raster of a page, rendered once per page and kept until another page is searched. */
export function ensureRaster(page: number): Promise<PageRaster | null> {
  const doc = session.doc;
  if (!doc) return Promise.resolve(null);
  const docId = useDoc.getState().docId;
  const cached = session.raster;
  if (cached && cached.docId === docId && cached.page === page) return Promise.resolve(cached);
  const pending = session.rasterPending;
  if (pending && pending.docId === docId && pending.page === page) return pending.promise;
  const promise = (async () => {
    const proxy = await doc.getPage(page + 1);
    const vp = proxy.getViewport({ scale: 1 });
    const scale = searchScale(vp.width, vp.height);
    const raster = { docId, page, scale, gray: await rasterizePage(proxy, scale) };
    session.raster = raster;
    return raster;
  })();
  session.rasterPending = { docId, page, promise };
  void promise.finally(() => {
    if (session.rasterPending?.promise === promise) session.rasterPending = null;
  });
  return promise;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (m: Match[]) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./visual.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<VisualResponse>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.(e.data.matches);
    };
    worker.onerror = () => {
      for (const cb of pending.values()) cb([]);
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/** Run the matcher off the main thread (falls back to inline when workers are unavailable). */
export function findVisual(page: Gray, tpl: Gray, opts: MatchOptions = {}): Promise<Match[]> {
  const w = getWorker();
  if (!w) return Promise.resolve(matchTemplate(page, tpl, opts));
  const id = nextId++;
  // the page buffer is transferred, so hand the worker its own copy
  const req: VisualRequest = {
    id,
    page: { ...page, data: page.data.slice() },
    tpl: { ...tpl, data: tpl.data.slice() },
    opts,
  };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage(req, [req.page.data.buffer, req.tpl.data.buffer]);
  });
}
