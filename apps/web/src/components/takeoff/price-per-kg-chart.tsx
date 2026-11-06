import { useEffect, useRef, useState } from "react";

import {
  niceTicks,
  type PricePoint,
  priceAt,
  priceSteps,
  pointsFor,
  timeDomain,
} from "@/lib/takeoff/price-history";
import { cn } from "@/lib/utils";

/**
 * Variação do preço por kg de um ou mais insumos (cobre nas duas faixas, chapa): um degrau por
 * registro, vigente até o seguinte e o último até hoje. Um eixo só, em R$/kg.
 */

export type PriceSeries = {
  material: string;
  label: string;
  /** Classe de cor do texto (o traço usa currentColor): slots categóricos em ordem fixa. */
  colorClass: string;
};

/** Slots categóricos 1 e 2 da paleta validada (azul, laranja), com o passo do modo escuro. */
export const SERIES_COLORS = [
  "text-[#2a78d6] dark:text-[#3987e5]",
  "text-[#eb6834] dark:text-[#d95926]",
] as const;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlAxis = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
// prices are dated in Brasília: read the axis and tooltip there too
const dateShort = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "America/Sao_Paulo" });

const HEIGHT = 200;
const M = { top: 12, right: 16, bottom: 26, left: 64 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function PricePerKgChart(props: {
  series: readonly PriceSeries[];
  history: readonly PricePoint[] | undefined;
}) {
  // the width is measured on a box that exists from the first render (also while loading)
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref}>
      <ChartBody {...props} width={width} />
    </div>
  );
}

function ChartBody({
  series,
  history,
  width,
}: {
  series: readonly PriceSeries[];
  history: readonly PricePoint[] | undefined;
  width: number;
}) {
  const [now] = useState(() => Date.now());
  const [hoverAt, setHoverAt] = useState<number | null>(null);

  if (history === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  }
  const lines = series.map((s) => ({ ...s, points: pointsFor(history, s.material) }));
  const all = lines.flatMap((l) => l.points);
  if (all.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-control-border px-4 py-6 text-center text-sm text-muted-foreground">
        Sem registros ainda. Cada preço registrado com a sua data vira um ponto deste gráfico.
      </p>
    );
  }

  const [t0, t1] = timeDomain(all, now);
  const prices = all.flatMap((p) => (p.price === null ? [] : [p.price]));
  const ticks = niceTicks(Math.min(...prices), Math.max(...prices));
  const y0 = ticks[0] ?? 0;
  const y1 = ticks.at(-1) ?? 1;
  const plotW = Math.max(width - M.left - M.right, 1);
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - t0) / Math.max(t1 - t0, 1)) * plotW;
  const y = (p: number) => M.top + (1 - (p - y0) / Math.max(y1 - y0, 1e-9)) * plotH;
  const timeTicks = [t0, t0 + (t1 - t0) / 2, t1];

  const pathOf = (points: PricePoint[]) => {
    let d = "";
    let open = false;
    for (const step of priceSteps(points, now)) {
      if (step.price === null) {
        open = false;
        continue;
      }
      const sy = y(step.price).toFixed(1);
      d += open ? ` V${sy}` : ` M${x(step.from).toFixed(1)},${sy}`;
      d += ` H${x(step.to).toFixed(1)}`;
      open = true;
    }
    return d.trim();
  };

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setHoverAt(t0 + ratio * (t1 - t0));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Preço por kg de ${series.map((s) => s.label).join(" e ")} ao longo do tempo`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-control-border" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {(y1 - y0 >= 10 ? brlAxis : brl).format(t)}
                </text>
              </g>
            ))}
            {timeTicks.map((t, i) => (
              <text
                key={t}
                x={x(t)}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === timeTicks.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px]"
              >
                {i === timeTicks.length - 1 ? "hoje" : monthYear.format(t)}
              </text>
            ))}
            {lines.map((l) => (
              <g key={l.material} className={l.colorClass}>
                <path d={pathOf(l.points)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                {l.points.map((p) =>
                  p.price === null ? null : (
                    <circle key={p.recordedAt} cx={x(p.recordedAt)} cy={y(p.price)} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} />
                  ),
                )}
              </g>
            ))}
            {hoverAt !== null && (
              <line x1={x(hoverAt)} x2={x(hoverAt)} y1={M.top} y2={M.top + plotH} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <rect
              x={M.left}
              y={M.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHoverAt(null)}
            />
          </svg>
        )}
        {hoverAt !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border border-control-border bg-popover px-3 py-2 text-xs shadow-md"
            style={x(hoverAt) > width / 2 ? { right: width - x(hoverAt) + 12 } : { left: x(hoverAt) + 12 }}
          >
            <p className="mb-1 font-medium">{dateShort.format(hoverAt)}</p>
            {lines.map((l) => {
              const value = priceAt(l.points, hoverAt);
              return (
                <p key={l.material} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn("size-2 rounded-full bg-current", l.colorClass)} aria-hidden />
                    {l.label}
                  </span>
                  <span className="tabular-nums">{typeof value === "number" ? `${brl.format(value)}/kg` : "—"}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {lines.map((l) => {
          const current = priceAt(l.points, now);
          return (
            <span key={l.material} className="flex items-center gap-1.5">
              <span className={cn("h-0.5 w-4 rounded-full bg-current", l.colorClass)} aria-hidden />
              <span className="text-muted-foreground">{l.label}:</span>
              <span className="font-medium tabular-nums">
                {typeof current === "number" ? `${brl.format(current)}/kg` : "sem preço"}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
