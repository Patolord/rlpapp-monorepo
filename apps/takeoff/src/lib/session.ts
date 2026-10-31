import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { create } from "zustand";
import { basename } from "./paths";
import { PageRenderer } from "./pdf/render";
import { extractText, type TextBox } from "./pdf/text";
import { collectThenIndex, type VectorIndex } from "./pdf/vectors";
import type { Gray } from "./pdf/visual";
import { isTauri } from "./platform";
import type { ViewportTransform } from "./report/coords";
import type { DrawingRevision } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageSize {
  w: number;
  h: number;
}

export interface DocState {
  docId: number;
  name: string;
  path: string | null;
  numPages: number;
  sizes: PageSize[];
  loading: boolean;
  error: string | null;
}

export const useDoc = create<DocState>(() => ({
  docId: 0,
  name: "",
  path: null,
  numPages: 0,
  sizes: [],
  loading: false,
  error: null,
}));

export interface PageRaster {
  docId: number;
  page: number;
  scale: number;
  gray: Gray;
}

/**
 * Everything pdf.js and the indexes hold for one opened PDF. Parsed documents stay open (LRU,
 * see MAX_OPEN) so switching plantas is a pointer swap instead of a parse + render + index.
 */
export interface OpenDoc {
  key: string;
  name: string;
  path: string | null;
  doc: PDFDocumentProxy;
  task: PDFDocumentLoadingTask;
  renderer: PageRenderer;
  sizes: PageSize[];
  /**
   * pdf.js `viewport.transform` of each page at scale 1 (PDF user space → page space), so the
   * cutout report can place markings without pdf.js. Session only, never saved.
   */
  transforms: ViewportTransform[];
  vectors: Map<number, VectorIndex>;
  vectorTime: Map<number, number>;
  texts: Map<number, TextBox[]>;
  textPending: Map<number, Promise<TextBox[]>>;
  raster: PageRaster | null;
  rasterPending: { docId: number; page: number; promise: Promise<PageRaster | null> } | null;
  used: number;
}

/** Open documents kept in memory; the most recently used MAX_OPEN survive. */
const MAX_OPEN = 8;
const openDocs = new Map<string, OpenDoc>();
let active: OpenDoc | null = null;
/** A document eviction must keep besides the one in view (the compare overlay's revision). */
let pinned: string | null = null;
let useCounter = 0;
const EMPTY_VECTORS = new Map<number, VectorIndex>();
const EMPTY_TEXTS = new Map<number, TextBox[]>();

/** Non-serialisable PDF objects of the planta in view, outside React state. */
export const session = {
  get doc(): PDFDocumentProxy | null {
    return active?.doc ?? null;
  },
  get renderer(): PageRenderer | null {
    return active?.renderer ?? null;
  },
  get vectors(): Map<number, VectorIndex> {
    return active?.vectors ?? EMPTY_VECTORS;
  },
  get vectorTime(): Map<number, number> {
    return active?.vectorTime ?? new Map();
  },
  get texts(): Map<number, TextBox[]> {
    return active?.texts ?? EMPTY_TEXTS;
  },
  get raster(): PageRaster | null {
    return active?.raster ?? null;
  },
  set raster(r: PageRaster | null) {
    if (active) active.raster = r;
  },
  get rasterPending(): OpenDoc["rasterPending"] {
    return active?.rasterPending ?? null;
  },
  set rasterPending(p: OpenDoc["rasterPending"]) {
    if (active) active.rasterPending = p;
  },
  /** The open document for a PDF path (or dev key), whether or not it is the one in view. */
  openDoc(key: string): OpenDoc | undefined {
    return openDocs.get(key);
  },
  get openCount(): number {
    return openDocs.size;
  },
  /** Key of the document in view (its path, or the dev key). */
  get activeKey(): string | null {
    return active?.key ?? null;
  },
};

/** Positioned text of a page, extracted once and cached. */
export function ensureText(page: number): Promise<TextBox[]> {
  return active ? textOf(active, page) : Promise.resolve([]);
}

/**
 * Positioned text of a page of any open PDF (path or dev key), shared with `ensureText`'s cache;
 * undefined when that PDF is not open in the session.
 */
export function ensureDocText(key: string, page: number): Promise<TextBox[]> | undefined {
  const entry = openDocs.get(key);
  return entry ? textOf(entry, page) : undefined;
}

function textOf(entry: OpenDoc, page: number): Promise<TextBox[]> {
  const cached = entry.texts.get(page);
  if (cached) return Promise.resolve(cached);
  let p = entry.textPending.get(page);
  if (!p) {
    p = entry.doc
      .getPage(page + 1)
      .then(extractText)
      .then((boxes) => {
        entry.texts.set(page, boxes);
        return boxes;
      })
      .catch((e) => {
        console.warn("text extraction failed for page", page + 1, e);
        return [];
      });
    entry.textPending.set(page, p);
  }
  return p;
}

export { basename };

function destroyEntry(entry: OpenDoc) {
  entry.renderer.destroy();
  void entry.task.destroy();
  entry.vectors.clear();
  entry.texts.clear();
  entry.textPending.clear();
  entry.raster = null;
}

/** Drop the least recently used documents beyond MAX_OPEN (never the one in view). */
function evict() {
  if (openDocs.size <= MAX_OPEN) return;
  const victims = [...openDocs.values()]
    .filter((e) => e !== active && e.key !== pinned)
    .sort((a, b) => a.used - b.used)
    .slice(0, openDocs.size - MAX_OPEN);
  for (const v of victims) {
    openDocs.delete(v.key);
    destroyEntry(v);
  }
}

async function parseDoc(
  data: Uint8Array,
  name: string,
  path: string | null,
  key: string,
): Promise<OpenDoc> {
  const t0 = performance.now();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const sizes: PageSize[] = [];
  const transforms: ViewportTransform[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ w: vp.width, h: vp.height });
    transforms.push(vp.transform as unknown as ViewportTransform);
  }
  const vectors = new Map<number, VectorIndex>();
  const vectorTime = new Map<number, number>();
  const renderer = new PageRenderer(doc, async (index, proxy) => {
    // Copy the path data before the first render (pdf.js mutates it), but let the page
    // render while the worker flattens and indexes the geometry for snapping.
    const t = performance.now();
    try {
      const { collected, index: indexed } = await collectThenIndex(proxy);
      await collected;
      void indexed
        .then((idx) => {
          vectors.set(index, idx);
          vectorTime.set(index, performance.now() - t);
          console.info(
            `${name} page ${index + 1}: ${idx.count} segments indexed in ${(performance.now() - t).toFixed(0)}ms`,
          );
        })
        .catch((e) => console.warn("vector indexing failed for page", index + 1, e));
    } catch (e) {
      console.warn("vector extraction failed for page", index + 1, e);
    }
  });
  console.info(
    `opened ${name}: ${doc.numPages} page(s) in ${(performance.now() - t0).toFixed(0)}ms`,
  );
  return {
    key,
    name,
    path,
    doc,
    task,
    renderer,
    sizes,
    transforms,
    vectors,
    vectorTime,
    texts: new Map(),
    textPending: new Map(),
    raster: null,
    rasterPending: null,
    used: ++useCounter,
  };
}

/** Make an open document the one in view (instant when it is already parsed). */
function activate(entry: OpenDoc) {
  entry.used = ++useCounter;
  active = entry;
  useDoc.setState((s) => ({
    docId: s.docId + 1,
    name: entry.name,
    path: entry.path,
    numPages: entry.doc.numPages,
    sizes: entry.sizes,
    loading: false,
    error: null,
  }));
}

/** Viewport transforms (scale 1) of an open PDF's pages; undefined when it is not open. */
export const pageTransforms = (key: string): readonly ViewportTransform[] | undefined =>
  openDocs.get(key)?.transforms;

/** Is this PDF already parsed (switching to it costs nothing)? */
export const isDocOpen = (key: string): boolean => openDocs.has(key);

/** Parse a PDF without showing it, so the first switch to it is instant; renders its first page. */
export async function preloadPdfBytes(
  data: Uint8Array,
  name: string,
  path: string | null,
  key = path ?? name,
): Promise<OpenDoc> {
  const cached = openDocs.get(key);
  if (cached) return cached;
  const entry = await parseDoc(data, name, path, key);
  // a concurrent open may have won the race
  const again = openDocs.get(key);
  if (again) {
    destroyEntry(entry);
    return again;
  }
  openDocs.set(key, entry);
  evict();
  return entry;
}

export async function openPdfBytes(
  data: Uint8Array,
  name: string,
  path: string | null,
  key = path ?? name,
): Promise<void> {
  const cached = openDocs.get(key);
  if (cached) {
    activate(cached);
    return;
  }
  useDoc.setState({ loading: true, error: null });
  try {
    activate(await preloadPdfBytes(data, name, path, key));
  } catch (e) {
    useDoc.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export async function openPdfPath(path: string): Promise<void> {
  const cached = openDocs.get(path);
  if (cached) {
    activate(cached);
    return;
  }
  const buf = await invoke<ArrayBuffer>("read_file", { path });
  await openPdfBytes(new Uint8Array(buf), basename(path), path);
}

/** Parse (and pre-render the first page of) a PDF in the background. */
export async function preloadPdfPath(path: string): Promise<void> {
  if (openDocs.has(path)) return;
  const buf = await invoke<ArrayBuffer>("read_file", { path });
  const entry = await preloadPdfBytes(new Uint8Array(buf), basename(path), path);
  await entry.renderer.renderBase(0).catch(() => {});
}

/** Keep one document open whatever eviction decides (null releases it). */
export function pinDoc(key: string | null): void {
  pinned = key;
  evict();
}

/**
 * Move an open document to another key. Used when a revision overwrote its PDF in place: the
 * parsed old version stays reachable under `asKey` for the compare overlay, and the next open of
 * the path parses the new file (with a fresh snap index and rasters) instead of the stale cache.
 */
export function retireDoc(key: string, asKey: string): void {
  const entry = openDocs.get(key);
  if (!entry) return;
  openDocs.delete(key);
  const previous = openDocs.get(asKey);
  if (previous && previous !== active) destroyEntry(previous);
  entry.key = asKey;
  openDocs.set(asKey, entry);
}

/**
 * Session key of a drawing's earlier revision: its path, or a key of its own when the revision
 * was written over the same file (reachable only while the old version is still parsed).
 */
export const revisionDocKey = (currentPath: string | null, rev: DrawingRevision): string =>
  rev.path === currentPath ? `${rev.path}#${rev.replacedAt}` : rev.path;

/** Bytes of a PDF on disk: through Rust in the app, through Vite's /@fs/ in browser dev mode. */
export async function readPdfBytes(path: string): Promise<Uint8Array> {
  if (isTauri()) return new Uint8Array(await invoke<ArrayBuffer>("read_file", { path }));
  const res = await fetch(`/@fs/${path.replace(/\\/g, "/")}`);
  if (!res.ok) throw new Error(`${res.status} loading ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Parse a PDF without showing it (instant when it is already open) and return it. */
export async function loadPdf(path: string): Promise<OpenDoc> {
  return openDocs.get(path) ?? preloadPdfBytes(await readPdfBytes(path), basename(path), path);
}

/** Forget one PDF (its planta was removed from the takeoff). */
export function dropDoc(key: string): void {
  const entry = openDocs.get(key);
  if (!entry || entry === active) return;
  openDocs.delete(key);
  destroyEntry(entry);
}

/** Close every open PDF (the takeoff was closed). */
export function closePdf(): void {
  for (const entry of openDocs.values()) destroyEntry(entry);
  openDocs.clear();
  active = null;
  useDoc.setState({ name: "", path: null, numPages: 0, sizes: [], error: null });
}

/** Dev only: outside Tauri, `?pdf=<absolute path>` loads a drawing through Vite's /@fs/ endpoint. */
export async function devAutoOpen(): Promise<void> {
  if (isTauri() || !import.meta.env.DEV) return;
  const p = new URLSearchParams(window.location.search).get("pdf");
  if (!p) return;
  const res = await fetch(`/@fs/${p.replace(/\\/g, "/")}`);
  if (!res.ok) throw new Error(`${res.status} loading ${p}`);
  await openPdfBytes(new Uint8Array(await res.arrayBuffer()), basename(p), p);
  // register it as a drawing of the project, as openPdfFile does inside Tauri
  const { useStore } = await import("../store");
  const store = useStore.getState();
  const id = store.addDrawing(p, basename(p));
  store.setActiveDrawing(id);
  useStore.getState().ensurePages(useDoc.getState().numPages);
}

/** Dev only: add another drawing from an absolute path (browser mode). */
export async function devAddDrawing(p: string): Promise<void> {
  const { useStore } = await import("../store");
  const store = useStore.getState();
  const existing = store.project.drawings.find((d) => d.path === p);
  const id = existing?.id ?? store.addDrawing(p, basename(p));
  if (!openDocs.has(p)) {
    const res = await fetch(`/@fs/${p.replace(/\\/g, "/")}`);
    if (!res.ok) throw new Error(`${res.status} loading ${p}`);
    await openPdfBytes(new Uint8Array(await res.arrayBuffer()), basename(p), p);
  } else {
    await openPdfPath(p);
  }
  useStore.getState().setActiveDrawing(id);
  useStore.getState().ensurePages(useDoc.getState().numPages);
}
