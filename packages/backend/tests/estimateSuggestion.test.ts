import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  distanceToPercent,
  fitWeightedLeastSquares,
  regressionFeatures,
  sizeDistance,
  suggestEstimate,
  type EstimateCandidate,
} from "../convex/model/procurement/estimateSuggestion";
import { DAY_MS } from "../convex/model/procurement/priceHistory";
import { setup } from "./helpers";

const NOW = Date.UTC(2026, 9, 30);

let seq = 0;
function quote(
  dimensions: EstimateCandidate["dimensions"],
  unitPriceCents: number,
  daysAgo = 10,
  extra: Partial<EstimateCandidate> = {}
): EstimateCandidate {
  seq += 1;
  return {
    eventId: `evt${seq}` as Id<"priceEvents">,
    unitPriceCents,
    occurredAt: NOW - daysAgo * DAY_MS,
    dimensions,
    ...extra,
  };
}

describe("size distance", () => {
  test("is symmetric, proportional and zero for the same size", () => {
    expect(sizeDistance({ widthMm: 100, heightMm: 100 }, { widthMm: 100, heightMm: 100 })).toBe(0);
    const up = sizeDistance({ widthMm: 100, heightMm: 100 }, { widthMm: 200, heightMm: 200 })!;
    const down = sizeDistance({ widthMm: 200, heightMm: 200 }, { widthMm: 100, heightMm: 100 })!;
    expect(up).toBeCloseTo(down);
    expect(distanceToPercent(up)).toBe(100);
  });

  test("different kinds of measure are not comparable", () => {
    expect(sizeDistance({ widthMm: 100, heightMm: 100 }, { diameterMm: 100 })).toBeNull();
    expect(sizeDistance({ lengthMm: 100 }, { lengthMm: 100, thicknessMm: 1 })).toBeNull();
    expect(sizeDistance({}, { lengthMm: 100 })).toBeNull();
  });
});

describe("regression", () => {
  test("features carry an intercept plus area and perimeter for flat parts", () => {
    expect(regressionFeatures({ widthMm: 1000, heightMm: 500 })).toEqual([1, 0.5, 3]);
    expect(regressionFeatures({ lengthMm: 2500 })).toEqual([1, 2.5]);
    const round = regressionFeatures({ diameterMm: 1000 });
    expect(round[0]).toBe(1);
    expect(round[1]).toBeCloseTo(Math.PI / 4);
    expect(round[2]).toBe(1);
  });

  test("weighted least squares recovers a linear price rule", () => {
    const rows = [
      [100, 100],
      [200, 100],
      [300, 200],
      [400, 200],
      [500, 300],
      [250, 150],
    ].map(([w, h]) => {
      const features = regressionFeatures({ widthMm: w, heightMm: h });
      return { features, target: 5000 + 20000 * features[1]! + 1000 * features[2]!, weight: 1 };
    });
    const coefficients = fitWeightedLeastSquares(rows)!;
    expect(coefficients[0]).toBeCloseTo(5000, 3);
    expect(coefficients[1]).toBeCloseTo(20000, 3);
    expect(coefficients[2]).toBeCloseTo(1000, 3);
  });
});

describe("suggestEstimate", () => {
  test("exact size wins and is weighted toward recent quotes", () => {
    const result = suggestEstimate(
      [
        quote({ widthMm: 100, heightMm: 100 }, 10_000, 400),
        quote({ widthMm: 100, heightMm: 100 }, 12_000, 5),
        quote({ widthMm: 300, heightMm: 300 }, 30_000, 5),
      ],
      { widthMm: 100, heightMm: 100 },
      NOW
    );
    expect(result.method).toBe("exact");
    if (result.method === null) throw new Error("unreachable");
    expect(result.usedCount).toBe(2);
    expect(result.suggestedUnitPriceCents).toBeGreaterThan(11_000);
    expect(result.suggestedUnitPriceCents).toBeLessThan(12_000);
    expect(result.precedents[0]!.sizeDifferencePercent).toBe(0);
  });

  test("falls back to nearest sizes within range, ignoring far ones", () => {
    const result = suggestEstimate(
      [
        quote({ widthMm: 110, heightMm: 110 }, 11_000),
        quote({ widthMm: 90, heightMm: 90 }, 9_000),
        quote({ widthMm: 400, heightMm: 400 }, 40_000),
      ],
      { widthMm: 100, heightMm: 100 },
      NOW
    );
    expect(result.method).toBe("nearest");
    if (result.method === null) throw new Error("unreachable");
    expect(result.usedCount).toBe(2);
    // Média ponderada por proximidade: ln(110/100) e ln(90/100) diferem um pouco.
    expect(result.suggestedUnitPriceCents).toBeGreaterThan(9_900);
    expect(result.suggestedUnitPriceCents).toBeLessThan(10_100);
    expect(result.minCents).toBe(9_000);
    expect(result.maxCents).toBe(11_000);
    expect(result.compatibleCount).toBe(3);
  });

  test("returns no method when nothing is close enough, but still lists precedents", () => {
    const result = suggestEstimate(
      [quote({ widthMm: 400, heightMm: 400 }, 40_000)],
      { widthMm: 100, heightMm: 100 },
      NOW
    );
    expect(result.method).toBeNull();
    expect(result.compatibleCount).toBe(1);
    expect(result.precedents).toHaveLength(1);
  });

  test("fits a curve once the family has enough sizes and extrapolates", () => {
    const sizes: [number, number][] = [
      [100, 100],
      [200, 100],
      [200, 200],
      [300, 200],
      [400, 300],
      [500, 500],
      [600, 400],
    ];
    const candidates = sizes.map(([w, h]) => {
      const [, area, perimeter] = regressionFeatures({ widthMm: w, heightMm: h });
      return quote({ widthMm: w, heightMm: h }, Math.round(8000 + 30000 * area! + 1500 * perimeter!));
    });
    const result = suggestEstimate(candidates, { widthMm: 800, heightMm: 600 }, NOW);
    expect(result.method).toBe("regression");
    if (result.method === null) throw new Error("unreachable");
    const [, area, perimeter] = regressionFeatures({ widthMm: 800, heightMm: 600 });
    const expected = 8000 + 30000 * area! + 1500 * perimeter!;
    expect(Math.abs(result.suggestedUnitPriceCents - expected) / expected).toBeLessThan(0.02);
    expect(result.usedCount).toBe(7);
  });

  test("counts distinct sizes regardless of key order, so three sizes never fit a curve", () => {
    // Três tamanhos reais, cada um também na ordem de chaves invertida.
    const sizes: [number, number][] = [
      [100, 100],
      [200, 200],
      [300, 300],
    ];
    const candidates = sizes.flatMap(([w, h]) => [
      quote({ widthMm: w, heightMm: h }, w * 100),
      quote({ heightMm: h, widthMm: w }, w * 100 + 500),
    ]);
    const result = suggestEstimate(candidates, { widthMm: 500, heightMm: 500 }, NOW);
    expect(result.method).not.toBe("regression");
  });

  test("prefers the requested supplier when it has enough quotes", () => {
    const a = "sa" as Id<"suppliers">;
    const b = "sb" as Id<"suppliers">;
    const result = suggestEstimate(
      [
        quote({ widthMm: 100, heightMm: 100 }, 10_000, 5, { supplierId: a }),
        quote({ widthMm: 100, heightMm: 100 }, 10_500, 20, { supplierId: a }),
        quote({ widthMm: 100, heightMm: 100 }, 20_000, 5, { supplierId: b }),
      ],
      { widthMm: 100, heightMm: 100 },
      NOW,
      { supplierId: a }
    );
    expect(result.method).toBe("exact");
    if (result.method === null) throw new Error("unreachable");
    expect(result.supplierOnly).toBe(true);
    expect(result.suggestedUnitPriceCents).toBeLessThan(11_000);
  });
});

describe("quotes with dimensions", () => {
  async function seed() {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        name: "Compras",
        clerkId: "purchasing",
        role: "operator",
        department: "compras",
        isActive: true,
        createdAt: now,
      });
      await ctx.db.insert("users", {
        name: "Engenheiro",
        clerkId: "engineer",
        role: "engenheiro",
        department: "engenharia",
        isActive: true,
        createdAt: now,
      });
    });
    return {
      t,
      purchasing: t.withIdentity({ subject: "purchasing" }),
      engineer: t.withIdentity({ subject: "engineer" }),
    };
  }

  test("a quote on a takeoff item gets a SKU for its size and feeds the family estimate", async () => {
    const { purchasing, engineer } = await seed();
    const takeoffId = await engineer.mutation(api.takeoffs.create, { name: "Grelhas" });
    const small = await engineer.mutation(api.takeoffs.addItem, {
      takeoffId,
      rawDescription: "Grelha de ventilação",
      quantity: 4,
      unit: "un",
      customDimensions: { widthMm: 100, heightMm: 100 },
      estimatedUnitPriceCents: 9_000,
    });
    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Metalúrgica Sul",
    });

    const eventId = await purchasing.mutation(api.priceEvents.add, {
      takeoffItemId: small,
      supplierId,
      unitPriceCents: 10_000,
      source: "quote",
      occurredAt: NOW - 2 * DAY_MS,
    });

    const detail = await engineer.query(api.takeoffs.get, { takeoffId, now: NOW });
    const item = detail!.items[0]!;
    expect(item.materialId).not.toBeNull();
    expect(item.quotes).toHaveLength(1);
    expect(item.quotes[0]).toMatchObject({
      _id: eventId,
      supplierName: "Metalúrgica Sul",
      unitPriceCents: 10_000,
      versusEstimate: { deltaCents: 1_000, deltaPercent: 11.1, fromCents: 9_000 },
    });

    const events = await purchasing.query(api.priceEvents.list, {
      now: NOW,
      takeoffId,
    });
    expect(events[0]).toMatchObject({
      materialId: item.materialId,
      takeoffItemId: small,
      dimensions: { widthMm: 100, heightMm: 100 },
      unit: "un",
    });

    // Segunda medida: a estimativa para um tamanho intermediário usa as duas.
    const large = await engineer.mutation(api.takeoffs.addItem, {
      takeoffId,
      rawDescription: "Grelha de ventilação",
      unit: "un",
      customDimensions: { widthMm: 120, heightMm: 120 },
    });
    await purchasing.mutation(api.priceEvents.add, {
      takeoffItemId: large,
      supplierId,
      unitPriceCents: 12_000,
      source: "quote",
      occurredAt: NOW - DAY_MS,
    });

    const suggestion = await engineer.query(api.priceEvents.suggestEstimate, {
      familyName: "grelha de VENTILACAO",
      dimensions: { widthMm: 110, heightMm: 110 },
      now: NOW,
    });
    expect(suggestion.familyName).toBe("Grelha de ventilação");
    expect(suggestion.method).toBe("nearest");
    expect(suggestion.usedCount).toBe(2);
    expect(suggestion.suggestedUnitPriceCents).toBeGreaterThan(10_900);
    expect(suggestion.suggestedUnitPriceCents).toBeLessThan(11_100);
    expect(suggestion.precedents.map((p) => p.variantLabel)).toEqual(
      expect.arrayContaining(["100×100 mm", "120×120 mm"])
    );

    // Pelo material do item também resolve a família.
    const byMaterial = await engineer.query(api.priceEvents.suggestEstimate, {
      materialId: item.materialId!,
      dimensions: { widthMm: 100, heightMm: 100 },
      now: NOW,
    });
    expect(byMaterial.method).toBe("exact");
    expect(byMaterial.suggestedUnitPriceCents).toBe(10_000);
  });

  test("a manual price for a material with dimensions inherits them", async () => {
    const { purchasing } = await seed();
    const takeoffId = await purchasing.mutation(api.takeoffs.create, { name: "T" }).catch(() => null);
    expect(takeoffId).toBeNull(); // só engenharia cria takeoff; o teste segue pelo catálogo

    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Damper",
      unit: "un",
      dimensions: { widthMm: 300, heightMm: 200 },
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId,
      supplierNameRaw: "Oficina",
      unitPriceCents: 25_000,
      source: "manual",
      occurredAt: NOW,
    });
    const events = await purchasing.query(api.priceEvents.list, {
      now: NOW,
      materialId,
    });
    expect(events[0]?.dimensions).toEqual({ widthMm: 300, heightMm: 200 });
  });
});
