import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  DAY_MS as SHARED_DAY_MS,
  REFERENCE_WINDOW_DAYS,
  referenceStats,
  type ReferenceStats,
} from "@rlpapp/shared/compras/priceReference";
import { normalizeUnit } from "./catalog";
import {
  isSupplierQuote,
  isUsablePriceEvent,
  pickCurrentPriceEvent,
} from "./priceSelection";

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

/**
 * Preços de um material com data entre `from` e `to` (inclusivo), mais
 * recentes primeiro, pela data do preço e não pela de criação: um preço
 * antigo lançado hoje (histórico retroativo) cai na janela certa.
 */
export async function materialEventsBetween(
  ctx: QueryCtx,
  materialId: Id<"materials">,
  from: number,
  to: number,
  limit: number
): Promise<Doc<"priceEvents">[]> {
  return await ctx.db
    .query("priceEvents")
    .withIndex("by_material_and_occurred_at", (q) =>
      q.eq("materialId", materialId).gte("occurredAt", from).lte("occurredAt", to)
    )
    .order("desc")
    .take(limit);
}

/**
 * Máximo de cotações válidas de um material na referência (6 meses). Dá ~20
 * cotações por semana; acima disso, a referência usa as mais recentes.
 */
export const REFERENCE_EVENT_LIMIT = 500;
/**
 * Máximo de lançamentos percorridos na janela (válidos ou não: estimativas,
 * descartados, outra unidade), para a consulta continuar dentro dos limites
 * de leitura mesmo num material com muito lançamento descartado.
 */
export const REFERENCE_SCAN_LIMIT = 3000;

/**
 * Referência de orçamento de um material: mediana, faixa, dispersão e ritmo
 * das cotações de fornecedores dos últimos 6 meses, na unidade do material.
 * Estimativas digitadas no takeoff e preços descartados na revisão ficam fora.
 * Percorre a janela do mais recente para o mais antigo até juntar
 * REFERENCE_EVENT_LIMIT cotações válidas, então lançamentos descartados não
 * empurram uma cotação válida para fora.
 *
 * `truncated` (fora de `reference`, para valer mesmo sem referência) diz que a
 * janela não foi lida inteira: tinha mais cotações válidas do que o limite, ou
 * mais lançamentos do que REFERENCE_SCAN_LIMIT. Sem cotação válida na parte
 * lida, `reference` é null e `truncated` avisa que pode haver cotação além.
 */
export async function materialReferenceStats(
  ctx: QueryCtx,
  material: Pick<Doc<"materials">, "_id" | "unit">,
  now: number
): Promise<MaterialReferenceRead> {
  const eligible: Doc<"priceEvents">[] = [];
  let scanned = 0;
  let truncated = false;
  for await (const event of ctx.db
    .query("priceEvents")
    .withIndex("by_material_and_occurred_at", (q) =>
      q
        .eq("materialId", material._id)
        .gte("occurredAt", now - REFERENCE_WINDOW_DAYS * SHARED_DAY_MS)
        .lte("occurredAt", now)
    )
    .order("desc")) {
    // Só marca corte quando existe de fato um lançamento além do limite.
    if (scanned === REFERENCE_SCAN_LIMIT) {
      truncated = true;
      break;
    }
    scanned += 1;
    if (!isReferenceQuote(event, material)) continue;
    if (eligible.length === REFERENCE_EVENT_LIMIT) {
      truncated = true;
      break;
    }
    eligible.push(event);
  }
  return {
    reference: withTruncation(referenceStatsOf(eligible, material, now), truncated),
    truncated,
  };
}

/** A referência lida e se a janela foi lida inteira. */
export type MaterialReferenceRead = {
  reference: MaterialReference | null;
  truncated: boolean;
};

/** Um lançamento que conta para a referência: cotação de fornecedor na unidade do material. */
function isReferenceQuote(
  event: Doc<"priceEvents">,
  material: Pick<Doc<"materials">, "unit">
): boolean {
  return isSupplierQuote(event) && isComparableUnit(event.unit, material.unit);
}

/**
 * A referência com o aviso de amostra: `truncated` = a janela de 6 meses tem
 * mais cotações do que REFERENCE_EVENT_LIMIT e a referência usa as mais
 * recentes.
 */
export type MaterialReference = ReferenceStats & { truncated: boolean };

export function withTruncation(
  stats: ReferenceStats | null,
  truncated: boolean
): MaterialReference | null {
  return stats ? { ...stats, truncated } : null;
}

/** Referência a partir de preços já lidos: só cotações de fornecedor na unidade do material. */
export function referenceStatsOf(
  events: Doc<"priceEvents">[],
  material: Pick<Doc<"materials">, "unit">,
  now: number
): ReferenceStats | null {
  return referenceStats(
    events
      .filter((event) => isReferenceQuote(event, material))
      .map((event) => ({
        unitPriceCents: event.unitPriceCents,
        occurredAt: event.occurredAt,
        supplierKey: supplierKeyOf(event),
        supplierName: "",
      })),
    now
  );
}

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
