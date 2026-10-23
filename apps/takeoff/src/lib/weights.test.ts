import { describe, expect, it } from "vitest";
import { emptyProject, type Item } from "./types";
import {
  basePrice,
  derivedMaterialPrice,
  SEED_WEIGHTS,
  syncWeightItems,
  weightCatalogEntries,
} from "./weights";

const line = (over: Partial<Item>): Item => ({
  id: over.id ?? "i",
  name: 'Tubo de cobre 1/2"',
  kind: "linear",
  color: "#000",
  group: "Tubulações",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  ...over,
});

describe("weight-based prices", () => {
  it("ships the supplier's copper table in two price tiers", () => {
    const half = SEED_WEIGHTS.find((r) => r.name === 'Tubo de cobre 1/2"');
    const inch = SEED_WEIGHTS.find((r) => r.name === 'Tubo de cobre 1"');
    expect(half).toMatchObject({ unit: "m", material: "cobre", kgPerUnit: 0.263 });
    expect(inch).toMatchObject({ material: "cobre_grosso", kgPerUnit: 1.06 });
    expect(SEED_WEIGHTS).toHaveLength(14);
  });

  it("derives the unit price from kg per unit and the project's price per kg", () => {
    const project = emptyProject();
    // bundled defaults: R$ 120/kg up to 5/8", R$ 130/kg from 3/4" (the supplier's sheet)
    expect(derivedMaterialPrice({ baseMaterial: "cobre", kgPerUnit: 0.123 }, project)).toBe(14.76);
    expect(derivedMaterialPrice({ baseMaterial: "cobre_grosso", kgPerUnit: 0.776 }, project)).toBe(
      100.88,
    );
    // the project's own price wins
    project.basePrices = { cobre: 100 };
    expect(derivedMaterialPrice({ baseMaterial: "cobre", kgPerUnit: 0.263 }, project)).toBe(26.3);
    // no base price (sheet metal by default) and plain lines are left alone
    expect(basePrice(project, "chapa")).toBeUndefined();
    expect(derivedMaterialPrice({ baseMaterial: "chapa", kgPerUnit: 5 }, project)).toBeUndefined();
    expect(derivedMaterialPrice({}, project)).toBeUndefined();
  });

  it("re-prices every weight line on sync and leaves the rest untouched", () => {
    const project = {
      ...emptyProject(),
      basePrices: { cobre: 120 },
      items: [
        line({ id: "a", baseMaterial: "cobre", kgPerUnit: 0.263, materialPrice: 1 }),
        line({ id: "b", materialPrice: 50, priceSource: "manual" }),
        line({ id: "c", baseMaterial: "chapa", kgPerUnit: 5, materialPrice: 7 }),
      ],
    };
    const synced = syncWeightItems(project, 1_000);
    expect(synced).not.toBe(project);
    expect(synced.items[0]).toMatchObject({
      materialPrice: 31.56,
      priceSource: "weight",
      priceDate: 1_000,
    });
    expect(synced.items[1]).toBe(project.items[1]);
    expect(synced.items[2]).toBe(project.items[2]);
    // already in sync: same project back, no spurious history entry
    expect(syncWeightItems(synced, 2_000)).toBe(synced);
    // a new base price moves the line and dates it
    const repriced = syncWeightItems({ ...synced, basePrices: { cobre: 130 } }, 3_000);
    expect(repriced.items[0]).toMatchObject({ materialPrice: 34.19, priceDate: 3_000 });
  });

  it("turns the weight table into priced catalog entries", () => {
    const entries = weightCatalogEntries(SEED_WEIGHTS, emptyProject());
    expect(entries[2]).toMatchObject({
      name: 'Tubo de cobre 1/2"',
      unit: "m",
      materialPrice: 31.56,
      baseMaterial: "cobre",
      kgPerUnit: 0.263,
      source: "seed",
    });
    expect(weightCatalogEntries(SEED_WEIGHTS)[0].materialPrice).toBe(0);
    expect(weightCatalogEntries([{ ...SEED_WEIGHTS[0], kgPerUnit: 0 }])).toEqual([]);
  });
});
