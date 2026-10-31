import clsx from "clsx";
import { AlertTriangle, ArrowRight, Crosshair, X } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  defaultPageMap,
  type PageMap,
  rotationOf,
  type Similarity,
  scaleOf,
  similarityFrom2Points,
  sizeDiffers,
} from "../lib/align";
import { confirmDialog } from "../lib/dialogs";
import type { Pt } from "../lib/geom";
import type { Rendered } from "../lib/pdf/render";
import { snapPoint } from "../lib/pdf/vectors";
import { type PageSize, session } from "../lib/session";
import { formatFixed as fmt } from "../lib/units";
import { type RevisionRequest, useStore } from "../store";
import { Dialog } from "./Dialog";
import { Button } from "./ui";

const mm = (pt: number) => Math.round((pt * 25.4) / 72);
const sizeLabel = (s: PageSize | undefined) => (s ? `${mm(s.w)}×${mm(s.h)} mm` : "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reference points picked for one old page: on the old sheet (a) and on the new one (b). */
interface Picks {
  a: Pt[];
  b: Pt[];
}

/**
 * "Substituir por nova revisão": maps the old PDF's pages to the new one's (1:1 by default, "—"
 * drops a page's markings) and aligns re-plotted pages by two reference points clicked on both
 * sheets. Answers the request `replaceDrawingPdf` left in the store.
 */
export function RevisionDialog() {
  const req = useStore((s) => s.revisionRequest);
  if (!req) return null;
  return <RevisionPanel key={req.newKey} req={req} />;
}

function RevisionPanel({ req }: { req: RevisionRequest }) {
  const [pageMap, setPageMap] = useState<PageMap>(() =>
    defaultPageMap(req.oldSizes.length, req.newSizes.length),
  );
  const [transforms, setTransforms] = useState<(Similarity | null)[]>(() =>
    req.oldSizes.map(() => null),
  );
  const [picks, setPicks] = useState<Record<number, Picks>>({});
  const [aligning, setAligning] = useState<number | null>(null);
  const cancel = () => req.resolve(null);

  const differs = (i: number) => {
    const j = pageMap[i];
    return j !== null && !!req.newSizes[j] && sizeDiffers(req.oldSizes[i], req.newSizes[j]);
  };
  const setTarget = (i: number, j: number | null) => {
    setPageMap((m) => m.map((x, k) => (k === i ? j : x)));
    setTransforms((t) => t.map((x, k) => (k === i ? null : x)));
    setPicks(({ [i]: _, ...rest }) => rest);
  };
  const unmappedNew = req.newSizes.map((_, j) => j).filter((j) => !pageMap.includes(j));

  const submit = async () => {
    const dropped = pageMap.reduce<number>((n, j, i) => (j === null ? n + req.counts[i] : n), 0);
    if (
      dropped > 0 &&
      !(await confirmDialog(
        `${plural(dropped, "marcação ou local", "marcações e locais")} das páginas sem correspondência (—) serão apagados. Continuar?`,
      ))
    ) {
      return;
    }
    const unaligned = pageMap.filter((_, i) => differs(i) && !transforms[i] && req.counts[i] > 0);
    if (
      unaligned.length > 0 &&
      !(await confirmDialog(
        `${unaligned.length === 1 ? "1 página mudou de tamanho e não foi alinhada" : `${unaligned.length} páginas mudaram de tamanho e não foram alinhadas`}: as marcações ficam nas mesmas coordenadas do papel. Substituir mesmo assim?`,
      ))
    ) {
      return;
    }
    req.resolve({ pageMap, transforms });
  };

  if (aligning !== null) {
    const j = pageMap[aligning];
    if (j !== null) {
      return (
        <AlignPanel
          req={req}
          oldPage={aligning}
          newPage={j}
          initial={picks[aligning] ?? { a: [], b: [] }}
          onBack={() => setAligning(null)}
          onApply={(t, p) => {
            setTransforms((ts) => ts.map((x, k) => (k === aligning ? t : x)));
            setPicks((ps) => ({ ...ps, [aligning]: p }));
            setAligning(null);
          }}
        />
      );
    }
  }

  return (
    <Dialog
      title={`Substituir ${req.oldName} por nova revisão`}
      onClose={cancel}
      className="w-[44rem]"
      bodyClassName="overflow-y-auto p-4"
    >
      <p className="mb-3 text-xs text-neutral-400">
        As marcações e locais de cada página de{" "}
        <span className="text-neutral-200">{req.oldName}</span> passam para a página escolhida de{" "}
        <span className="text-neutral-200">{req.newName}</span>. Se a folha foi replotada em outro
        tamanho ou posição, alinhe-a por dois pontos de referência.
      </p>
      {req.oldSizes.length !== req.newSizes.length && (
        <div className="mb-3 flex items-start gap-2 rounded bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300 ring-1 ring-amber-500/40">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            O PDF anterior tem {plural(req.oldSizes.length, "página", "páginas")} e o novo tem{" "}
            {plural(req.newSizes.length, "página", "páginas")}. Confira a correspondência abaixo.
          </span>
        </div>
      )}
      <table className="w-full text-xs">
        <thead className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="pb-1.5 font-medium">Anterior</th>
            <th />
            <th className="pb-1.5 font-medium">Nova revisão</th>
            <th className="pb-1.5 font-medium">Alinhamento</th>
          </tr>
        </thead>
        <tbody>
          {req.oldSizes.map((size, i) => {
            const j = pageMap[i];
            const t = transforms[i];
            const n = req.counts[i];
            return (
              <tr key={i} className="border-t border-neutral-800">
                <td className="py-1.5 pr-2">
                  <div className="text-neutral-200">Página {i + 1}</div>
                  <div className="whitespace-nowrap text-[11px] text-neutral-500">
                    {sizeLabel(size)} · {plural(n, "marcação", "marcações")}
                  </div>
                </td>
                <td className="px-1 text-neutral-600">
                  <ArrowRight size={14} />
                </td>
                <td className="min-w-[12rem] py-1.5 pr-2">
                  <select
                    value={j === null ? "" : String(j)}
                    onChange={(e) =>
                      setTarget(i, e.target.value === "" ? null : Number(e.target.value))
                    }
                    aria-label={`Página da nova revisão para a página ${i + 1}`}
                    className="h-8 w-full rounded bg-neutral-800 px-1.5 text-xs ring-1 ring-neutral-700"
                  >
                    <option value="">— descartar marcações</option>
                    {req.newSizes.map((s, k) => (
                      <option key={k} value={k}>
                        Página {k + 1} · {sizeLabel(s)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5">
                  {j === null ? (
                    <span className={n > 0 ? "text-red-300" : "text-neutral-500"}>
                      {n > 0 ? `${plural(n, "será apagada", "serão apagadas")}` : "—"}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {t ? (
                        <span className="text-emerald-700" title="Escala e rotação aplicadas">
                          ×{fmt(scaleOf(t), 3)} · {fmt((rotationOf(t) * 180) / Math.PI, 1)}°
                        </span>
                      ) : differs(i) ? (
                        <span className="text-amber-300">tamanho difere</span>
                      ) : (
                        <span className="text-neutral-500">mesma posição</span>
                      )}
                      {t ? (
                        <>
                          <Button
                            className="ml-auto"
                            title="Refazer o alinhamento"
                            aria-label={`Refazer o alinhamento da página ${i + 1}`}
                            onClick={() => setAligning(i)}
                          >
                            <Crosshair size={14} className="shrink-0" />
                          </Button>
                          <Button
                            title="Limpar o alinhamento (voltar à mesma posição)"
                            aria-label={`Limpar o alinhamento da página ${i + 1}`}
                            onClick={() =>
                              setTransforms((ts) => ts.map((x, k) => (k === i ? null : x)))
                            }
                          >
                            <X size={14} className="shrink-0" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          className={clsx(
                            "ml-auto h-7 px-2 text-xs",
                            differs(i) && "text-amber-300",
                          )}
                          onClick={() => setAligning(i)}
                        >
                          Alinhar…
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unmappedNew.length > 0 && (
        <p className="mt-3 text-[11px] text-neutral-500">
          {unmappedNew.length === 1 ? "Página nova" : "Páginas novas"} sem marcações:{" "}
          {unmappedNew.map((j) => j + 1).join(", ")} (escala a definir).
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={cancel}>Cancelar</Button>
        <Button variant="primary" onClick={() => void submit()}>
          Substituir
        </Button>
      </div>
    </Dialog>
  );
}

function AlignPanel({
  req,
  oldPage,
  newPage,
  initial,
  onBack,
  onApply,
}: {
  req: RevisionRequest;
  oldPage: number;
  newPage: number;
  initial: Picks;
  onBack: () => void;
  onApply: (t: Similarity, picks: Picks) => void;
}) {
  const [a, setA] = useState<Pt[]>(initial.a);
  const [b, setB] = useState<Pt[]>(initial.b);
  const t = a.length === 2 && b.length === 2 ? similarityFrom2Points(a[0], a[1], b[0], b[1]) : null;
  return (
    <Dialog
      title={`Alinhar página ${oldPage + 1} → ${newPage + 1}`}
      onClose={onBack}
      className="w-[64rem]"
      bodyClassName="overflow-y-auto p-4"
    >
      <p className="mb-3 text-xs text-neutral-400">
        Clique os mesmos dois pontos de referência (ex.: dois cruzamentos de eixos, bem afastados)
        na planta anterior e na nova, na mesma ordem. Roda do mouse aproxima, arraste para mover; o
        snap encaixa nos traços do desenho. Um terceiro clique corrige o ponto mais próximo.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <PickPane
          label={`Anterior · ${req.oldName} · pág. ${oldPage + 1}`}
          docKey={req.oldKey}
          page={oldPage}
          size={req.oldSizes[oldPage]}
          points={a}
          onChange={setA}
          color="#f87171"
        />
        <PickPane
          label={`Nova · ${req.newName} · pág. ${newPage + 1}`}
          docKey={req.newKey}
          page={newPage}
          size={req.newSizes[newPage]}
          points={b}
          onChange={setB}
          color="#60a5fa"
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-neutral-400">
          {t
            ? `Escala ×${fmt(scaleOf(t), 4)} · rotação ${fmt((rotationOf(t) * 180) / Math.PI, 2)}° · deslocamento ${fmt(t.tx, 1)}, ${fmt(t.ty, 1)} pt`
            : a.length === 2 && b.length === 2
              ? "Os dois pontos de uma planta não podem coincidir."
              : `Pontos: ${a.length}/2 na anterior, ${b.length}/2 na nova.`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            onClick={() => {
              setA([]);
              setB([]);
            }}
          >
            Limpar pontos
          </Button>
          <Button onClick={onBack}>Voltar</Button>
          <Button variant="primary" disabled={!t} onClick={() => t && onApply(t, { a, b })}>
            Aplicar alinhamento
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Screen pixels the pointer may travel and still count as a click, not a pan. */
const CLICK_PX = 4;
/** Snap radius, screen pixels. */
const SNAP_PX = 10;

interface PaneView {
  x: number;
  y: number;
  zoom: number;
}

/**
 * One sheet of the alignment step: the page's base render with its own pan and zoom, where
 * clicks place up to two numbered reference points (snapped to the drawing's lines when the
 * snap toggle is on and the page's vector index is ready).
 */
function PickPane({
  label,
  docKey,
  page,
  size,
  points,
  onChange,
  color,
}: {
  label: string;
  docKey: string;
  page: number;
  size: PageSize;
  points: Pt[];
  onChange: (points: Pt[]) => void;
  color: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({
    src: null as Rendered | null,
    hiAsked: false,
    view: { x: 0, y: 0, zoom: 1 } as PaneView,
    w: 0,
    h: 0,
    fitted: false,
    press: null as { x: number; y: number; vx: number; vy: number; moved: boolean } | null,
    hover: null as Pt | null,
  });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const snap = useStore((s) => s.snap);

  const toPagePt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current?.getBoundingClientRect();
    const v = st.current.view;
    return {
      x: (e.clientX - (r?.left ?? 0) - v.x) / v.zoom,
      y: (e.clientY - (r?.top ?? 0) - v.y) / v.zoom,
    };
  };
  const snapped = (raw: Pt): { pt: Pt; hit: boolean } => {
    const idx = snap ? session.openDoc(docKey)?.vectors.get(page) : undefined;
    const hit = idx ? snapPoint(idx, raw, SNAP_PX / st.current.view.zoom) : null;
    return hit ? { pt: { x: hit.x, y: hit.y }, hit: true } : { pt: raw, hit: false };
  };

  // redrawn from refs and the latest props: every render refreshes the closure
  const draw = useRef(() => {});
  draw.current = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    const s = st.current;
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const v = s.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#eef3f9";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (s.src) {
      ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.x, dpr * v.y);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.drawImage(s.src.canvas, 0, 0, size.w, size.h);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2;
    ctx.font = "bold 12px system-ui, sans-serif";
    points.forEach((p, k) => {
      const x = p.x * v.zoom + v.x;
      const y = p.y * v.zoom + v.y;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 8, y - 22, 14, 15);
      ctx.fillStyle = color;
      ctx.fillText(String(k + 1), x + 11, y - 10);
    });
    if (s.hover) {
      const x = s.hover.x * v.zoom + v.x;
      const y = s.hover.y * v.zoom + v.y;
      ctx.strokeStyle = "#fb923c";
      ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
  };

  const fitView = () => {
    const s = st.current;
    if (!s.w || !s.h) return;
    const zoom = Math.min(s.w / size.w, s.h / size.h) * 0.96;
    s.view = { zoom, x: (s.w - size.w * zoom) / 2, y: (s.h - size.h * zoom) / 2 };
    s.fitted = true;
  };

  /** Swap in the mid-resolution render once the view zooms past the base render. */
  const maybeHi = () => {
    const s = st.current;
    const dpr = window.devicePixelRatio || 1;
    if (!s.src || s.hiAsked || s.view.zoom * dpr <= s.src.scale * 1.25) return;
    s.hiAsked = true;
    const entry = session.openDoc(docKey);
    void entry?.renderer
      .renderHi(page)
      .then((hi) => {
        s.src = hi;
        draw.current();
      })
      .catch(() => {});
  };

  useEffect(() => {
    const entry = session.openDoc(docKey);
    if (!entry) {
      setState("error");
      return;
    }
    let alive = true;
    entry.renderer
      .renderBase(page)
      .then((r) => {
        if (!alive) return;
        st.current.src = r;
        setState("ready");
        draw.current();
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [docKey, page]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fit and draw read refs and props
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const s = st.current;
      s.w = r.width;
      s.h = r.height;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      if (!s.fitted) fitView();
      draw.current();
    });
    ro.observe(wrap);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const s = st.current;
      const f = Math.exp(-Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.22);
      const zoom = Math.min(Math.max(s.view.zoom * f, 0.02), 40);
      const k = zoom / s.view.zoom;
      s.view = { zoom, x: sx - (sx - s.view.x) * k, y: sy - (sy - s.view.y) * k };
      maybeHi();
      draw.current();
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      cv.removeEventListener("wheel", onWheel);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: repaint when the points change
  useEffect(() => draw.current(), [points]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const v = st.current.view;
    st.current.press = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = st.current;
    const p = s.press;
    if (p) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (p.moved || Math.hypot(dx, dy) > CLICK_PX) {
        p.moved = true;
        s.view = { ...s.view, x: p.vx + dx, y: p.vy + dy };
        s.hover = null;
        draw.current();
      }
      return;
    }
    const hit = snapped(toPagePt(e));
    s.hover = hit.hit ? hit.pt : null;
    draw.current();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = st.current.press;
    st.current.press = null;
    if (!p || p.moved || e.button !== 0) return;
    const { pt } = snapped(toPagePt(e));
    if (points.length < 2) {
      onChange([...points, pt]);
      return;
    }
    // both placed: the click corrects the nearer one
    const d = points.map((q) => Math.hypot(q.x - pt.x, q.y - pt.y));
    onChange(points.map((q, k) => (k === (d[0] <= d[1] ? 0 : 1) ? pt : q)));
  };

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate text-neutral-300" title={label}>
          {label}
        </span>
        <span className="ml-auto shrink-0 font-mono text-neutral-500">{points.length}/2</span>
      </div>
      <div
        ref={wrapRef}
        className="relative h-[24rem] overflow-hidden rounded ring-1 ring-neutral-700"
      >
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            st.current.press = null;
          }}
          onPointerLeave={() => {
            st.current.hover = null;
            draw.current();
          }}
          onDoubleClick={() => {
            fitView();
            draw.current();
          }}
        />
        {state !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
            {state === "loading" ? "Renderizando…" : "PDF indisponível"}
          </div>
        )}
      </div>
    </div>
  );
}
