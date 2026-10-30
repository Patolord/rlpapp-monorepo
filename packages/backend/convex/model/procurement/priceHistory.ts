import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { normalizeUnit } from "../../lib/compras/catalog";
import { isUsablePriceEvent, pickCurrentPriceEvent } from "./priceSelection";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type PriceHistoryEvent = Pick<
  Doc<"priceEvents">,
  | "_id"
  | "occurredAt"
  | "unitPriceCents"
  | "unit"
  | "supplierId"
  | "supplierNameRaw"
  | "source"
  | "validUntil"
  | "reviewStatus"
  | "needsReview"
>;

/** Variação entre dois preços comparáveis (mesma unidade). */
export type PriceChange = {
  deltaCents: number;
  /** Percentual com uma casa decimal; null quando o preço base é zero. */
  deltaPercent: number | null;
  fromCents: number;
  fromAt: number;
};

export const priceChangeValidator = v.object({
  deltaCents: v.number(),
  deltaPercent: v.union(v.number(), v.null()),
  fromCents: v.number(),
  fromAt: v.number(),
});

export function computePriceChange(
  current: { unitPriceCents: number },
  previous: { unitPriceCents: number; occurredAt: number }
): PriceChange {
  const deltaCents = current.unitPriceCents - previous.unitPriceCents;
  const deltaPercent =
    previous.unitPriceCents === 0
      ? null
      : Math.round((deltaCents / previous.unitPriceCents) * 1000) / 10;
  return {
    deltaCents,
    deltaPercent,
    fromCents: previous.unitPriceCents,
    fromAt: previous.occurredAt,
  };
}

/**
 * Chave do fornecedor para séries por fornecedor: id quando vinculado, nome
 * bruto normalizado quando só há texto, ou o próprio evento quando nada.
 */
export function supplierKeyOf(event: {
  _id: Id<"priceEvents">;
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
}): string {
  if (event.supplierId) return `id:${event.supplierId}`;
  const raw = event.supplierNameRaw?.trim().toLowerCase();
  return raw ? `raw:${raw}` : `event:${event._id}`;
}

/**
 * Dois preços só são comparáveis na mesma unidade. Eventos sem unidade
 * (comuns em importações) são tratados como na unidade de referência, para
 * não apagar o histórico; o sinal de "unidade ausente" segue no evento.
 */
export function isComparableUnit(
  unit: string | undefined,
  referenceUnit: string | undefined
): boolean {
  const a = normalizeUnit(unit);
  const b = normalizeUnit(referenceUnit);
  if (!a || !b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Evento comparável anterior do mesmo fornecedor: a base da variação mostrada
 * ao lado do último preço. Comparar entre fornecedores diferentes não é uma
 * variação de preço, é uma diferença de cotação.
 */
export function previousFromSameSupplier<E extends PriceHistoryEvent>(
  events: E[],
  current: E
): E | null {
  const key = supplierKeyOf(current);
  let previous: E | null = null;
  for (const event of events) {
    if (event._id === current._id) continue;
    if (!isUsablePriceEvent(event)) continue;
    if (event.occurredAt > current.occurredAt) continue;
    if (
      event.occurredAt === current.occurredAt &&
      event._id >= current._id
    ) {
      continue;
    }
    if (supplierKeyOf(event) !== key) continue;
    if (!isComparableUnit(event.unit, current.unit)) continue;
    // Mesma ordem total (occurredAt, _id) da série: em empate de data, o
    // anterior é o de maior id, não o primeiro que a iteração encontrar.
    if (
      !previous ||
      event.occurredAt > previous.occurredAt ||
      (event.occurredAt === previous.occurredAt && event._id > previous._id)
    ) {
      previous = event;
    }
  }
  return previous;
}

export type PriceHistoryPoint<E extends PriceHistoryEvent> = {
  event: E;
  /** Variação em relação ao preço comparável anterior do mesmo fornecedor. */
  change: PriceChange | null;
};

export type PriceHistorySupplier<E extends PriceHistoryEvent> = {
  key: string;
  supplierId: Id<"suppliers"> | null;
  supplierNameRaw: string | null;
  latest: E;
  change: PriceChange | null;
  count: number;
};

export type PriceHistorySummary = {
  /** Preço vigente 30 dias atrás vs. o atual. */
  change30d: PriceChange | null;
  change90d: PriceChange | null;
  /** Variação vs. o preço anterior do mesmo fornecedor do preço atual. */
  changeFromPrevious: PriceChange | null;
  minCents: number;
  minAt: number;
  maxCents: number;
  maxAt: number;
  count: number;
  firstAt: number;
  lastAt: number;
};

export type PriceHistory<E extends PriceHistoryEvent> = {
  /** Unidade de referência da série (do material ou do preço vigente). */
  unit: string | null;
  /** Preço vigente na unidade de referência. */
  current: E | null;
  summary: PriceHistorySummary | null;
  /** Cronológico (mais antigo primeiro), só eventos comparáveis. */
  points: PriceHistoryPoint<E>[];
  /** Mais recente primeiro. */
  suppliers: PriceHistorySupplier<E>[];
  /** Eventos utilizáveis descartados por estarem em outra unidade. */
  excludedCount: number;
};

/**
 * O preço que valia em `at`: o escolhido pelo mesmo contrato do preço atual,
 * considerando só o que já tinha acontecido até aquela data.
 */
function currentPriceAt<E extends PriceHistoryEvent>(
  events: E[],
  at: number
): E | null {
  return pickCurrentPriceEvent(
    events.filter((event) => event.occurredAt <= at),
    at
  );
}

export function buildPriceHistory<E extends PriceHistoryEvent>(
  allEvents: E[],
  now: number,
  options: { materialUnit?: string | null } = {}
): PriceHistory<E> {
  const usable = allEvents.filter(isUsablePriceEvent);
  // A série fica na unidade do material; sem ela, na do preço vigente. Um
  // preço avulso em outra unidade (caixa, rolo) não redefine o histórico.
  const referenceUnit =
    normalizeUnit(options.materialUnit ?? undefined) ??
    normalizeUnit(pickCurrentPriceEvent(usable, now)?.unit) ??
    null;

  const comparable = usable
    .filter((event) => isComparableUnit(event.unit, referenceUnit ?? undefined))
    .sort((a, b) =>
      a.occurredAt === b.occurredAt
        ? a._id < b._id
          ? -1
          : 1
        : a.occurredAt - b.occurredAt
    );

  const current = pickCurrentPriceEvent(comparable, now);

  const points: PriceHistoryPoint<E>[] = comparable.map((event) => {
    const previous = previousFromSameSupplier(comparable, event);
    return {
      event,
      change: previous ? computePriceChange(event, previous) : null,
    };
  });

  const bySupplier = new Map<string, PriceHistorySupplier<E>>();
  for (const point of points) {
    const key = supplierKeyOf(point.event);
    const existing = bySupplier.get(key);
    if (!existing) {
      bySupplier.set(key, {
        key,
        supplierId: point.event.supplierId ?? null,
        supplierNameRaw: point.event.supplierNameRaw ?? null,
        latest: point.event,
        change: point.change,
        count: 1,
      });
    } else {
      existing.count += 1;
      // `points` é cronológico: o último visto é o mais recente.
      existing.latest = point.event;
      existing.change = point.change;
    }
  }
  const suppliers = [...bySupplier.values()].sort(
    (a, b) => b.latest.occurredAt - a.latest.occurredAt
  );

  let summary: PriceHistorySummary | null = null;
  if (current && comparable.length > 0) {
    let min = comparable[0]!;
    let max = comparable[0]!;
    for (const event of comparable) {
      if (event.unitPriceCents < min.unitPriceCents) min = event;
      if (event.unitPriceCents > max.unitPriceCents) max = event;
    }
    const changeAgainst = (at: number): PriceChange | null => {
      const base = currentPriceAt(comparable, at);
      if (!base || base._id === current._id) return null;
      return computePriceChange(current, base);
    };
    const previous = previousFromSameSupplier(comparable, current);
    summary = {
      change30d: changeAgainst(now - 30 * DAY_MS),
      change90d: changeAgainst(now - 90 * DAY_MS),
      changeFromPrevious: previous
        ? computePriceChange(current, previous)
        : null,
      minCents: min.unitPriceCents,
      minAt: min.occurredAt,
      maxCents: max.unitPriceCents,
      maxAt: max.occurredAt,
      count: comparable.length,
      firstAt: comparable[0]!.occurredAt,
      lastAt: comparable[comparable.length - 1]!.occurredAt,
    };
  }

  return {
    unit: referenceUnit,
    current,
    summary,
    points,
    suppliers,
    excludedCount: usable.length - comparable.length,
  };
}
