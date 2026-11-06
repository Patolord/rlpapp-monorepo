/**
 * Registros de preço por kg de App Takeoff (`takeoffSettings.priceHistory`): cada ponto é um
 * preço com a data em que passou a valer, até o seguinte. Daqui saem os degraus do gráfico.
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
