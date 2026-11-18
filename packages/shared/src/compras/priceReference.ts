/**
 * Preço de referência e comparação de fornecedores a partir das cotações de um
 * equipamento. Usado pelo backend (catálogo do takeoff, histórico por família),
 * pelo dashboard e pelo app desktop, para que todos calculem igual.
 *
 * Regras (combinadas com o time de orçamentos):
 * - a referência é a mediana das cotações dos últimos 6 meses;
 * - cotações da mesma semana (segunda a domingo, horário de Brasília) contam
 *   como a mesma rodada, mesmo em dias diferentes;
 * - até 10% de dispersão o preço serve para orçar sem cotar de novo; acima
 *   disso, ou sem cotação há mais de 90 dias, o orçamento avisa.
 */

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Brasília sem horário de verão (desde 2019): UTC-3 o ano todo. */
const BRT_OFFSET_MS = -3 * HOUR_MS;
const AVERAGE_MONTH_MS = 30.44 * DAY_MS;

export const REFERENCE_WINDOW_DAYS = 183;
export const SPREAD_TOLERANCE = 0.1;
export const STALE_AFTER_DAYS = 90;

export type PeriodGrouping = "week" | "month";

/** Início (segunda, 00:00 em Brasília) da semana que contém `at`, em ms UTC. */
export function weekStartOf(at: number): number {
  const local = at + BRT_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const weekday = (new Date(dayStart).getUTCDay() + 6) % 7; // segunda = 0
  return dayStart - weekday * DAY_MS - BRT_OFFSET_MS;
}

/** Início (dia 1, 00:00 em Brasília) do mês que contém `at`, em ms UTC. */
export function monthStartOf(at: number): number {
  const local = new Date(at + BRT_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BRT_OFFSET_MS;
}

export function periodStartOf(at: number, grouping: PeriodGrouping): number {
  return grouping === "week" ? weekStartOf(at) : monthStartOf(at);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** O mínimo que o cálculo precisa de cada cotação. */
export interface QuoteSample {
  unitPriceCents: number;
  occurredAt: number;
  /** Identifica o fornecedor (id ou nome normalizado). */
  supplierKey: string;
  supplierName: string;
}

export type ReferenceStatus = "ok" | "wide" | "stale";

export interface ReferenceStats {
  /** Mediana das cotações da janela: o preço para orçar. */
  medianCents: number;
  minCents: number;
  maxCents: number;
  count: number;
  supplierCount: number;
  /** (máximo − mínimo) / mediana; 0 com uma cotação só. */
  spread: number;
  firstAt: number;
  lastAt: number;
  /** Variação entre a mediana da primeira e a da última semana cotadas. */
  totalChange: number | null;
  /** `totalChange` dividido pelos meses entre elas; null com menos de meio mês. */
  monthlyChange: number | null;
  /** ok; wide = dispersão acima da tolerância; stale = última cotação antiga. */
  status: ReferenceStatus;
}

export interface ReferenceOptions {
  windowDays?: number;
  tolerance?: number;
  staleAfterDays?: number;
}

/** Cotações agrupadas por período, mais antigas primeiro. */
function groupByPeriod<T extends QuoteSample>(
  quotes: readonly T[],
  grouping: PeriodGrouping
): { periodStart: number; quotes: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const quote of quotes) {
    const start = periodStartOf(quote.occurredAt, grouping);
    const list = groups.get(start);
    if (list) list.push(quote);
    else groups.set(start, [quote]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([periodStart, list]) => ({ periodStart, quotes: list }));
}

/**
 * Referência de orçamento: mediana, faixa, dispersão e ritmo de variação das
 * cotações dentro da janela (6 meses por padrão). Null sem cotação na janela.
 */
export function referenceStats(
  quotes: readonly QuoteSample[],
  now: number,
  options: ReferenceOptions = {}
): ReferenceStats | null {
  const windowDays = options.windowDays ?? REFERENCE_WINDOW_DAYS;
  const tolerance = options.tolerance ?? SPREAD_TOLERANCE;
  const staleAfterDays = options.staleAfterDays ?? STALE_AFTER_DAYS;
  const from = now - windowDays * DAY_MS;
  const inWindow = quotes.filter(
    (quote) => quote.occurredAt >= from && quote.occurredAt <= now
  );
  if (inWindow.length === 0) return null;

  const prices = inWindow.map((quote) => quote.unitPriceCents);
  const medianCents = median(prices)!;
  const minCents = Math.min(...prices);
  const maxCents = Math.max(...prices);
  const times = inWindow.map((quote) => quote.occurredAt);
  const firstAt = Math.min(...times);
  const lastAt = Math.max(...times);

  let totalChange: number | null = null;
  let monthlyChange: number | null = null;
  const weeks = groupByPeriod(inWindow, "week");
  if (weeks.length >= 2) {
    const first = weeks[0]!;
    const last = weeks[weeks.length - 1]!;
    const firstMedian = median(first.quotes.map((q) => q.unitPriceCents))!;
    const lastMedian = median(last.quotes.map((q) => q.unitPriceCents))!;
    if (firstMedian > 0) {
      totalChange = (lastMedian - firstMedian) / firstMedian;
      const months = (last.periodStart - first.periodStart) / AVERAGE_MONTH_MS;
      monthlyChange = months >= 0.5 ? totalChange / months : null;
    }
  }

  const spread = medianCents > 0 ? (maxCents - minCents) / medianCents : 0;
  const status: ReferenceStatus =
    now - lastAt > staleAfterDays * DAY_MS
      ? "stale"
      : spread > tolerance
        ? "wide"
        : "ok";

  return {
    medianCents,
    minCents,
    maxCents,
    count: inWindow.length,
    supplierCount: new Set(inWindow.map((quote) => quote.supplierKey)).size,
    spread,
    firstAt,
    lastAt,
    totalChange,
    monthlyChange,
    status,
  };
}

export interface PeriodComparison<T extends QuoteSample = QuoteSample> {
  periodStart: number;
  /** Uma cotação por fornecedor (a mais recente dele no período), da mais barata à mais cara. */
  quotes: T[];
  minCents: number;
  maxCents: number;
  /** (maior − menor) / menor; null quando só um fornecedor cotou. */
  spread: number | null;
  /** Fornecedor mais barato; null quando só um fornecedor cotou. */
  cheapestSupplierKey: string | null;
}

/**
 * O mesmo item cotado por fornecedores diferentes no mesmo período (semana ou
 * mês): uma linha por período, mais recente primeiro.
 */
export function compareSuppliersByPeriod<T extends QuoteSample>(
  quotes: readonly T[],
  grouping: PeriodGrouping = "week"
): PeriodComparison<T>[] {
  return groupByPeriod(quotes, grouping)
    .reverse()
    .map(({ periodStart, quotes: inPeriod }) => {
      const bySupplier = new Map<string, T>();
      for (const quote of inPeriod) {
        const kept = bySupplier.get(quote.supplierKey);
        if (!kept || quote.occurredAt > kept.occurredAt) {
          bySupplier.set(quote.supplierKey, quote);
        }
      }
      const perSupplier = [...bySupplier.values()].sort(
        (a, b) => a.unitPriceCents - b.unitPriceCents || a.occurredAt - b.occurredAt
      );
      const minCents = perSupplier[0]!.unitPriceCents;
      const maxCents = perSupplier[perSupplier.length - 1]!.unitPriceCents;
      const contested = perSupplier.length > 1;
      return {
        periodStart,
        quotes: perSupplier,
        minCents,
        maxCents,
        spread: contested && minCents > 0 ? (maxCents - minCents) / minCents : null,
        cheapestSupplierKey: contested ? perSupplier[0]!.supplierKey : null,
      };
    });
}

export interface SupplierStanding {
  supplierKey: string;
  supplierName: string;
  quoteCount: number;
  /** Períodos com dois ou mais fornecedores em que este cotou. */
  contested: number;
  /** Desses, em quantos foi o mais barato. */
  wins: number;
  /** Média de (preço − mediana) / mediana: negativo = costuma cotar abaixo. */
  averageVsMedian: number | null;
}

/** Como cada fornecedor se sai contra os outros, do mais barato ao mais caro. */
export function supplierStandings<T extends QuoteSample>(
  quotes: readonly T[],
  medianCents: number | null,
  grouping: PeriodGrouping = "week"
): SupplierStanding[] {
  const standings = new Map<string, SupplierStanding & { deviationSum: number }>();
  const standingOf = (quote: T) => {
    let standing = standings.get(quote.supplierKey);
    if (!standing) {
      standing = {
        supplierKey: quote.supplierKey,
        supplierName: quote.supplierName,
        quoteCount: 0,
        contested: 0,
        wins: 0,
        averageVsMedian: null,
        deviationSum: 0,
      };
      standings.set(quote.supplierKey, standing);
    }
    return standing;
  };

  for (const quote of quotes) {
    const standing = standingOf(quote);
    standing.quoteCount += 1;
    if (medianCents && medianCents > 0) {
      standing.deviationSum += (quote.unitPriceCents - medianCents) / medianCents;
    }
  }
  for (const period of compareSuppliersByPeriod(quotes, grouping)) {
    if (!period.cheapestSupplierKey) continue;
    for (const quote of period.quotes) {
      const standing = standingOf(quote);
      standing.contested += 1;
      if (quote.supplierKey === period.cheapestSupplierKey) standing.wins += 1;
    }
  }

  return [...standings.values()]
    .map(({ deviationSum, ...standing }) => ({
      ...standing,
      averageVsMedian:
        medianCents && medianCents > 0 && standing.quoteCount > 0
          ? deviationSum / standing.quoteCount
          : null,
    }))
    .sort(
      (a, b) =>
        (a.averageVsMedian ?? Number.POSITIVE_INFINITY) -
          (b.averageVsMedian ?? Number.POSITIVE_INFINITY) ||
        a.supplierName.localeCompare(b.supplierName, "pt-BR")
    );
}
