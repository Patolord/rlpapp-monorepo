import { useEffect, useRef } from "react";
import { IDENTITY, oldPageFor, type Similarity } from "../lib/align";
import type { Rendered } from "../lib/pdf/render";
import { loadPdf, type OpenDoc, pinDoc, revisionDocKey, session, useDoc } from "../lib/session";
import { activeDrawing } from "../lib/types";
import { useStore } from "../store";
import { useViewport } from "../viewport";

/** Tints of the compare overlay: lines of the old revision and of the current one. */
const OLD_TINT = "#ff1a1a";
const NEW_TINT = "#1a1aff";

/** A render of the old page, already tinted, and how it sits on the current page. */
interface OldLayer {
  canvas: HTMLCanvasElement;
  /** CSS pixels per page point of the render. */
  scale: number;
  /** Old page space → current page space (the alignment used when the drawing was replaced). */
  t: Similarity;
  entry: OpenDoc;
  page: number;
  /** A mid-resolution render was asked for (zoomed in past the base render). */
  hiAsked: boolean;
}

/** The page render with its black lines turned into `color` (white stays white). */
function tinted(r: Rendered, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.canvas.width;
  c.height = r.canvas.height;
  const ctx = c.getContext("2d");
  if (!ctx) return r.canvas;
  ctx.drawImage(r.canvas, 0, 0);
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Compare overlay of the Viewer: the previous revision of the drawing in view, tinted red and
 * multiplied over the current page tinted blue, so what did not change prints black, what was
 * removed shows red and what is new shows blue. It sits between the PDF layers and the markings
 * canvas, follows the viewport on its own, and keeps the old PDF open (pinned) while it is on.
 */
export function CompareLayer() {
  const on = useStore((s) => s.compareRevision);
  const path = useStore((s) => activeDrawing(s.project)?.path ?? null);
  const rev = useStore((s) => activeDrawing(s.project)?.revisions?.at(-1) ?? null);
  const page = useStore((s) => s.page);
  const docId = useDoc((s) => s.docId);
  const tintRef = useRef<HTMLDivElement>(null);
  const oldRef = useRef<HTMLDivElement>(null);
  const layer = useRef<OldLayer | null>(null);
  const gen = useRef(0);

  const place = useRef(() => {
    const tint = tintRef.current;
    const old = oldRef.current;
    if (!tint || !old) return;
    const l = layer.current;
    const size = useDoc.getState().sizes[useStore.getState().page];
    if (!l || !size) {
      tint.style.display = "none";
      old.style.display = "none";
      return;
    }
    const v = useViewport.getState();
    tint.style.display = "block";
    tint.style.transform = `translate(${v.x}px, ${v.y}px)`;
    tint.style.width = `${size.w * v.zoom}px`;
    tint.style.height = `${size.h * v.zoom}px`;
    const { a, b, tx, ty } = l.t;
    old.style.display = "block";
    old.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom}) matrix(${a}, ${b}, ${-b}, ${a}, ${tx}, ${ty}) scale(${1 / l.scale})`;
    // zoomed in past the base render: swap in the mid-resolution one once
    const dpr = window.devicePixelRatio || 1;
    if (!l.hiAsked && v.zoom * dpr * Math.hypot(a, b) > l.scale * 1.25) {
      l.hiAsked = true;
      const g = gen.current;
      void l.entry.renderer
        .renderHi(l.page)
        .then((hi) => {
          if (g !== gen.current || layer.current !== l) return;
          show({ ...l, canvas: tinted(hi, OLD_TINT), scale: hi.scale });
        })
        .catch(() => {});
    }
  });

  const show = (l: OldLayer | null) => {
    layer.current = l;
    const old = oldRef.current;
    if (old) {
      old.replaceChildren();
      if (l) old.appendChild(l.canvas);
    }
    place.current();
  };

  useEffect(() => useViewport.subscribe(() => place.current()), []);
  // release the pinned revision when the viewer goes away
  useEffect(() => () => pinDoc(null), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: docId re-runs it when the PDF in view changes
  useEffect(() => {
    const g = ++gen.current;
    show(null);
    if (!on || !rev) {
      pinDoc(null);
      return;
    }
    const key = revisionDocKey(path, rev);
    pinDoc(key);
    const oldPage = oldPageFor(rev, page);
    const { setStatus } = useStore.getState();
    if (oldPage === null) {
      setStatus("Comparar: esta página não existe na revisão anterior.");
      return;
    }
    void (async () => {
      let entry = session.openDoc(key);
      if (!entry) {
        if (key !== rev.path) throw new Error("o PDF anterior foi sobrescrito pela revisão atual");
        entry = await loadPdf(rev.path);
      }
      if (oldPage >= entry.sizes.length) throw new Error("página ausente no PDF anterior");
      const r = await entry.renderer.renderBase(oldPage);
      if (g !== gen.current) return;
      show({
        canvas: tinted(r, OLD_TINT),
        scale: r.scale,
        t: rev.transforms?.[oldPage] ?? IDENTITY,
        entry,
        page: oldPage,
        hiAsked: false,
      });
    })().catch((e) => {
      if (g !== gen.current) return;
      setStatus(`Comparação indisponível: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, [on, path, rev, page, docId]);

  return (
    <>
      <div
        ref={tintRef}
        className="pointer-events-none absolute left-0 top-0 hidden origin-top-left"
        style={{ background: NEW_TINT, mixBlendMode: "screen" }}
      />
      <div
        ref={oldRef}
        className="pointer-events-none absolute left-0 top-0 hidden origin-top-left"
        style={{ mixBlendMode: "multiply" }}
      />
    </>
  );
}
