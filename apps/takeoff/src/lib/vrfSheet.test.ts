import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { emptyProject, type Project } from "./types";
import { SEED_BRANDS } from "./vrf";
import { newVrfSystem, syncVrfItems, vrfBillFor } from "./vrfItems";
import { buildVrfWorkbook } from "./vrfSheet";

/** A takeoff with one calibrated page and a 22 HP system: main run + two evaporators. */
function project(): Project {
  const p: Project = {
    ...emptyProject(),
    drawings: [
      {
        id: "d1",
        path: null,
        name: "Planta.pdf",
        pages: [{ scale: { label: "1:50", pointsPerUnit: 100, unit: "m" } }],
      },
    ],
    activeDrawingId: "d1",
  };
  const sys = newVrfSystem(p, "daikin", { name: "Sistema 1", hp: 22 });
  p.items.push(sys);
  const run = (id: string, role: "main" | "trunk" | "branch", hp: number, m: number) =>
    p.measurements.push({
      id,
      itemId: sys.id,
      drawingId: "d1",
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: m * 100, y: 0 },
      ],
      vrf: { role, hp, curves: 1 },
    });
  run("m1", "main", 22, 10);
  run("m2", "branch", 2, 3);
  run("m3", "branch", 4, 5);
  return p;
}

const pricing = { catalog: [], weights: [], basePrices: {} };

describe("VRF systems in a takeoff", () => {
  it("prices the system item from its runs (1 cj per identical system)", () => {
    const p = syncVrfItems(
      project(),
      () => pricing,
      () => SEED_BRANDS,
    );
    const item = p.items[0];
    const bill = vrfBillFor(p, pricing, SEED_BRANDS, item);
    expect(bill.summary.evaporators).toBe(2);
    // the three runs meet at the origin: one fork with 2 + 4 HP connected below it
    expect(bill.summary.ykitsFromTree).toBe(true);
    expect(bill.summary.ykits).toEqual([{ model: "KHRP26A22T", hp: 6, qty: 1 }]);
    expect(item.materialPrice).toBe(bill.totals.material);
    expect(item.laborPrice).toBe(2 * 700);
    expect(item.manualQty).toBe(1);
  });

  it("writes Cálculos, Resultados and Regras sheets", async () => {
    const p = project();
    const bytes = await buildVrfWorkbook(p, pricing, SEED_BRANDS);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const calc = wb.getWorksheet("Cálculos");
    const res = wb.getWorksheet("Resultados");
    expect(calc).toBeDefined();
    expect(res).toBeDefined();
    expect(wb.getWorksheet("Regras")).toBeDefined();
    if (!calc || !res) return;
    expect(String(calc.getCell("A1").value)).toContain("Sistema 1");
    // first run row: main, 22 HP, 10 m, 1.1/8" gas, 5/8" liquid
    expect(calc.getCell("C3").value).toBe("Saída da condensadora");
    expect(calc.getCell("D3").value).toBe(22);
    expect(calc.getCell("H3").value).toBe('1.1/8"');
    expect(calc.getCell("I3").value).toBe('5/8"');
    // Resultados: copper 1.1/8" = 10 m × 1.1 = 11 m
    const names: string[] = [];
    res.eachRow((row) => names.push(String(row.getCell(2).value ?? "")));
    expect(names).toContain('Cobre de 1.1/8"');
    const copperRow = res.findRow(names.indexOf('Cobre de 1.1/8"') + 1);
    expect(copperRow?.getCell(4).value).toBe(11);
  });
});
