import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { create } from "zustand";
import { PageRenderer } from "./pdf/render";
import { extractText, type TextBox } from "./pdf/text";
import { collectThenIndex, type VectorIndex } from "./pdf/vectors";

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

/** Non-serialisable PDF objects live here, outside React state. */
export const session = {
  doc: null as PDFDocumentProxy | null,
  task: null as PDFDocumentLoadingTask | null,
  renderer: null as PageRenderer | null,
  vectors: new Map<number, VectorIndex>(),
  vectorTime: new Map<number, number>(),
  texts: new Map<number, TextBox[]>(),
  textPending: new Map<number, Promise<TextBox[]>>(),
};

/** Positioned text of a page, extracted once and cached. */
export function ensureText(page: number): Promise<TextBox[]> {
  const cached = session.texts.get(page);
  if (cached) return Promise.resolve(cached);
  let p = session.textPending.get(page);
  if (!p) {
    const doc = session.doc;
    if (!doc) return Promise.resolve([]);
    p = doc
      .getPage(page + 1)
      .then(extractText)
      .then((boxes) => {
        if (session.doc === doc) session.texts.set(page, boxes);
        return boxes;
      })
      .catch((e) => {
        console.warn("text extraction failed for page", page + 1, e);
        return [];
      });
    session.textPending.set(page, p);
  }
  return p;
}

export const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

export async function openPdfBytes(data: Uint8Array, name: string, path: string | null) {
  useDoc.setState({ loading: true, error: null });
  try {
    const t0 = performance.now();
    const task = pdfjs.getDocument({ data });
    const doc = await task.promise;
    const sizes: PageSize[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      sizes.push({ w: vp.width, h: vp.height });
    }
    const oldTask = session.task;
    session.renderer?.destroy();
    session.doc = doc;
    session.task = task;
    session.vectors.clear();
    session.vectorTime.clear();
    session.texts.clear();
    session.textPending.clear();
    session.renderer = new PageRenderer(doc, async (index, proxy) => {
      // Copy the path data before the first render (pdf.js mutates it), but let the page
      // render while the worker flattens and indexes the geometry for snapping.
      const t = performance.now();
      try {
        const { collected, index: indexed } = await collectThenIndex(proxy);
        await collected;
        void indexed
          .then((idx) => {
            if (session.doc === doc) {
              session.vectors.set(index, idx);
              session.vectorTime.set(index, performance.now() - t);
              console.info(
                `page ${index + 1}: ${idx.count} segments indexed in ${(performance.now() - t).toFixed(0)}ms`,
              );
            }
          })
          .catch((e) => console.warn("vector indexing failed for page", index + 1, e));
      } catch (e) {
        console.warn("vector extraction failed for page", index + 1, e);
      }
    });
    void oldTask?.destroy();
    useDoc.setState((s) => ({
      docId: s.docId + 1,
      name,
      path,
      numPages: doc.numPages,
      sizes,
      loading: false,
      error: null,
    }));
    console.info(
      `opened ${name}: ${doc.numPages} page(s) in ${(performance.now() - t0).toFixed(0)}ms`,
    );
  } catch (e) {
    useDoc.setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export async function openPdfPath(path: string) {
  const buf = await invoke<ArrayBuffer>("read_file", { path });
  await openPdfBytes(new Uint8Array(buf), basename(path), path);
}

export function closePdf() {
  session.renderer?.destroy();
  void session.task?.destroy();
  session.doc = null;
  session.task = null;
  session.renderer = null;
  session.vectors.clear();
  session.texts.clear();
  session.textPending.clear();
  useDoc.setState({ name: "", path: null, numPages: 0, sizes: [], error: null });
}

/** Dev only: outside Tauri, `?pdf=<absolute path>` loads a drawing through Vite's /@fs/ endpoint. */
export async function devAutoOpen(): Promise<void> {
  if ("__TAURI_INTERNALS__" in window || !import.meta.env.DEV) return;
  const p = new URLSearchParams(window.location.search).get("pdf");
  if (!p) return;
  const res = await fetch(`/@fs/${p.replace(/\\/g, "/")}`);
  if (!res.ok) throw new Error(`${res.status} loading ${p}`);
  await openPdfBytes(new Uint8Array(await res.arrayBuffer()), basename(p), null);
}
