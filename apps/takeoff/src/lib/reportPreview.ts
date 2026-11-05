/**
 * Live preview of the location cutout report: the report is written with the export's own code
 * (`prepareReport`, `writeReport`) and the bytes are opened with pdf.js, so what the dialog shows
 * is exactly what exports. One generation writes the printed report (without the pages the user
 * left out) in full, plus, when pages are left out, those pages alone (`WriteOptions.pages`) so
 * they keep a thumbnail and can be ticked back in.
 *
 * Why the whole report and not just the page in view: writing is cheap now that sheets are
 * embedded without re-encoding (40 pages over two 300k-segment A0 sheets: ~0.5 s; the test
 * project: tens of ms), and the thumbnails need every page anyway. The cost that grows with the
 * drawings is pdf.js rendering, so pages are rendered only when shown (thumbnails as they scroll
 * into view, at low resolution) and the large view once per zoom level.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import * as pdfjs from "pdfjs-dist";
import type { ReportPage, Size } from "./report/plan";
import type { ReportSettings } from "./report/settings";
import type { WrittenPage } from "./report/write";
import { type PreparedReport, prepareReport, type ReportSources } from "./reportExport";
// the pdf.js worker is set up by ./session (imported by ./reportExport)

/** One page of the preview: a page of the report, or of the pages left out. */
export interface PreviewPage {
  /** Stable while the page exists: `pageKey` plus the continuation, "capa#0" for the cover. */
  key: string;
  /** `pageKey` of the planned page; null for the cover. */
  pageKey: string | null;
  /** The planned page it shows; null for the cover. */
  report: ReportPage | null;
  /** 0 for the page itself, 1… for the continuation pages of its list. */
  continuation: number;
  /** "Sala 101 · folha A2", "Capa". */
  heading: string;
  /** Its number in the printed report; null when the page is left out. */
  number: number | null;
  skipped: boolean;
  doc: PreviewDoc;
  /** Page in `doc`, from 1. */
  pdfPage: number;
}

export interface PreviewResult {
  prepared: PreparedReport;
  pages: PreviewPage[];
  /** Pages of the printed report (N of "página n de N"). */
  total: number;
  /** Paper size, points. */
  paper: Size;
  /** Milliseconds: planning and reading the PDFs, writing, opening with pdf.js. */
  timings: { prepare: number; write: number; open: number };
  dispose(): void;
}

/** Thrown when a newer generation made this one useless. */
export class StalePreview extends Error {
  constructor() {
    super("stale preview");
  }
}

let worker: pdfjs.PDFWorker | null = null;

/** A report PDF opened with pdf.js for the preview. */
export class PreviewDoc {
  private constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly task: PDFDocumentLoadingTask,
  ) {}

  static async open(bytes: Uint8Array): Promise<PreviewDoc> {
    // one worker for every preview document: starting one per document costs ~0.5 s each time
    worker ??= new pdfjs.PDFWorker();
    const task = pdfjs.getDocument({ data: bytes, worker });
    return new PreviewDoc(await task.promise, task);
  }

  /** Render a page (from 1) into a new canvas at `scale` device pixels per point. */
  render(page: number, scale: number): { promise: Promise<HTMLCanvasElement>; cancel(): void } {
    let cancelled = false;
    let cancelTask = () => {};
    const promise = this.doc.getPage(page).then(async (proxy) => {
      if (cancelled) throw new StalePreview();
      const viewport = proxy.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const task = proxy.render({ canvas, viewport, background: "#ffffff" });
      cancelTask = () => task.cancel();
      await task.promise;
      return canvas;
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
        cancelTask();
      },
    };
  }

  destroy(): void {
    void this.task.destroy();
  }
}

/** Run at most `n` tasks at once (thumbnail renders), in the order asked. */
export function limiter(n: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (running >= n) return;
    const job = queue.shift();
    if (!job) return;
    running++;
    job();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      });
      next();
    });
}

/** Lets the UI breathe during a long write: yields once every ~30 ms of work. */
function yielder(isStale: () => boolean) {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 30) return;
    await new Promise<void>((r) => window.setTimeout(r, 0));
    last = performance.now();
    if (isStale()) throw new StalePreview();
  };
}

/**
 * Write and open the preview for the settings and the pages left out (by `pageKey`). Throws
 * `StalePreview` as soon as `isStale()` says a newer generation started.
 */
export async function buildPreview(
  settings: ReportSettings,
  skipped: readonly string[],
  sources: ReportSources,
  isStale: () => boolean,
): Promise<PreviewResult> {
  const check = () => {
    if (isStale()) throw new StalePreview();
  };
  const t0 = performance.now();
  const prepared = await prepareReport(settings, skipped, sources);
  check();
  const t1 = performance.now();
  if (prepared.plan.pages.length === 0) {
    return {
      prepared,
      pages: [],
      total: 0,
      paper: prepared.plan.layout.page,
      timings: { prepare: t1 - t0, write: 0, open: 0 },
      dispose: () => {},
    };
  }
  const yieldNow = yielder(isStale);
  const printedPages: WrittenPage[] = [];
  const printedBytes = await prepared.write(prepared.printed, {
    onPages: (w) => printedPages.push(...w),
    onProgress: yieldNow,
  });
  const skippedPages: WrittenPage[] = [];
  const skippedBytes = prepared.skipped.length
    ? await prepared.write(prepared.plan, {
        pages: prepared.skipped,
        onPages: (w) => skippedPages.push(...w),
        onProgress: yieldNow,
      })
    : null;
  check();
  const t2 = performance.now();
  const docs: PreviewDoc[] = [];
  const dispose = () => {
    for (const d of docs) d.destroy();
  };
  try {
    const printedDoc = await PreviewDoc.open(printedBytes);
    docs.push(printedDoc);
    const skippedDoc = skippedBytes ? await PreviewDoc.open(skippedBytes) : null;
    if (skippedDoc) docs.push(skippedDoc);
    check();
    const { plan, keys } = prepared;
    const skippedSet = new Set(prepared.skipped);
    /** Printed index of each planned page that is printed. */
    const printedIndex = new Map<number, number>();
    for (const p of plan.pages)
      if (!skippedSet.has(p.index)) printedIndex.set(p.index, printedIndex.size);
    const pages: PreviewPage[] = [];
    printedPages.forEach((w, k) => {
      if (w.planIndex !== undefined) return;
      pages.push({
        key: `capa#${w.continuation}`,
        pageKey: null,
        report: null,
        continuation: w.continuation,
        heading: w.continuation ? "Capa (continuação)" : "Capa",
        number: w.number,
        skipped: false,
        doc: printedDoc,
        pdfPage: k + 1,
      });
    });
    for (const p of plan.pages) {
      const skippedHere = skippedSet.has(p.index);
      const list = skippedHere ? skippedPages : printedPages;
      const doc = skippedHere ? skippedDoc : printedDoc;
      const at = skippedHere ? p.index : printedIndex.get(p.index);
      if (!doc) continue;
      list.forEach((w, k) => {
        if (w.planIndex !== at) return;
        pages.push({
          key: `${keys[p.index]}#${w.continuation}`,
          pageKey: keys[p.index],
          report: p,
          continuation: w.continuation,
          heading: w.continuation ? `${p.heading} (continuação)` : p.heading,
          number: skippedHere ? null : w.number,
          skipped: skippedHere,
          doc,
          pdfPage: k + 1,
        });
      });
    }
    const t3 = performance.now();
    return {
      prepared,
      pages,
      total: printedPages[0]?.total ?? 0,
      paper: plan.layout.page,
      timings: { prepare: t1 - t0, write: t2 - t1, open: t3 - t2 },
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
