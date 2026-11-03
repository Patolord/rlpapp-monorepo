import { describe, expect, it } from "vitest";
import { emptyProject, type Item } from "./types";
import {
  basePrice,
  derivedMaterialPrice,
  SEED_WEIGHTS,
  sheetCatalogEntries,
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

  it("derives the unit price from kg per unit and the price per kg", () => {
    // bundled defaults: R$ 120/kg up to 5/8", R$ 130/kg from 3/4" (the supplier's sheet)
    expect(derivedMaterialPrice({ baseMaterial: "cobre", kgPerUnit: 0.123 }, {})).toBe(14.76);
    expect(derivedMaterialPrice({ baseMaterial: "cobre_grosso", kgPerUnit: 0.776 }, {})).toBe(
      100.88,
    );
    expect(derivedMaterialPrice({ baseMaterial: "cobre", kgPerUnit: 0.263 }, undefined)).toBe(
      31.56,
    );
    // the setting wins over the default
    expect(derivedMaterialPrice({ baseMaterial: "cobre", kgPerUnit: 0.263 }, { cobre: 100 })).toBe(
      26.3,
    );
    // no price (sheet metal by default) and plain lines are left alone
    expect(basePrice({}, "chapa")).toBeUndefined();
    expect(derivedMaterialPrice({ baseMaterial: "chapa", kgPerUnit: 5 }, {})).toBeUndefined();
    expect(derivedMaterialPrice({}, {})).toBeUndefined();
  });

  it("re-prices every weight line on sync and leaves the rest untouched", () => {
    const project = {
      ...emptyProject(),
      items: [
        line({ id: "a", baseMaterial: "cobre", kgPerUnit: 0.263, materialPrice: 1 }),
        line({ id: "b", materialPrice: 50, priceSource: "manual" }),
        line({ id: "c", baseMaterial: "chapa", kgPerUnit: 5, materialPrice: 7 }),
      ],
    };
    const synced = syncWeightItems(project, { cobre: 120 }, 1_000);
    expect(synced).not.toBe(project);
    expect(synced.items[0]).toMatchObject({
      materialPrice: 31.56,
      priceSource: "weight",
      priceDate: 1_000,
    });
    expect(synced.items[1]).toBe(project.items[1]);
    expect(synced.items[2]).toBe(project.items[2]);
    // already in sync: same project back, no spurious history entry
    expect(syncWeightItems(synced, { cobre: 120 }, 2_000)).toBe(synced);
    // a new price per kg moves the line and dates it
    const repriced = syncWeightItems(synced, { cobre: 130 }, 3_000);
    expect(repriced.items[0]).toMatchObject({ materialPrice: 34.19, priceDate: 3_000 });
  });

  it("leaves a typed price alone until the line is set back to the weight price", () => {
    const typed = line({
      id: "a",
      baseMaterial: "cobre",
      kgPerUnit: 0.263,
      materialPrice: 40,
      priceSource: "manual",
      priceDate: 500,
    });
    const project = { ...emptyProject(), items: [typed] };
    // the global price is a reference: the override survives any R$/kg change
    expect(syncWeightItems(project, { cobre: 200 }, 1_000)).toBe(project);
    // back to "weight" re-derives from the current R$/kg
    const reset = { ...project, items: [{ ...typed, priceSource: "weight" as const }] };
    expect(syncWeightItems(reset, { cobre: 200 }, 1_000).items[0]).toMatchObject({
      materialPrice: 52.6,
      priceSource: "weight",
      priceDate: 1_000,
    });
  });

  it("turns the weight table into priced catalog entries", () => {
    const entries = weightCatalogEntries(SEED_WEIGHTS, {});
    expect(entries[2]).toMatchObject({
      name: 'Tubo de cobre 1/2"',
      unit: "m",
      materialPrice: 31.56,
      baseMaterial: "cobre",
      kgPerUnit: 0.263,
      source: "seed",
    });
    expect(weightCatalogEntries(SEED_WEIGHTS, { cobre: 100 })[2].materialPrice).toBe(26.3);
    expect(weightCatalogEntries([{ ...SEED_WEIGHTS[0], kgPerUnit: 0 }], {})).toEqual([]);
  });

  it("prices the duct bill's sheet rows through the catalog once a sheet price is set", () => {
    expect(sheetCatalogEntries({})).toEqual([]);
    const entries = sheetCatalogEntries({ chapa: 17.5 });
    expect(entries.map((e) => e.name)).toEqual([
      "Chapa galvanizada # 26",
      "Chapa galvanizada # 24",
      "Chapa galvanizada # 22",
      "Chapa galvanizada # 20",
      "Chapa galvanizada # 18",
      "Chapa galvanizada # 26 (rechapeamento)",
      "Chapa galvanizada # 26 (cantoneira)",
    ]);
    expect(entries.every((e) => e.unit === "kg" && e.materialPrice === 17.5)).toBe(true);
  });
});
