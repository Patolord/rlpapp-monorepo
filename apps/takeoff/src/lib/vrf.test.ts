import { describe, expect, it } from "vitest";
import {
  DEFAULT_VRF_SETTINGS,
  LABOR_ROW,
  SEED_BRANDS,
  sizeRun,
  type VrfRun,
  vrfBill,
  vrfTotals,
  ykitModel,
} from "./vrf";

const daikin = SEED_BRANDS[0];
const row = (rows: ReturnType<typeof vrfBill>["rows"], name: string) =>
  rows.find((r) => r.name === name);

describe("VRF take-off (Levantamento VRF Completo workbook)", () => {
  it("sizes runs by role and HP like the Cálculos lookups", () => {
    expect(sizeRun(daikin, "main", 22)).toEqual({ gas: "1.1/8", liquid: "5/8" });
    expect(sizeRun(daikin, "main", 14)).toEqual({ gas: "1", liquid: "1/2" });
    expect(sizeRun(daikin, "main", 4)).toEqual({ gas: "3/4", liquid: "3/8" });
    expect(sizeRun(daikin, "branch", 1.25)).toEqual({ gas: "1/2", liquid: "1/4" });
    expect(sizeRun(daikin, "branch", 4)).toEqual({ gas: "5/8", liquid: "3/8" });
    expect(sizeRun(daikin, "branch", 5)).toEqual({ gas: "5/8", liquid: "3/8" });
    // a blank downstream capacity falls on the first row, as the workbook's empty cells do
    expect(sizeRun(daikin, "trunk", 0)).toEqual({ gas: "5/8", liquid: "3/8" });
    expect(sizeRun(daikin, "trunk", 12)).toEqual({ gas: "1", liquid: "1/2" });
    expect(ykitModel(daikin, 22)).toBe("KHRP26A72T");
    expect(ykitModel(daikin, 3)).toBe("KHRP26A22T");
  });

  it("matches Sistema 1 of the workbook: 22 HP, six evaporators", () => {
    const run = (role: VrfRun["spec"]["role"], hp: number, length: number, curves = 0): VrfRun => ({
      spec: { role, hp, curves },
      length,
    });
    const runs: VrfRun[] = [
      run("main", 22, 8.5 + 3, 2),
      run("branch", 1.25, 2, 1),
      run("trunk", 0, 2),
      run("branch", 1.6, 2),
      run("trunk", 0, 2),
      run("branch", 1.6, 3),
      run("branch", 4, 4, 2),
      run("trunk", 0, 2.5),
      run("branch", 1.25, 2),
      run("trunk", 0, 2),
      run("branch", 1, 2),
    ];
    const { rows, summary } = vrfBill(runs, daikin, 22);
    // Cálculos F3:F16 — lengths with 10 % rounded up
    expect(row(rows, 'Cobre de 1/4"')?.qty).toBe(13);
    expect(row(rows, 'Cobre de 3/8"')?.qty).toBe(14);
    expect(row(rows, 'Cobre de 1/2"')?.qty).toBe(13);
    expect(row(rows, 'Cobre de 5/8"')?.qty).toBe(27);
    expect(row(rows, 'Cobre de 1.1/8"')?.qty).toBe(13);
    expect(row(rows, 'Cobre de 3/4"')).toBeUndefined();
    // Cálculos G4:G16 — elbows with 10 %, none for 1/4"
    expect(row(rows, 'Joelho de Cobre de 1/4"')).toBeUndefined();
    expect(row(rows, 'Joelho de Cobre de 3/8"')?.qty).toBe(3);
    expect(row(rows, 'Joelho de Cobre de 1/2"')?.qty).toBe(2);
    expect(row(rows, 'Joelho de Cobre de 5/8"')?.qty).toBe(5);
    expect(row(rows, 'Joelho de Cobre de 1.1/8"')?.qty).toBe(3);
    // insulation follows the copper; cable is half the copper (Resultados D47)
    expect(row(rows, 'Isolamento de 5/8" - Espessura 13 mm')?.qty).toBe(27);
    expect(row(rows, "Cabo PP 3 x 2,5mm²")?.qty).toBe(40);
    expect(row(rows, "Cabo Shield 2 x 1,5mm²")?.qty).toBe(40);
    expect(summary.evaporators).toBe(6);
    expect(summary.condensers).toBe(1);
    expect(row(rows, "Caixa Polar de Evaporadora")?.qty).toBe(6);
    expect(row(rows, "Suporte da Evaporadora")?.qty).toBe(6);
    expect(row(rows, "Suporte da Condensadora VRF")?.qty).toBe(1);
    const labor = row(rows, LABOR_ROW);
    expect(labor?.qty).toBe(6);
    expect(labor?.labor).toBe(DEFAULT_VRF_SETTINGS.laborPerEvap);
    // five Y-kits (six evaporators): the first sized by 22 HP, the others by the trunks (0 HP)
    expect(summary.ykits).toEqual([
      { model: "KHRP26A72T", hp: 22, qty: 1 },
      { model: "KHRP26A22T", hp: 0, qty: 4 },
    ]);
    const totals = vrfTotals(rows, (r) => r.material);
    expect(totals.labor).toBe(4200);
    // elbows 3 + 3.4 + 13.5 + 27.3 · insulation 41.6 + 50.4 + 49.4 + 110.7 + 24.7 · cables
    // 128 + 80 · boxes 156 · supports 300 + 70 (copper has no workbook price: by weight)
    expect(totals.material).toBeCloseTo(47.2 + 276.8 + 128 + 80 + 156 + 300 + 70, 2);
  });

  it("applies the allowance and elbow threshold from the settings", () => {
    const { rows } = vrfBill(
      [{ spec: { role: "branch", hp: 1, curves: 2 }, length: 10 }],
      daikin,
      4,
      { ...DEFAULT_VRF_SETTINGS, slackPct: 0, elbowsFrom: "1/4" },
    );
    expect(row(rows, 'Cobre de 1/2"')?.qty).toBe(10);
    expect(row(rows, 'Joelho de Cobre de 1/4"')?.qty).toBe(2);
    expect(row(rows, 'Joelho de Cobre de 1/2"')?.qty).toBe(2);
  });

  it("is empty without runs", () => {
    const { rows, summary } = vrfBill([], daikin, 8);
    expect(rows).toEqual([]);
    expect(summary.evaporators).toBe(0);
  });
});

describe("VRF bill from the system tree", () => {
  const geo = (
    id: string,
    role: "main" | "trunk" | "branch",
    hp: number,
    points: { x: number; y: number }[],
  ): VrfRun => ({
    id,
    spec: { role, hp, curves: 0 },
    length: 10,
    drawingId: "d",
    page: 0,
    points,
  });

  it("sizes intermediate runs and Y-kits by the capacity connected downstream", () => {
    const runs = [
      geo("main", "main", 0, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      geo("trunk", "trunk", 99, [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ]),
      geo("a", "branch", 2, [
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
      geo("b", "branch", 3, [
        { x: 200, y: 0 },
        { x: 200, y: 50 },
      ]),
      geo("c", "branch", 1.5, [
        { x: 200, y: 0 },
        { x: 250, y: 0 },
      ]),
    ];
    const { sized, summary } = vrfBill(runs, daikin, 22);
    const trunk = sized.find((r) => r.id === "trunk");
    // the typed 99 HP gives way to b + c
    expect(trunk?.hp).toBe(4.5);
    expect(trunk?.derivedHp).toBe(true);
    expect(trunk?.gas).toBe("5/8");
    expect(summary.ykitsFromTree).toBe(true);
    // one kit per fork: 6.5 HP connected at the first, 4.5 HP at the second
    expect(summary.ykits).toEqual([{ model: "KHRP26A22T", hp: 4.5, qty: 2 }]);
  });

  it("falls back to the count rule while a ramal is not connected", () => {
    const runs = [
      geo("main", "main", 0, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      geo("a", "branch", 2, [
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
      geo("apart", "branch", 3, [
        { x: 500, y: 0 },
        { x: 500, y: 50 },
      ]),
    ];
    const { sized, summary } = vrfBill(runs, daikin, 22);
    expect(summary.ykitsFromTree).toBe(false);
    expect(summary.ykits).toEqual([{ model: "KHRP26A72T", hp: 22, qty: 1 }]);
    expect(sized.every((r) => !r.derivedHp)).toBe(true);
  });
});
