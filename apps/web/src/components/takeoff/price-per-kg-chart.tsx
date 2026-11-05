import { useEffect, useRef, useState } from "react";

import { PriceChangeBadge } from "@/components/compras/price-change-badge";
import {
  niceTicks,
  type PricePoint,
  priceAt,
  priceSteps,
  priceSummary,
  pointsFor,
  timeDomain,
} from "@/lib/takeoff/price-history";
import { cn } from "@/lib/utils";

/**
 * Variação do preço por kg publicado de um ou mais insumos (cobre nas duas faixas, chapa): um
 * degrau por publicação, vigente até a seguinte e a última até hoje. Um eixo só, em R$/kg.
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
const dateShort = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });

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
  const [showTable, setShowTable] = useState(false);

  if (history === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando histórico…</p>;
  }
  const lines = series.map((s) => ({ ...s, points: pointsFor(history, s.material) }));
  const all = lines.flatMap((l) => l.points);
  if (all.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-control-border px-4 py-6 text-center text-sm text-muted-foreground">
        Sem histórico ainda. Cada publicação que muda o preço vira um ponto deste gráfico.
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
      <div className={cn("grid gap-2", lines.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        {lines.map((l) => (
          <SeriesSummary key={l.material} label={l.label} colorClass={l.colorClass} points={l.points} now={now} />
        ))}
      </div>

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {lines.length > 1 &&
          lines.map((l) => (
            <span key={l.material} className="flex items-center gap-1.5">
              <span className={cn("h-0.5 w-4 rounded-full bg-current", l.colorClass)} aria-hidden />
              {l.label}
            </span>
          ))}
        <span className="flex-1" />
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Esconder publicações" : "Ver publicações"}
        </button>
      </div>

      {showTable && (
        <div className="overflow-x-auto rounded-md border border-control-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Data</th>
                <th className="px-3 py-1.5 text-left font-medium">Insumo</th>
                <th className="px-3 py-1.5 text-right font-medium">R$/kg</th>
                <th className="px-3 py-1.5 text-left font-medium">Por</th>
              </tr>
            </thead>
            <tbody>
              {[...all]
                .sort((a, b) => b.recordedAt - a.recordedAt)
                .map((p) => (
                  <tr key={`${p.material}-${p.recordedAt}`} className="border-t border-control-border">
                    <td className="px-3 py-1.5 tabular-nums">{dateShort.format(p.recordedAt)}</td>
                    <td className="px-3 py-1.5">{series.find((s) => s.material === p.material)?.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {p.price === null ? "padrão do fornecedor" : brl.format(p.price)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{p.recordedBy ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SeriesSummary({
  label,
  colorClass,
  points,
  now,
}: {
  label: string;
  colorClass: string;
  points: PricePoint[];
  now: number;
}) {
  const summary = priceSummary(points, now);
  return (
    <div className="space-y-1 rounded-md border border-control-border bg-muted/30 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={cn("size-2 rounded-full bg-current", colorClass)} aria-hidden />
        {label}
      </p>
      {summary.current ? (
        <>
          <p className="text-lg font-semibold tabular-nums">
            {brl.format(summary.current.price)}
            <span className="text-xs font-normal text-muted-foreground">/kg desde {dateShort.format(summary.current.since)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {summary.vsPrevious ? (
              <span className="flex items-center gap-1">
                <PriceChangeBadge change={summary.vsPrevious} basis="preço publicado antes" />
                vs. anterior
              </span>
            ) : (
              <span>primeiro preço publicado</span>
            )}
            {summary.vs12Months && (
              <span className="flex items-center gap-1">
                <PriceChangeBadge change={summary.vs12Months} basis="preço de 12 meses atrás" />
                em 12 meses
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sem preço publicado: o app usa o padrão do fornecedor.</p>
      )}
    </div>
  );
}
