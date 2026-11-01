import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import { planSeedLaborPrices } from "../convex/model/procurement/seedLaborPrices";
import { setup } from "./helpers";

const SEED = [
  { name: "Damper Corta Fogo dim. 600x600 mm", laborPrice: 85.5 },
  { name: "Grelha de Retorno", laborPrice: 0 },
  { name: "Isolamento Térmico", laborPrice: 12 },
  // Same normalized name, different labour: ambiguous, never applied.
  { name: "Suporte", laborPrice: 10 },
  { name: "suporte", laborPrice: 11 },
];

describe("planSeedLaborPrices", () => {
  const material = (
    id: string,
    name: string,
    extra: { variantLabel?: string; laborPriceCents?: number } = {}
  ) => ({ _id: id as never, name, ...extra });

  test("matches by normalized family name or family + variant", () => {
    const plan = planSeedLaborPrices(
      [
        material("a", "Damper Corta Fogo", { variantLabel: "dim. 600x600 mm" }),
        material("b", "ISOLAMENTO TERMICO"),
        material("c", "Grelha de retorno"),
        material("d", "Suporte"),
        material("e", "Isolamento Térmico", { laborPriceCents: 900 }),
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
    expect(plan.ambiguous).toEqual(["Suporte"]);
    expect(plan.alreadySet).toBe(1);
  });

  test("overwrite replaces an existing labour price", () => {
    const plan = planSeedLaborPrices(
      [material("e", "Isolamento Térmico", { laborPriceCents: 900 })],
      SEED,
      { overwrite: true }
    );
    expect(plan.matches.map((m) => m.laborPriceCents)).toEqual([1200]);
  });
});

describe("migrations.importSeedLaborPrices", () => {
  test("simulates by default and writes only with dryRun: false", async () => {
    const t = setup();
    const materialId = await t.run((ctx) =>
      ctx.db.insert("materials", {
        name: "Isolamento Térmico",
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
