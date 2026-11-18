import { DAY_MS, weekStartOf } from "@rlpapp/shared/compras/priceReference";

/**
 * Semanas de cotação na URL e totais do mapa da rodada. A semana vai de
 * segunda a domingo no horário de Brasília (ver @rlpapp/shared/compras).
 */

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

/** "2026-11-02" para a semana que contém `at` (a segunda-feira dela). */
export function toWeekParam(at: number): string {
  return new Date(weekStartOf(at) + BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Início da semana de um parâmetro "aaaa-mm-dd" (qualquer dia dela); null se inválido. */
export function fromWeekParam(param: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (!match) return null;
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) - BRT_OFFSET_MS;
  return Number.isNaN(at) ? null : weekStartOf(at);
}

export function shiftWeekParam(param: string, weeks: number): string | null {
  const start = fromWeekParam(param);
  return start === null ? null : toWeekParam(start + weeks * 7 * DAY_MS + DAY_MS);
}

function parseDateInput(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]) - 1, Number(match[3])] : null;
}

/** Um `<input type="date">` como o meio-dia daquele dia em Brasília. */
export function dateInputToInstant(value: string): number | null {
  const parts = parseDateInput(value);
  return parts ? Date.UTC(parts[0], parts[1], parts[2], 12) - BRT_OFFSET_MS : null;
}

/** Validade: o último instante daquele dia em Brasília. */
export function dateInputToEndOfDay(value: string): number | null {
  const parts = parseDateInput(value);
  return parts ? Date.UTC(parts[0], parts[1], parts[2] + 1) - BRT_OFFSET_MS - 1 : null;
}

/** "2026-11-06" para o dia de `at` em Brasília. */
export function toDateInput(at: number): string {
  return new Date(at + BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** "02/11 a 08/11/2026" */
export function formatWeekRange(weekStart: number): string {
  const day = (at: number, withYear: boolean) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "America/Sao_Paulo",
    }).format(at);
  return `${day(weekStart, false)} a ${day(weekStart + 6 * DAY_MS, true)}`;
}

/** "+2,7%" / "−1,8%" / "0,0%" com uma casa. */
export function formatSignedPercent(fraction: number): string {
  const value = Math.abs(fraction * 100).toFixed(1).replace(".", ",");
  if (fraction > 0.0005) return `+${value}%`;
  if (fraction < -0.0005) return `−${value}%`;
  return `${value}%`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace(".", ",")}%`;
}

type MapCell = { supplierKey: string; unitPriceCents: number };
type MapRow = { quantity: number | null; cells: MapCell[] };

export type SupplierTotals = {
  /** Soma de quantidade × preço dos itens com quantidade que o fornecedor cotou. */
  quotedCents: number;
  quotedRows: number;
  /** Itens com quantidade que ele não cotou. */
  missingRows: number;
  /** Soma só dos itens que todos os fornecedores cotaram (comparação justa). */
  commonCents: number;
};

/**
 * Totais por fornecedor no mapa da rodada. Só entram linhas com quantidade;
 * `commonCents` usa apenas os itens que todas as colunas cotaram.
 */
export function supplierTotals(
  rows: readonly MapRow[],
  supplierKeys: readonly string[]
): { bySupplier: Map<string, SupplierTotals>; commonRows: number; cheapestMixCents: number } {
  const bySupplier = new Map<string, SupplierTotals>(
    supplierKeys.map((key) => [
      key,
      { quotedCents: 0, quotedRows: 0, missingRows: 0, commonCents: 0 },
    ])
  );
  let commonRows = 0;
  let cheapestMixCents = 0;
  for (const row of rows) {
    if (!row.quantity) continue;
    const prices = new Map(row.cells.map((cell) => [cell.supplierKey, cell.unitPriceCents]));
    const common = supplierKeys.every((key) => prices.has(key));
    if (common) commonRows += 1;
    if (row.cells.length > 0) {
      cheapestMixCents +=
        row.quantity * Math.min(...row.cells.map((cell) => cell.unitPriceCents));
    }
    for (const key of supplierKeys) {
      const totals = bySupplier.get(key)!;
      const price = prices.get(key);
      if (price === undefined) {
        totals.missingRows += 1;
        continue;
      }
      totals.quotedCents += row.quantity * price;
      totals.quotedRows += 1;
      if (common) totals.commonCents += row.quantity * price;
    }
  }
  return {
    bySupplier,
    commonRows,
    cheapestMixCents: Math.round(cheapestMixCents),
  };
}
