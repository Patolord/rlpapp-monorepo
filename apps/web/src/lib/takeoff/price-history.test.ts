import { describe, expect, test } from "vitest";

import {
  niceTicks,
  type PricePoint,
  priceAt,
  priceSteps,
  priceSummary,
  pointsFor,
  timeDomain,
} from "./price-history";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 5);
const at = (daysAgo: number) => NOW - daysAgo * DAY;
const point = (material: string, price: number | null, daysAgo: number): PricePoint => ({
  material,
  price,
  recordedAt: at(daysAgo),
  recordedBy: null,
});

const history = [
  point("cobre", 128, 10),
  point("chapa", 9, 100),
  point("cobre", 110, 400),
  point("cobre", 120, 200),
];

describe("price history", () => {
  test("pointsFor keeps one material, oldest first", () => {
    expect(pointsFor(history, "cobre").map((p) => p.price)).toEqual([110, 120, 128]);
  });

  test("steps run until the next point, the last one until now", () => {
    expect(priceSteps(pointsFor(history, "cobre"), NOW)).toEqual([
      { from: at(400), to: at(200), price: 110 },
      { from: at(200), to: at(10), price: 120 },
      { from: at(10), to: NOW, price: 128 },
    ]);
  });

  test("priceAt is the price in force at an instant", () => {
    const copper = pointsFor(history, "cobre");
    expect(priceAt(copper, at(500))).toBeUndefined();
    expect(priceAt(copper, at(300))).toBe(110);
    expect(priceAt(copper, at(10))).toBe(128);
  });

  test("summary: current, against the previous price and twelve months ago", () => {
    const summary = priceSummary(pointsFor(history, "cobre"), NOW);
    expect(summary.current).toEqual({ price: 128, since: at(10) });
    expect(summary.vsPrevious).toMatchObject({ fromCents: 12000, deltaCents: 800 });
    expect(summary.vsPrevious?.deltaPercent).toBeCloseTo(6.667, 2);
    expect(summary.vs12Months).toMatchObject({ fromCents: 11000, deltaCents: 1800 });
    expect([summary.min, summary.max]).toEqual([110, 128]);
  });

  test("summary without a year of history or with the price cleared", () => {
    const sheet = priceSummary(pointsFor(history, "chapa"), NOW);
    expect(sheet.current?.price).toBe(9);
    expect(sheet.vsPrevious).toBeNull();
    expect(sheet.vs12Months).toBeNull();
    const cleared = priceSummary([point("chapa", 9, 50), point("chapa", null, 5)], NOW);
    expect(cleared.current).toBeNull();
    expect(cleared.max).toBe(9);
  });

  test("the time axis spans at least thirty days", () => {
    expect(timeDomain([], NOW)).toEqual([at(30), NOW]);
    expect(timeDomain(pointsFor(history, "cobre"), NOW)).toEqual([at(400), NOW]);
  });

  test("niceTicks covers the range with round steps", () => {
    const ticks = niceTicks(110, 128);
    expect(ticks[0]).toBeLessThanOrEqual(110);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(128);
    expect(ticks).toEqual([110, 120, 130]);
    expect(niceTicks(9, 9).length).toBeGreaterThan(1);
  });
});
