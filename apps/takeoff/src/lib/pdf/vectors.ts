import { OPS, type PDFPageProxy } from "pdfjs-dist";
import {
  CELL,
  fromResponse,
  type IndexRequest,
  type IndexResponse,
  indexPaths,
  type Mat,
  mul,
  type VectorIndex,
} from "./vectorsCore";

export type { SnapHit, SnapKind, VectorIndex } from "./vectorsCore";
export { snapPoint } from "./vectorsCore";

export interface CollectedPaths {
  /** All path data concatenated. */
  data: Float32Array;
  /** Path i spans data[offsets[i] .. offsets[i+1]). */
  offsets: Int32Array;
  /** 6 numbers per path: the CTM in effect when it was drawn. */
  mats: Float32Array;
}

/**
 * Copy every path (with its current transformation matrix) out of the page's operator list.
 * Must run before the page is rendered: pdf.js replaces path data with Path2D objects on render.
 * Cheap (one memcpy); the flattening and indexing happen in a worker.
 */
export async function collectPaths(page: PDFPageProxy): Promise<CollectedPaths> {
  const opList = await page.getOperatorList();
  const base = page.getViewport({ scale: 1 }).transform as Mat;
  const stack: Mat[] = [];
  let ctm = base;
  const parts: ArrayLike<number>[] = [];
  const mats: number[] = [];
  let total = 0;
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    // biome-ignore lint/suspicious/noExplicitAny: pdf.js op args are untyped
    const args = argsArray[i] as any;
    switch (fn) {
      case OPS.save:
        stack.push(ctm);
        break;
      case OPS.restore:
        ctm = stack.pop() ?? base;
        break;
      case OPS.transform:
        ctm = mul(ctm, args as Mat);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push(ctm);
        if (args?.[0]) ctm = mul(ctm, args[0] as Mat);
        break;
      case OPS.paintFormXObjectEnd:
        ctm = stack.pop() ?? base;
        break;
      case OPS.beginAnnotation:
        stack.push(ctm);
        if (args?.[2]) ctm = mul(ctm, args[2] as Mat);
        if (args?.[3]) ctm = mul(ctm, args[3] as Mat);
        break;
      case OPS.endAnnotation:
        ctm = stack.pop() ?? base;
        break;
      case OPS.constructPath: {
        const data = args?.[1]?.[0];
        if (data && typeof data.length === "number" && data.length > 0) {
          parts.push(data as ArrayLike<number>);
          total += data.length;
          mats.push(ctm[0], ctm[1], ctm[2], ctm[3], ctm[4], ctm[5]);
        }
        break;
      }
      default:
        break;
    }
  }
  const out = new Float32Array(total);
  const offsets = new Int32Array(parts.length + 1);
  let o = 0;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i], o);
    o += parts[i].length;
    offsets[i + 1] = o;
  }
  return { data: out, offsets, mats: Float32Array.from(mats) };
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: IndexResponse) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./vectors.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<IndexResponse>) => {
      const resolve = pending.get(e.data.id);
      pending.delete(e.data.id);
      resolve?.(e.data);
    };
    worker.onerror = (e) => console.error("vector worker error", e);
  }
  return worker;
}

function indexCollected(c: CollectedPaths): Promise<VectorIndex> {
  const req: IndexRequest = { id: nextId++, ...c, cell: CELL };
  const w = getWorker();
  if (!w) return Promise.resolve(fromResponse(indexPaths(req), CELL));
  return new Promise<IndexResponse>((resolve) => {
    pending.set(req.id, resolve);
    w.postMessage(req, [c.data.buffer, c.offsets.buffer, c.mats.buffer]);
  }).then((res) => fromResponse(res, CELL));
}

/** Collect and index in one go (used by tests and tools). */
export async function extractVectors(page: PDFPageProxy): Promise<VectorIndex> {
  return indexCollected(await collectPaths(page));
}

/** Split: `collected` resolves once the page is safe to render; `index` once snapping is ready. */
export function collectThenIndex(page: PDFPageProxy): {
  collected: Promise<void>;
  index: Promise<VectorIndex>;
} {
  const collected = collectPaths(page);
  return {
    collected: collected.then(() => undefined),
    index: collected.then(indexCollected),
  };
}
