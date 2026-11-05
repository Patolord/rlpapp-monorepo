import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReportPage, Size } from "../lib/report/plan";
import type { ReportSettings } from "../lib/report/settings";
import { ReportSources } from "../lib/reportExport";
import {
  buildPreview,
  limiter,
  type PreviewDoc,
  type PreviewPage,
  type PreviewResult,
  StalePreview,
} from "../lib/reportPreview";
import type { Project } from "../lib/types";

/** Quiet time after a settings change before the preview is written again. */
const DEBOUNCE_MS = 500;
/** Thumbnail width, CSS pixels. */
const THUMB_W = 148;
/** Largest canvas of the large view, device pixels (zooming further scales it up). */
const MAX_VIEW_PIXELS = 16_000_000;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 16;

/**
 * Writes the preview for the dialog's settings: at once when the dialog opens, then
 * `DEBOUNCE_MS` after the last change. A generation that is overtaken by a newer one stops at
 * its next checkpoint and its result is dropped. The source PDFs are parsed once while the
 * dialog stays open (`ReportSources`) and handed to the export too.
 */
export function useReportPreview(
  open: boolean,
  settings: ReportSettings,
  skipped: readonly string[],
  project: Project,
): { result: PreviewResult | null; busy: boolean; error: string | null; sources: ReportSources } {
  const [sources] = useState(() => new ReportSources());
  const gen = useRef(0);
  const current = useRef<PreviewResult | null>(null);
  const opened = useRef(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    // closed: drop the documents and the parsed PDFs (they may change before the next time)
    gen.current++;
    current.current?.dispose();
    current.current = null;
    opened.current = false;
    setResult(null);
    setBusy(false);
    setError(null);
    sources.clear();
  }, [open, sources]);

  useEffect(
    () => () => {
      gen.current++;
      current.current?.dispose();
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: the project is read through the store; any edit to it re-writes the preview
  useEffect(() => {
    if (!open) return;
    const mine = ++gen.current;
    const isStale = () => gen.current !== mine;
    setBusy(true);
    const delay = opened.current ? DEBOUNCE_MS : 0;
    opened.current = true;
    const timer = window.setTimeout(() => {
      buildPreview(settings, skipped, sources, isStale).then(
        (r) => {
          if (isStale()) {
            r.dispose();
            return;
          }
          current.current?.dispose();
          current.current = r;
          setResult(r);
          setError(null);
          setBusy(false);
          const t = r.timings;
          console.info(
            `report preview: ${r.pages.length} page(s); plan + PDFs ${t.prepare.toFixed(0)} ms, write ${t.write.toFixed(0)} ms, open ${t.open.toFixed(0)} ms`,
          );
        },
        (e) => {
          if (e instanceof StalePreview || isStale()) return;
          setError(e instanceof Error ? e.message : String(e));
          setBusy(false);
        },
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [open, settings, skipped, project, sources]);

  return { result, busy, error, sources };
}

interface Cached {
  doc: PreviewDoc;
  pdfPage: number;
  url: string;
}

/** Why "Ver na planta" is off for a page, or null when it is on. */
export type GoToBlock = (page: ReportPage | null) => string | null;

interface PreviewProps {
  result: PreviewResult | null;
  busy: boolean;
  error: string | null;
  /** Pages left out (by `pageKey`), as the store has them now (the result may lag behind). */
  skipped: readonly string[];
  selected: string | null;
  onSelect(key: string): void;
  onToggle(pageKey: string, include: boolean): void;
  onGoTo(page: ReportPage): void;
  goToBlocked: GoToBlock;
  /** Shown instead of the pages (nothing to report). */
  empty?: string;
}

/**
 * The preview pane: a column of page thumbnails (each with its "incluir" box) and the selected
 * page large, with zoom, pan, previous/next and "Ver na planta".
 */
export function ReportPreview({
  result,
  busy,
  error,
  skipped,
  selected,
  onSelect,
  onToggle,
  onGoTo,
  goToBlocked,
  empty,
}: PreviewProps) {
  const cache = useRef(new Map<string, Cached>()).current;
  const queue = useMemo(() => limiter(2), []);
  const listRef = useRef<HTMLDivElement>(null);
  const zoomHandle: ZoomHandle = useRef(null);
  const [zoom, setZoom] = useState(1);
  const pages = result?.pages ?? [];
  const at = pages.findIndex((p) => p.key === selected);
  const page = at >= 0 ? pages[at] : null;
  const go = (delta: number) => {
    const next = pages[at + delta];
    if (next) onSelect(next.key);
  };
  const skippedSet = new Set(skipped);
  const isSkipped = (p: PreviewPage) => (p.pageKey ? skippedSet.has(p.pageKey) : false);
  const blocked = page ? goToBlocked(page.report) : "Nenhuma página";

  // keep the selected thumbnail in sight (previous/next from the large view)
  useEffect(() => {
    if (!selected) return;
    const el = listRef.current?.querySelector(`[data-key="${CSS.escape(selected)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const status = busy ? (
    <span className="flex items-center gap-1 text-[11px] text-neutral-400">
      <LoaderCircle size={12} className="animate-spin" /> atualizando…
    </span>
  ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-neutral-950/40">
      <div className="flex w-44 shrink-0 flex-col border-r border-neutral-800">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-neutral-800 px-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-300">
            Páginas
          </span>
          {result && result.pages.length > 0 && (
            <span className="text-[11px] text-neutral-500">{result.total} no PDF</span>
          )}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
          {pages.map((p) => (
            <Thumb
              key={p.key}
              page={p}
              paper={result?.paper ?? { width: 842, height: 595 }}
              selected={p.key === selected}
              skipped={isSkipped(p) || p.skipped}
              onSelect={() => onSelect(p.key)}
              onToggle={(include) => p.pageKey && onToggle(p.pageKey, include)}
              root={listRef}
              cache={cache}
              queue={queue}
            />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-neutral-800 px-2">
          <ToolButton label="Página anterior (←)" disabled={at <= 0} onClick={() => go(-1)}>
            <ChevronLeft size={15} />
          </ToolButton>
          <ToolButton
            label="Próxima página (→)"
            disabled={at < 0 || at >= pages.length - 1}
            onClick={() => go(1)}
          >
            <ChevronRight size={15} />
          </ToolButton>
          <div className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">
            {page && (
              <>
                <span className="text-neutral-500">
                  {page.number !== null ? `pág. ${page.number} de ${result?.total}` : "omitida"}
                  {" · "}
                </span>
                {page.heading}
              </>
            )}
          </div>
          {status}
          <ZoomControls
            label={`${Math.round(zoom * 100)}%`}
            send={(c) => zoomHandle.current?.(c)}
          />
          <button
            type="button"
            disabled={!!blocked}
            title={blocked ?? "Fecha o relatório e mostra este recorte na planta (duplo clique)"}
            onClick={() => page?.report && onGoTo(page.report)}
            className="ml-1 inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-orange-200 ring-1 ring-orange-400/50 hover:bg-orange-500/15 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ScanSearch size={14} />
            Ver na planta
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {page && result ? (
            <LargeView
              page={page}
              paper={result.paper}
              dim={isSkipped(page) || page.skipped}
              zoomHandle={zoomHandle}
              onZoom={setZoom}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onGoTo={() => !blocked && page.report && onGoTo(page.report)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-neutral-500">
              {error ? (
                <span className="text-amber-300">Falha na pré-visualização: {error}</span>
              ) : empty ? (
                empty
              ) : (
                <span className="flex items-center gap-2">
                  <LoaderCircle size={14} className="animate-spin" /> Gerando a pré-visualização…
                </span>
              )}
            </div>
          )}
          {error && page && (
            <div className="absolute inset-x-0 bottom-0 bg-amber-950/90 px-3 py-1.5 text-[11px] text-amber-200">
              Falha ao atualizar: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Zoom of the large view: shared between its toolbar buttons and the view itself

type ZoomCommand = "in" | "out" | "fit";
/** The large view's zoom, driven by the toolbar. */
type ZoomHandle = { current: ((c: ZoomCommand) => void) | null };

function ZoomControls({ label, send }: { label: string; send(c: ZoomCommand): void }) {
  return (
    <div className="flex items-center">
      <ToolButton label="Diminuir (−)" onClick={() => send("out")}>
        <ZoomOut size={15} />
      </ToolButton>
      <span className="w-11 text-center text-[11px] tabular-nums text-neutral-400">{label}</span>
      <ToolButton label="Aumentar (+)" onClick={() => send("in")}>
        <ZoomIn size={15} />
      </ToolButton>
      <ToolButton label="Ajustar à tela (0)" onClick={() => send("fit")}>
        <Maximize size={14} />
      </ToolButton>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Thumbnails

function Thumb({
  page,
  paper,
  selected,
  skipped,
  onSelect,
  onToggle,
  root,
  cache,
  queue,
}: {
  page: PreviewPage;
  paper: Size;
  selected: boolean;
  skipped: boolean;
  onSelect(): void;
  onToggle(include: boolean): void;
  root: React.RefObject<HTMLDivElement | null>;
  cache: Map<string, Cached>;
  queue: ReturnType<typeof limiter>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(() => cache.get(page.key)?.url ?? null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root: root.current,
      rootMargin: "240px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // render once visible, at low resolution; the previous image stays until the new one is ready
  useEffect(() => {
    if (!visible) return;
    const hit = cache.get(page.key);
    if (hit && hit.doc === page.doc && hit.pdfPage === page.pdfPage) {
      setUrl(hit.url);
      return;
    }
    let alive = true;
    let cancel = () => {};
    const scale = (THUMB_W * Math.min(2, window.devicePixelRatio || 1)) / paper.width;
    queue(async () => {
      if (!alive) return null;
      const job = page.doc.render(page.pdfPage, scale);
      cancel = job.cancel;
      return job.promise;
    })
      .then((canvas) => {
        if (!canvas) return;
        const u = canvas.toDataURL("image/png");
        cache.set(page.key, { doc: page.doc, pdfPage: page.pdfPage, url: u });
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancel();
    };
  }, [visible, page.doc, page.pdfPage, page.key, paper.width, cache, queue]);

  const first = page.pageKey !== null && page.continuation === 0;
  return (
    <div
      ref={ref}
      data-key={page.key}
      className={clsx(
        "rounded p-1.5",
        selected ? "bg-orange-500/15 ring-1 ring-orange-400/70" : "hover:bg-neutral-800/70",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={page.heading}
        className="relative block w-full overflow-hidden rounded-sm bg-white shadow ring-1 ring-black/40"
        style={{ aspectRatio: `${paper.width} / ${paper.height}` }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className={clsx("h-full w-full", skipped && "opacity-30 grayscale")}
          />
        ) : (
          <span className="absolute inset-0 animate-pulse bg-neutral-200" />
        )}
        {skipped && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
            omitida
          </span>
        )}
      </button>
      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
        {first ? (
          <label
            className="flex cursor-pointer items-center gap-1 text-neutral-300"
            title="Desmarque para deixar esta página fora do PDF"
          >
            <input
              type="checkbox"
              className="accent-orange-500"
              checked={!skipped}
              onChange={(e) => onToggle(e.target.checked)}
            />
            incluir
          </label>
        ) : (
          <span className="text-neutral-500">
            {page.pageKey ? "continuação" : page.continuation ? "capa (cont.)" : "capa"}
          </span>
        )}
        <span className="ml-auto text-neutral-500">
          {page.number !== null && !skipped ? `pág. ${page.number}` : ""}
        </span>
      </div>
      <div className="truncate text-[11px] leading-tight text-neutral-200" title={page.heading}>
        {page.heading}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Large view

interface View {
  /** Relative to fitting the page in the view. */
  zoom: number;
  /** Page point (points) at the centre of the view. */
  cx: number;
  cy: number;
}

const fitView = (paper: Size): View => ({ zoom: 1, cx: paper.width / 2, cy: paper.height / 2 });
const PAD = 16;

/** Device scale (pixels per point) rounded up to √2 steps, so small zooms reuse the render. */
function renderScale(cssScale: number, paper: Size): number {
  const dpr = window.devicePixelRatio || 1;
  const want = cssScale * dpr;
  const stepped = 2 ** (Math.ceil(Math.log2(want) * 2 - 1e-9) / 2);
  const cap = Math.sqrt(MAX_VIEW_PIXELS / (paper.width * paper.height));
  return Math.min(stepped, cap);
}

function LargeView({
  page,
  paper,
  dim,
  zoomHandle,
  onZoom,
  onPrev,
  onNext,
  onGoTo,
}: {
  page: PreviewPage;
  paper: Size;
  dim: boolean;
  zoomHandle: ZoomHandle;
  onZoom(zoom: number): void;
  onPrev(): void;
  onNext(): void;
  onGoTo(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => fitView(paper));
  const [seq, setSeq] = useState(0);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const shown = useRef<{ doc: PreviewDoc; pdfPage: number; scale: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // another page (or another paper): fit it
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the page or the paper changes
  useEffect(() => setView(fitView(paper)), [page.key, paper.width, paper.height]);

  const fit =
    size.w > 0 ? Math.min((size.w - 2 * PAD) / paper.width, (size.h - 2 * PAD) / paper.height) : 0;
  const scale = fit * view.zoom;
  const left = size.w / 2 - view.cx * scale;
  const top = size.h / 2 - view.cy * scale;

  const zoomAt = (factor: number, sx = size.w / 2, sy = size.h / 2) =>
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const s1 = fit * v.zoom;
      const s2 = fit * zoom;
      if (s1 <= 0) return v;
      const px = v.cx + (sx - size.w / 2) / s1;
      const py = v.cy + (sy - size.h / 2) / s1;
      return { zoom, cx: px - (sx - size.w / 2) / s2, cy: py - (sy - size.h / 2) / s2 };
    });

  // toolbar buttons
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  zoomHandle.current = (c) => {
    if (c === "fit") setView(fitView(paper));
    else zoomAt(c === "in" ? 1.25 : 0.8);
  };
  useEffect(() => onZoom(view.zoom), [view.zoom, onZoom]);

  // wheel zoom at the cursor (a non-passive listener, to keep the dialog from scrolling)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  // render the page at the zoom's resolution: at once for a new page, after a pause when zooming
  const target = scale > 0 ? renderScale(scale, paper) : 0;
  useEffect(() => {
    if (target <= 0) return;
    const prev = shown.current;
    const samePage = prev?.doc === page.doc && prev.pdfPage === page.pdfPage;
    if (samePage && prev.scale >= target) return;
    let job: { promise: Promise<HTMLCanvasElement>; cancel(): void } | null = null;
    const timer = window.setTimeout(
      () => {
        const t0 = performance.now();
        job = page.doc.render(page.pdfPage, target);
        job.promise
          .then((canvas) => {
            canvas.className = "block h-full w-full";
            holder.current?.replaceChildren(canvas);
            shown.current = { doc: page.doc, pdfPage: page.pdfPage, scale: target };
            setSeq((n) => n + 1);
            if (import.meta.env.DEV) {
              console.debug(
                `report preview: page rendered at ${target.toFixed(2)} px/pt in ${(performance.now() - t0).toFixed(0)} ms`,
              );
            }
          })
          .catch(() => {});
      },
      samePage ? 150 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      job?.cancel();
    };
  }, [page.doc, page.pdfPage, target]);

  return (
    <div
      ref={box}
      title="Arraste para mover · roda para zoom · ← → trocam a página · duplo clique: ver na planta"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the view takes arrow and zoom keys
      tabIndex={0}
      data-render-seq={seq}
      className="absolute inset-0 cursor-grab touch-none overflow-hidden outline-none active:cursor-grabbing"
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 1) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || scale <= 0) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        setView({ ...d.view, cx: d.view.cx - dx / scale, cy: d.view.cy - dy / scale });
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={onGoTo}
      onKeyDown={(e) => {
        const k = e.key;
        if (k === "ArrowLeft" || k === "PageUp") onPrev();
        else if (k === "ArrowRight" || k === "PageDown") onNext();
        else if (k === "+" || k === "=") zoomAt(1.25);
        else if (k === "-") zoomAt(0.8);
        else if (k === "0" || k === "f" || k === "F") setView(fitView(paper));
        else return;
        e.preventDefault();
      }}
    >
      <div
        className={clsx(
          "absolute bg-white shadow-xl ring-1 ring-black/50",
          dim && "opacity-40 grayscale",
        )}
        style={{ left, top, width: paper.width * scale, height: paper.height * scale }}
      >
        <div ref={holder} className="h-full w-full" />
      </div>
      {dim && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded bg-neutral-900/90 px-2 py-1 text-[11px] text-neutral-200 ring-1 ring-neutral-700">
            Página omitida: não vai para o PDF
          </span>
        </div>
      )}
    </div>
  );
}
