import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import {
  laborUnitKey,
  planSeedLaborPrices,
} from "../convex/model/procurement/seedLaborPrices";
import { setup } from "./helpers";

const SEED = [
  { name: "Damper Corta Fogo dim. 600x600 mm", unit: "pç", laborPrice: 85.5 },
  { name: "Grelha de Retorno", unit: "pç", laborPrice: 0 },
  { name: "Isolamento Térmico", unit: "m", laborPrice: 12 },
  // Same normalized name and unit, different labour: ambiguous, never applied.
  { name: "Suporte", unit: "pç", laborPrice: 10 },
  { name: "suporte", unit: "un", laborPrice: 11 },
  { name: "Rede de Dutos Flexiveis 150 mm", unit: "m", laborPrice: 70 },
];

describe("planSeedLaborPrices", () => {
  const material = (
    id: string,
    name: string,
    extra: { variantLabel?: string; unit?: string; laborPriceCents?: number } = {}
  ) => ({ _id: id as never, name, ...extra });

  test("laborUnitKey folds unit synonyms", () => {
    for (const unit of [
      "un",
      "und",
      "unid",
      "pç",
      "pc",
      "peça",
      "PEÇAS",
      " Unidade ",
      undefined,
    ]) {
      expect(laborUnitKey(unit)).toBe(laborUnitKey("pç"));
    }
    for (const unit of ["metro", "metros", "mt", "ml", "M"]) {
      expect(laborUnitKey(unit)).toBe(laborUnitKey("m"));
    }
    expect(laborUnitKey("m2")).toBe(laborUnitKey("m²"));
    expect(laborUnitKey("conjunto")).toBe(laborUnitKey("cj"));
    expect(laborUnitKey("KG")).toBe(laborUnitKey("kg"));
    expect(laborUnitKey("rolo")).not.toBe(laborUnitKey("m"));
    expect(laborUnitKey("m")).not.toBe(laborUnitKey("m²"));
  });

  test("matches by normalized family name or family + variant", () => {
    const plan = planSeedLaborPrices(
      [
        material("a", "Damper Corta Fogo", {
          variantLabel: "dim. 600x600 mm",
          unit: "un",
        }),
        material("b", "ISOLAMENTO TERMICO", { unit: "metro" }),
        material("c", "Grelha de retorno"),
        material("d", "Suporte"),
        material("e", "Isolamento Térmico", {
          unit: "m",
          laborPriceCents: 900,
        }),
        // Same name, priced per roll: R$ 70/m must not become R$ 70/rolo.
        material("f", "Rede de Dutos Flexíveis 150 mm", { unit: "rolo" }),
      ],
      SEED
    );
    expect(plan.matches).toEqual([
      {
        materialId: "a",
        materialName: "Damper Corta Fogo — dim. 600x600 mm",
        seedName: "Damper Corta Fogo dim. 600x600 mm",
        laborPriceCents: 8550,
      },
      {
        materialId: "b",
        materialName: "ISOLAMENTO TERMICO",
        seedName: "Isolamento Térmico",
        laborPriceCents: 1200,
      },
    ]);
    expect(plan.ambiguous).toEqual(["Suporte (pç)"]);
    expect(plan.alreadySet).toBe(1);
    expect(plan.skippedUnitMismatch).toEqual([
      {
        materialId: "f",
        materialName: "Rede de Dutos Flexíveis 150 mm",
        materialUnit: "rolo",
        seedName: "Rede de Dutos Flexiveis 150 mm",
        seedUnits: ["m"],
      },
    ]);
  });

  test("units the desktop treats as equal also match in the import", () => {
    const plan = planSeedLaborPrices(
      [
        material("g", "Rede de Dutos Flexíveis 150 mm", { unit: "mt" }),
        material("h", "Damper Corta Fogo dim. 600x600 mm", { unit: "und" }),
      ],
      SEED
    );
    expect(plan.skippedUnitMismatch).toEqual([]);
    expect(plan.matches.map((m) => [m.materialId, m.laborPriceCents])).toEqual([
      ["g", 7000],
      ["h", 8550],
    ]);
  });

  test("overwrite replaces an existing labour price", () => {
    const plan = planSeedLaborPrices(
      [
        material("e", "Isolamento Térmico", {
          unit: "m",
          laborPriceCents: 900,
        }),
      ],
      SEED,
      { overwrite: true }
    );
    expect(plan.matches.map((m) => m.laborPriceCents)).toEqual([1200]);
  });
});

describe("migrations.importSeedLaborPrices", () => {
  test("reports a unit mismatch in the dry run and never writes it", async () => {
    const t = setup();
    const materialId = await t.run((ctx) =>
      ctx.db.insert("materials", {
        name: "Rede de Dutos Flexiveis 150 mm",
        unit: "rolo",
        active: true,
        createdAt: 0,
      })
    );
    const result = await t.mutation(
      internal.migrations.importSeedLaborPrices,
      { entries: SEED, dryRun: false }
    );
    expect(result).toMatchObject({ updated: 0, matches: [] });
    expect(result.skippedUnitMismatch).toEqual([
      expect.objectContaining({ materialId, materialUnit: "rolo", seedUnits: ["m"] }),
    ]);
    const untouched = await t.run((ctx) => ctx.db.get("materials", materialId));
    expect(untouched?.laborPriceCents).toBeUndefined();
  });

  test("simulates by default and writes only with dryRun: false", async () => {
    const t = setup();
    const materialId = await t.run((ctx) =>
      ctx.db.insert("materials", {
        name: "Isolamento Térmico",
        unit: "m",
        active: true,
        createdAt: 0,
      })
    );

    const dry = await t.mutation(internal.migrations.importSeedLaborPrices, {
      entries: SEED,
    });
    expect(dry).toMatchObject({ dryRun: true, updated: 0 });
    expect(dry.matches).toHaveLength(1);
    const untouched = await t.run((ctx) => ctx.db.get("materials", materialId));
    expect(untouched?.laborPriceCents).toBeUndefined();

    const applied = await t.mutation(
      internal.migrations.importSeedLaborPrices,
      { entries: SEED, dryRun: false }
    );
    expect(applied).toMatchObject({ dryRun: false, updated: 1 });
    const updated = await t.run((ctx) => ctx.db.get("materials", materialId));
    expect(updated?.laborPriceCents).toBe(1200);
    expect(updated?.laborPriceUpdatedAt).toEqual(expect.any(Number));

    // Idempotent: a second run finds the price already set.
    const again = await t.mutation(internal.migrations.importSeedLaborPrices, {
      entries: SEED,
      dryRun: false,
    });
    expect(again).toMatchObject({ updated: 0, alreadySet: 1 });
  });
});
