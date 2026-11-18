import {
  median,
  monthStartOf,
  weekStartOf,
} from "@rlpapp/shared/compras/priceReference";
import { formatCurrency } from "@rlpapp/shared";

export type ChartShape = "circle" | "square" | "diamond" | "triangle";

export type ChartSeries = {
  key: string;
  label: string;
  shape: ChartShape;
  /** Uma cor da rampa `--chart-*` (a forma e o rótulo distinguem as séries). */
  color: string;
  dimmed: boolean;
  quotes: { occurredAt: number; unitPriceCents: number; bought?: boolean }[];
};

const W = 960;
const H = 340;
const LEFT = 72;
const RIGHT = 120;
const TOP = 20;
const BOTTOM = 300;

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

function Marker({ shape, x, y, color }: { shape: ChartShape; x: number; y: number; color: string }) {
  const common = { stroke: "var(--card)", strokeWidth: 1.5 };
  switch (shape) {
    case "circle":
      return <circle cx={x} cy={y} r={4.5} fill={color} {...common} />;
    case "square":
      return <rect x={x - 4} y={y - 4} width={8} height={8} fill={color} {...common} />;
    case "diamond":
      return (
        <polygon
          points={`${x},${y - 5.5} ${x + 5.5},${y} ${x},${y + 5.5} ${x - 5.5},${y}`}
          fill="var(--card)"
          stroke={color}
          strokeWidth={2}
        />
      );
    case "triangle":
      return <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} fill={color} {...common} />;
  }
}

/**
 * Cotações no tempo, uma série por variante. Pontos da mesma semana (outros
 * fornecedores) ficam empilhados e ligados por um traço; a linha passa pela
 * mediana de cada semana. A faixa marca ±5% da referência.
 */
export function PriceHistoryChart({
  series,
  from,
  now,
  referenceCents,
}: {
  series: ChartSeries[];
  from: number;
  now: number;
  referenceCents: number | null;
}) {
  const prices = series.flatMap((s) => s.quotes.map((q) => q.unitPriceCents));
  if (prices.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma cotação no período.</p>;
  }
  const extra = referenceCents ? [referenceCents * 0.95, referenceCents * 1.05] : [];
  const rawMin = Math.min(...prices, ...extra);
  const rawMax = Math.max(...prices, ...extra);
  const pad = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.02);
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const x = (at: number) => LEFT + ((at - from) / Math.max(now - from, 1)) * (W - LEFT - RIGHT);
  const y = (cents: number) => BOTTOM - ((cents - yMin) / (yMax - yMin)) * (BOTTOM - TOP);

  const months: { at: number; label: string }[] = [];
  for (let at = monthStartOf(from); at <= now; ) {
    const date = new Date(at + 12 * 3600 * 1000);
    if (at >= from) months.push({ at, label: MONTHS[date.getUTCMonth()]! });
    at = monthStartOf(at + 32 * 24 * 3600 * 1000);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label="Preço de cada cotação no tempo, uma linha por variante passando pela mediana de cada semana"
    >
      {referenceCents ? (
        <>
          <rect
            x={LEFT}
            width={W - LEFT - RIGHT}
            y={y(referenceCents * 1.05)}
            height={y(referenceCents * 0.95) - y(referenceCents * 1.05)}
            fill="var(--chart-1)"
            opacity={0.25}
          />
          <line
            x1={LEFT}
            x2={W - RIGHT}
            y1={y(referenceCents)}
            y2={y(referenceCents)}
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text
            x={LEFT + 4}
            y={y(referenceCents) - 6}
            className="fill-foreground text-[11px] font-semibold"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            Referência {formatCurrency(Math.round(referenceCents))}
          </text>
        </>
      ) : null}
      {niceTicks(yMin, yMax).map((tick) => (
        <g key={tick}>
          <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
          <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {formatCurrency(tick).replace(",00", "")}
          </text>
        </g>
      ))}
      <line x1={LEFT} x2={W - RIGHT} y1={BOTTOM} y2={BOTTOM} stroke="var(--muted-foreground)" opacity={0.5} />
      {months.map((month) => (
        <text key={month.at} x={x(month.at) + 4} y={BOTTOM + 18} className="fill-muted-foreground text-[11px]">
          {month.label}
        </text>
      ))}

      {series.map((s) => {
        const weeks = new Map<number, number[]>();
        for (const quote of s.quotes) {
          const week = weekStartOf(quote.occurredAt);
          weeks.set(week, [...(weeks.get(week) ?? []), quote.unitPriceCents]);
        }
        const ordered = [...weeks.entries()].sort(([a], [b]) => a - b);
        const last = ordered[ordered.length - 1];
        return (
          <g key={s.key} opacity={s.dimmed ? 0.15 : 1}>
            <polyline
              points={ordered.map(([week, ps]) => `${x(week + 3.5 * 86400000)},${y(median(ps)!)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.5}
              strokeDasharray={s.shape === "diamond" ? "4 3" : undefined}
            />
            {ordered.map(([week, ps]) =>
              ps.length > 1 ? (
                <line
                  key={week}
                  x1={x(week + 3.5 * 86400000)}
                  x2={x(week + 3.5 * 86400000)}
                  y1={y(Math.max(...ps))}
                  y2={y(Math.min(...ps))}
                  stroke={s.color}
                  strokeWidth={1.5}
                />
              ) : null
            )}
            {s.quotes.map((quote, index) => {
              const cx = x(weekStartOf(quote.occurredAt) + 3.5 * 86400000);
              const cy = y(quote.unitPriceCents);
              return (
                <g key={index}>
                  <Marker shape={s.shape} x={cx} y={cy} color={s.color} />
                  {quote.bought ? (
                    <circle cx={cx} cy={cy} r={8.5} fill="none" stroke="var(--status-success)" strokeWidth={2} />
                  ) : null}
                </g>
              );
            })}
            {last ? (
              <text
                x={x(last[0] + 3.5 * 86400000) + 12}
                y={y(median(last[1])!) + 4}
                className="text-[12px] font-semibold"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {s.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
