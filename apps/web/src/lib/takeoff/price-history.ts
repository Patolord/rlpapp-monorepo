import type { PriceChange } from "@/components/compras/price-change-badge";

/**
 * Histórico dos preços por kg publicados em App Takeoff (`takeoffSettings.priceHistory`): cada
 * ponto é uma publicação que mudou o preço de um insumo e vale até a seguinte. Daqui saem os
 * degraus do gráfico e as variações dos resumos.
 */

export type PricePoint = {
  material: string;
  /** R$/kg; null = preço apagado (o app volta ao padrão do fornecedor). */
  price: number | null;
  recordedAt: number;
  recordedBy: string | null;
};

/** Trecho em que um preço vigorou: de `from` até `to` (exclusivo). */
export type PriceStep = { from: number; to: number; price: number | null };

const DAY = 24 * 60 * 60 * 1000;

/** Pontos de um insumo, em ordem cronológica. */
export function pointsFor(history: readonly PricePoint[], material: string): PricePoint[] {
  return history
    .filter((p) => p.material === material)
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

/** Degraus de um insumo até `now`; o último vigora até hoje. */
export function priceSteps(points: readonly PricePoint[], now: number): PriceStep[] {
  return points.map((p, i) => ({
    from: p.recordedAt,
    to: Math.max(points[i + 1]?.recordedAt ?? now, p.recordedAt),
    price: p.price,
  }));
}

/** Preço em vigor no instante `at`; undefined antes do primeiro ponto. */
export function priceAt(points: readonly PricePoint[], at: number): number | null | undefined {
  let current: number | null | undefined;
  for (const p of points) {
    if (p.recordedAt > at) break;
    current = p.price;
  }
  return current;
}

/** Variação de `from` (vigente desde `fromAt`) até `to`, em centavos e em %. */
export const priceChange = (from: number, fromAt: number, to: number): PriceChange => {
  const fromCents = Math.round(from * 100);
  const deltaCents = Math.round(to * 100) - fromCents;
  return {
    deltaCents,
    deltaPercent: fromCents === 0 ? null : (deltaCents / fromCents) * 100,
    fromCents,
    fromAt,
  };
};

export type PriceSummary = {
  current: { price: number; since: number } | null;
  /** Contra o último preço diferente publicado antes do atual. */
  vsPrevious: PriceChange | null;
  /** Contra o preço em vigor 12 meses antes de `now` (se o histórico chega lá). */
  vs12Months: PriceChange | null;
  min: number | null;
  max: number | null;
};

export function priceSummary(points: readonly PricePoint[], now: number): PriceSummary {
  const last = points.at(-1);
  const prices = points.flatMap((p) => (p.price === null ? [] : [p.price]));
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  if (!last || last.price === null) {
    return { current: null, vsPrevious: null, vs12Months: null, min, max };
  }
  const previous = points
    .slice(0, -1)
    .reverse()
    .find((p) => p.price !== null && p.price !== last.price);
  const yearAgoAt = now - 365 * DAY;
  const yearAgo = priceAt(points, yearAgoAt);
  return {
    current: { price: last.price, since: last.recordedAt },
    vsPrevious: previous?.price != null ? priceChange(previous.price, previous.recordedAt, last.price) : null,
    vs12Months: typeof yearAgo === "number" ? priceChange(yearAgo, yearAgoAt, last.price) : null,
    min,
    max,
  };
}

/** Janela do eixo X: do primeiro ponto até hoje, com pelo menos 30 dias. */
export function timeDomain(points: readonly PricePoint[], now: number): [number, number] {
  const first = points.reduce((min, p) => Math.min(min, p.recordedAt), now);
  return [Math.min(first, now - 30 * DAY), now];
}

/** Até `count` marcas "redondas" para o eixo Y cobrindo [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 0.001; t += step) ticks.push(Number(t.toFixed(6)));
  if (ticks.at(-1)! < max) ticks.push(Number((ticks.at(-1)! + step).toFixed(6)));
  return ticks;
}
