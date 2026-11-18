import { describe, expect, test } from "vitest";
import {
  compareSuppliersByPeriod,
  DAY_MS,
  median,
  monthStartOf,
  referenceStats,
  supplierStandings,
  weekStartOf,
  type QuoteSample,
} from "../src/compras/priceReference";

/** Horário de Brasília (UTC-3) como instante UTC. */
const brt = (y: number, m: number, d: number, h = 12, min = 0) =>
  Date.UTC(y, m - 1, d, h + 3, min);

const quote = (
  supplier: string,
  unitPriceCents: number,
  occurredAt: number
): QuoteSample => ({
  supplierKey: supplier.toLowerCase(),
  supplierName: supplier,
  unitPriceCents,
  occurredAt,
});

describe("períodos", () => {
  test("a semana vai de segunda a domingo no horário de Brasília", () => {
    const monday = brt(2026, 11, 2, 0, 0);
    expect(weekStartOf(brt(2026, 11, 4, 10))).toBe(monday);
    // Domingo 23:30 em Brasília já é segunda em UTC, mas ainda é a mesma semana.
    expect(weekStartOf(brt(2026, 11, 8, 23, 30))).toBe(monday);
    expect(weekStartOf(brt(2026, 11, 9, 0, 30))).toBe(monday + 7 * DAY_MS);
    expect(weekStartOf(monday)).toBe(monday);
  });

  test("o mês começa no dia 1 em Brasília", () => {
    expect(monthStartOf(brt(2026, 11, 18))).toBe(brt(2026, 11, 1, 0, 0));
    // 31/10 22:00 em Brasília já é 01/11 em UTC.
    expect(monthStartOf(brt(2026, 10, 31, 22))).toBe(brt(2026, 10, 1, 0, 0));
  });

  test("mediana com quantidade par e ímpar", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([2890, 3120, 2950, 3050])).toBe(3000);
  });
});

describe("referenceStats", () => {
  // 183 dias antes: 09/05, então as cotações de maio ainda contam.
  const now = brt(2026, 11, 9);
  const lg = [
    quote("Frigelar", 289000, brt(2026, 5, 12)),
    quote("Leveros", 295000, brt(2026, 5, 14)),
    quote("Frigelar", 299000, brt(2026, 8, 21)),
    quote("Dufrio", 305000, brt(2026, 11, 6)),
    quote("Frigelar", 309000, brt(2026, 11, 4)),
    quote("Leveros", 312000, brt(2026, 11, 7)),
  ];

  test("mediana, faixa, dispersão e ritmo mensal", () => {
    const stats = referenceStats(lg, now)!;
    expect(stats.medianCents).toBe(302000);
    expect(stats.minCents).toBe(289000);
    expect(stats.maxCents).toBe(312000);
    expect(stats.count).toBe(6);
    expect(stats.supplierCount).toBe(3);
    expect(stats.spread).toBeCloseTo(23000 / 302000, 6);
    expect(stats.status).toBe("ok");
    // Mediana da primeira semana 2.920, da última 3.090.
    expect(stats.totalChange).toBeCloseTo((309000 - 292000) / 292000, 6);
    expect(stats.monthlyChange).toBeGreaterThan(0.009);
    expect(stats.monthlyChange).toBeLessThan(0.011);
  });

  test("só a janela de 6 meses conta", () => {
    const old = quote("Dufrio", 100000, brt(2026, 3, 1));
    expect(referenceStats([...lg, old], now)!.count).toBe(6);
    expect(referenceStats([old], now)).toBeNull();
  });

  test("avisa quando a dispersão passa de 10% ou a cotação envelhece", () => {
    const wide = [
      quote("A", 100000, brt(2026, 11, 2)),
      quote("B", 125000, brt(2026, 11, 3)),
    ];
    expect(referenceStats(wide, now)!.status).toBe("wide");
    const stale = [quote("A", 100000, brt(2026, 7, 1))];
    expect(referenceStats(stale, now)!.status).toBe("stale");
    expect(referenceStats(stale, now)!.monthlyChange).toBeNull();
  });
});

describe("comparação de fornecedores", () => {
  const quotes = [
    quote("Frigelar", 289000, brt(2026, 5, 12)),
    quote("Leveros", 295000, brt(2026, 5, 14)),
    quote("Frigelar", 299000, brt(2026, 8, 21)),
    quote("Frigelar", 309000, brt(2026, 11, 4)),
    quote("Dufrio", 306000, brt(2026, 11, 5)),
    // A Dufrio mandou outra proposta na mesma semana: vale a mais recente.
    quote("Dufrio", 305000, brt(2026, 11, 6)),
    quote("Leveros", 312000, brt(2026, 11, 7)),
  ];

  test("agrupa por semana, um preço por fornecedor, o menor primeiro", () => {
    const weeks = compareSuppliersByPeriod(quotes, "week");
    expect(weeks.map((w) => w.periodStart)).toEqual([
      brt(2026, 11, 2, 0, 0),
      brt(2026, 8, 17, 0, 0),
      brt(2026, 5, 11, 0, 0),
    ]);
    const latest = weeks[0]!;
    expect(latest.quotes.map((q) => [q.supplierName, q.unitPriceCents])).toEqual([
      ["Dufrio", 305000],
      ["Frigelar", 309000],
      ["Leveros", 312000],
    ]);
    expect(latest.cheapestSupplierKey).toBe("dufrio");
    expect(latest.spread).toBeCloseTo(7000 / 305000, 6);
    expect(weeks[1]!.cheapestSupplierKey).toBeNull();
    expect(weeks[1]!.spread).toBeNull();
  });

  test("por mês junta semanas diferentes", () => {
    const months = compareSuppliersByPeriod(quotes, "month");
    expect(months).toHaveLength(3);
    expect(months[2]!.quotes).toHaveLength(2);
  });

  test("placar: quem foi mais barato e quanto costuma ficar da mediana", () => {
    const standings = supplierStandings(quotes, 302000);
    const byName = Object.fromEntries(standings.map((s) => [s.supplierName, s]));
    expect(byName.Frigelar).toMatchObject({ quoteCount: 3, contested: 2, wins: 1 });
    expect(byName.Dufrio).toMatchObject({ quoteCount: 2, contested: 1, wins: 1 });
    expect(byName.Leveros).toMatchObject({ quoteCount: 2, contested: 2, wins: 0 });
    expect(standings[0]!.supplierName).toBe("Frigelar");
  });
});
