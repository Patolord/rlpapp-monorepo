import { describe, expect, test } from "vitest";
import {
  computeDuctEstimate,
  defaultDuctEstimateInput,
  emptyDuctLine,
  selectGauge,
  type DuctLineInput,
} from "../src/engenharia/nbr16401";

function exampleLine(
  overrides: Partial<DuctLineInput> = {}
): DuctLineInput {
  return {
    ...emptyDuctLine(),
    largerSideCm: 40,
    smallerSideCm: 25,
    lengthM: 3,
    flange: "powermatic",
    ...overrides,
  };
}

describe("selectGauge", () => {
  test("ABNT bands follow the spreadsheet limits", () => {
    expect(selectGauge(30, 1)).toBe("26");
    expect(selectGauge(31, 1)).toBe("24");
    expect(selectGauge(75, 1)).toBe("24");
    expect(selectGauge(76, 1)).toBe("22");
    expect(selectGauge(140, 1)).toBe("22");
    expect(selectGauge(141, 1)).toBe("20");
    expect(selectGauge(210, 1)).toBe("20");
    expect(selectGauge(211, 1)).toBe("18");
  });

  test("ABNT v.2008 and TR use their own limits", () => {
    expect(selectGauge(70, 2)).toBe("26");
    expect(selectGauge(71, 2)).toBe("24");
    expect(selectGauge(90, 3)).toBe("26");
    expect(selectGauge(91, 3)).toBe("24");
  });
});

describe("computeDuctEstimate", () => {
  test("golden: 40x25cm x 3m Powermatic matches the spreadsheet example", () => {
    const result = computeDuctEstimate({
      ...defaultDuctEstimateInput(),
      lines: [exampleLine()],
    });

    expect(result.lines[0]?.gauge).toBe("24");
    expect(result.lines[0]?.areaM2).toBeCloseTo(3.9, 8);
    expect(result.rawSheetKg).toBeCloseTo(22.23, 8);
    expect(result.sheetAllowancePct).toBe(20);
    expect(result.sheetKg).toBe(27);

    const byKey = Object.fromEntries(result.bom.map((row) => [row.key, row]));
    expect(byKey.sheet24?.quantity).toBe(27);
    expect(byKey.sheet24?.total).toBe(459);
    expect(byKey.pw2Light?.quantity).toBe(9);
    expect(byKey.pw2Light?.total).toBe(45);
    expect(byKey.pwCorners?.quantity).toBe(24);
    expect(byKey.pwCorners?.total).toBeCloseTo(20.16, 8);
    expect(byKey.pwClamps?.quantity).toBe(12);
    expect(byKey.pwClamps?.total).toBe(12);
    expect(byKey.rivets?.quantity).toBe(23);
    expect(byKey.rivets?.total).toBeCloseTo(2.3, 8);
    expect(byKey.pwTape?.quantity).toBe(5);
    expect(byKey.pwTape?.total).toBe(10);
    expect(byKey.supports?.quantity).toBe(8);
    expect(byKey.supports?.total).toBe(16);

    expect(result.materialTotal).toBe(564);
    expect(result.laborTotal).toBe(972);
    expect(result.grandTotal).toBe(1536);
    expect(result.materialPerKg).toBeCloseTo(20.89, 2);
    expect(result.laborPerKg).toBe(36);
  });

  test("manta isolation produces insulation and tape quantities", () => {
    const result = computeDuctEstimate({
      ...defaultDuctEstimateInput(),
      lines: [exampleLine({ externalInsulation: "manta" })],
    });
    const byKey = Object.fromEntries(result.bom.map((row) => [row.key, row]));
    expect(byKey.manta?.quantity).toBeGreaterThan(0);
    expect(byKey.nylonTape?.quantity).toBeGreaterThan(0);
    expect(byKey.nylonClip?.quantity).toBeGreaterThan(0);
    expect(byKey.alumTape?.quantity).toBeGreaterThan(0);
    expect(byKey.isopor?.quantity).toBe(0);
  });

  test("labor is not doubled at 500 kg or above", () => {
    const long = exampleLine({ lengthM: 80 });
    const under = computeDuctEstimate({
      ...defaultDuctEstimateInput(),
      lines: [exampleLine({ lengthM: 50 })],
    });
    const over = computeDuctEstimate({
      ...defaultDuctEstimateInput(),
      lines: [long, long, long, long],
    });
    expect(under.sheetKg).toBeLessThan(500);
    expect(under.laborTotal).toBe(under.sheetKg * 18 * 2);
    expect(over.sheetKg).toBeGreaterThanOrEqual(500);
    expect(over.laborTotal).toBe(over.sheetKg * 18);
  });
});
