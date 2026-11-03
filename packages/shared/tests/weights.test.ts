import { describe, expect, test } from "vitest";
import {
  BASE_MATERIALS,
  basePrice,
  isBaseMaterialKey,
  normalizeWeightRow,
  sameWeightRow,
  SEED_WEIGHTS,
  weightKey,
} from "../src/takeoff/weights";

describe("supplier weight table", () => {
  test("every row names a known base material with a positive weight, no duplicates", () => {
    const keys = new Set<string>();
    for (const row of SEED_WEIGHTS) {
      expect(isBaseMaterialKey(row.material)).toBe(true);
      expect(row.kgPerUnit).toBeGreaterThan(0);
      expect(keys.has(weightKey(row))).toBe(false);
      keys.add(weightKey(row));
    }
    expect(SEED_WEIGHTS.find((r) => r.name === 'Tubo de cobre 3/4"')?.material).toBe("cobre_grosso");
  });

  test("basePrice falls back to the bundled default, and sheet metal has none", () => {
    expect(basePrice(undefined, "cobre")).toBe(120);
    expect(basePrice({ cobre: 125 }, "cobre")).toBe(125);
    expect(basePrice({}, "chapa")).toBeUndefined();
    expect(basePrice({ chapa: 9 }, "chapa")).toBe(9);
    expect(BASE_MATERIALS.map((m) => m.key)).toEqual(["cobre", "cobre_grosso", "chapa"]);
  });

  test("rows compare by trimmed name and group, with the copper group as default", () => {
    const row = { name: 'Tubo de cobre 1/2"', group: "Tubulações", unit: "m" as const, material: "cobre", kgPerUnit: 0.263 };
    expect(sameWeightRow(row, { ...row, name: " Tubo de cobre 1/2\" ", group: "" })).toBe(true);
    expect(sameWeightRow(row, { ...row, kgPerUnit: 0.3 })).toBe(false);
    expect(normalizeWeightRow({ ...row, group: " " }).group).toBe("Tubulações");
    expect(weightKey({ name: " Isolação " })).toBe("isolacao");
  });
});
