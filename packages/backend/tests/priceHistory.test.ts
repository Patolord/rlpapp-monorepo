import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  buildPriceHistory,
  computePriceChange,
  DAY_MS,
  isComparableUnit,
  previousFromSameSupplier,
  type PriceHistoryEvent,
} from "../convex/model/procurement/priceHistory";
import { setup } from "./helpers";

const NOW = Date.UTC(2026, 9, 30);

let seq = 0;
function event(
  overrides: Partial<PriceHistoryEvent> & {
    unitPriceCents: number;
    daysAgo: number;
  }
): PriceHistoryEvent {
  seq += 1;
  const { daysAgo, ...rest } = overrides;
  return {
    _id: `evt${String(seq).padStart(3, "0")}` as Id<"priceEvents">,
    occurredAt: NOW - daysAgo * DAY_MS,
    source: "manual",
    needsReview: false,
    ...rest,
  };
}

describe("price history helpers", () => {
  test("computes delta in cents and percent with one decimal", () => {
    const change = computePriceChange(
      { unitPriceCents: 1100 },
      { unitPriceCents: 1000, occurredAt: 1 }
    );
    expect(change).toEqual({
      deltaCents: 100,
      deltaPercent: 10,
      fromCents: 1000,
      fromAt: 1,
    });
    expect(
      computePriceChange(
        { unitPriceCents: 1234 },
        { unitPriceCents: 999, occurredAt: 1 }
      ).deltaPercent
    ).toBe(23.5);
    expect(
      computePriceChange({ unitPriceCents: 5 }, { unitPriceCents: 0, occurredAt: 1 })
        .deltaPercent
    ).toBeNull();
  });

  test("units compare after normalization and missing units are tolerated", () => {
    expect(isComparableUnit("m", "metro")).toBe(true);
    expect(isComparableUnit("pç", "m")).toBe(false);
    expect(isComparableUnit(undefined, "m")).toBe(true);
    expect(isComparableUnit("m", undefined)).toBe(true);
  });

  test("previous price comes from the same supplier and unit only", () => {
    const a = "sa" as Id<"suppliers">;
    const b = "sb" as Id<"suppliers">;
    const events = [
      event({ supplierId: a, unitPriceCents: 1000, daysAgo: 60, unit: "m" }),
      event({ supplierId: b, unitPriceCents: 800, daysAgo: 30, unit: "m" }),
      event({ supplierId: a, unitPriceCents: 1500, daysAgo: 20, unit: "pç" }),
      event({ supplierId: a, unitPriceCents: 1100, daysAgo: 10, unit: "m" }),
      event({
        supplierId: a,
        unitPriceCents: 1300,
        daysAgo: 5,
        unit: "m",
        reviewStatus: "ignored",
      }),
    ];
    const current = events[3]!;
    expect(previousFromSameSupplier(events, current)?._id).toBe(events[0]!._id);
    // Fornecedor B tem só um preço: sem base de comparação.
    expect(previousFromSameSupplier(events, events[1]!)).toBeNull();
  });

  test("builds a chronological series with per-supplier deltas and a summary", () => {
    const a = "sa" as Id<"suppliers">;
    const events = [
      event({ supplierId: a, unitPriceCents: 1200, daysAgo: 5 }),
      event({ supplierId: a, unitPriceCents: 1000, daysAgo: 100 }),
      event({ supplierNameRaw: "Loja B", unitPriceCents: 900, daysAgo: 40 }),
      event({ supplierId: a, unitPriceCents: 1100, daysAgo: 45 }),
      // Outra unidade: fica fora da série.
      event({ supplierId: a, unitPriceCents: 50_000, daysAgo: 2, unit: "cx" }),
    ];
    const history = buildPriceHistory(events, NOW, { materialUnit: "m" });

    expect(history.unit).toBe("m");
    expect(history.current?.unitPriceCents).toBe(1200);
    expect(history.excludedCount).toBe(1);
    expect(history.points.map((p) => p.event.unitPriceCents)).toEqual([
      1000, 1100, 900, 1200,
    ]);
    expect(history.points.map((p) => p.change?.deltaPercent ?? null)).toEqual([
      null,
      10,
      null,
      9.1,
    ]);

    const summary = history.summary!;
    expect(summary.minCents).toBe(900);
    expect(summary.maxCents).toBe(1200);
    expect(summary.count).toBe(4);
    // Preço atual é da Loja A; o anterior dela foi 1100 há 45 dias.
    expect(summary.changeFromPrevious).toMatchObject({
      deltaCents: 100,
      deltaPercent: 9.1,
      fromCents: 1100,
    });
    // Há 30 dias valia o preço mais recente até então: Loja B a 900.
    expect(summary.change30d).toMatchObject({ fromCents: 900, deltaPercent: 33.3 });
    // Há 90 dias só existia o preço de 1000.
    expect(summary.change90d).toMatchObject({ fromCents: 1000, deltaPercent: 20 });

    expect(history.suppliers.map((s) => s.latest.unitPriceCents)).toEqual([
      1200, 900,
    ]);
    expect(history.suppliers[0]).toMatchObject({ count: 3, supplierId: a });
  });

  test("current price is excluded from its own 30 day comparison", () => {
    const events = [
      event({ supplierNameRaw: "X", unitPriceCents: 1000, daysAgo: 45 }),
    ];
    const history = buildPriceHistory(events, NOW);
    expect(history.summary?.change30d).toBeNull();
    expect(history.summary?.changeFromPrevious).toBeNull();
  });

  test("no usable events yields an empty history", () => {
    const history = buildPriceHistory([], NOW);
    expect(history).toEqual({
      unit: null,
      current: null,
      summary: null,
      points: [],
      suppliers: [],
      excludedCount: 0,
    });
  });
});

describe("price history query", () => {
  async function seed() {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Compras",
        clerkId: "purchasing",
        role: "operator",
        department: "compras",
        isActive: true,
        createdAt: Date.now(),
      });
    });
    return { t, purchasing: t.withIdentity({ subject: "purchasing" }) };
  }

  test("returns resolved supplier names, deltas and catalog variation", async () => {
    const { purchasing } = await seed();
    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Cabo PP 3x2,5",
      unit: "m",
    });
    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Elétrica Central",
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId,
      supplierId,
      unitPriceCents: 1000,
      unit: "m",
      source: "quote",
      occurredAt: NOW - 60 * DAY_MS,
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId,
      supplierId,
      unitPriceCents: 1250,
      unit: "m",
      source: "invoice",
      occurredAt: NOW - 3 * DAY_MS,
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId,
      supplierNameRaw: "Loja do Zé",
      unitPriceCents: 1180,
      source: "whatsapp",
      occurredAt: NOW - 10 * DAY_MS,
    });

    const history = await purchasing.query(api.priceEvents.historyForMaterial, {
      materialId,
      now: NOW,
    });
    expect(history.unit).toBe("m");
    expect(history.current?.unitPriceCents).toBe(1250);
    expect(history.points.map((p) => [p.supplierName, p.change?.deltaPercent ?? null])).toEqual([
      ["Elétrica Central", null],
      ["Loja do Zé", null],
      ["Elétrica Central", 25],
    ]);
    expect(history.suppliers).toHaveLength(2);
    expect(history.suppliers[0]).toMatchObject({
      supplierName: "Elétrica Central",
      unitPriceCents: 1250,
      count: 2,
      change: { deltaCents: 250, deltaPercent: 25, fromCents: 1000 },
    });
    expect(history.summary?.change30d).toMatchObject({ fromCents: 1000 });

    const page = await purchasing.query(api.materials.listCatalog, {
      search: "Cabo PP",
      now: NOW,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page[0]?.latestPrice).toMatchObject({
      unitPriceCents: 1250,
      change: { deltaCents: 250, deltaPercent: 25 },
    });
  });
});
