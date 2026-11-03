import { describe, expect, test } from "vitest";
import {
  cloneBrand,
  isDiameter,
  normalizeBrand,
  sameBrand,
  SEED_BRANDS,
  workbookTables,
} from "../src/takeoff/vrfBrands";

describe("workbook VRF brands", () => {
  test("ship Daikin and Hitachi with the workbook tables and known diameters", () => {
    expect(SEED_BRANDS.map((b) => b.id)).toEqual(["daikin", "hitachi"]);
    for (const b of SEED_BRANDS) {
      for (const role of ["main", "trunk", "branch"] as const) {
        expect(b[role].length).toBeGreaterThan(0);
        for (const r of b[role]) {
          expect(isDiameter(r.gas)).toBe(true);
          expect(isDiameter(r.liquid)).toBe(true);
        }
      }
      expect(b.ykit.length).toBeGreaterThan(0);
    }
    expect(workbookTables().main).toEqual(SEED_BRANDS[0].main);
    expect(isDiameter("9/9")).toBe(false);
  });

  test("brands compare on sorted tables and trimmed texts", () => {
    const [daikin] = SEED_BRANDS;
    const shuffled = { ...daikin, name: " Daikin ", main: [...daikin.main].reverse() };
    expect(sameBrand(daikin, shuffled)).toBe(true);
    expect(normalizeBrand(shuffled).main).toEqual(daikin.main);
    expect(sameBrand(daikin, { ...daikin, ykit: [] })).toBe(false);
    const copy = cloneBrand(daikin);
    copy.main[0].hp = 99;
    expect(daikin.main[0].hp).toBe(0);
  });
});
