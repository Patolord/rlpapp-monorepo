import { readFileSync } from "node:fs";
import { DEFAULT_DUCT_SETTINGS } from "@rlpapp/shared/engenharia/ducts";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { fillDuctWorkbook } from "./ductSheet";

const template = readFileSync("public/templates/levantamento-dutos.xlsx");

// Parsing and re-writing the real workbook with exceljs takes ~1 s alone, but several seconds
// when Turbo runs every package's tests at once (CI, `turbo run test`), past vitest's default
// 5 s; give this one test room instead of letting it fail under load.
const WORKBOOK_TIMEOUT_MS = 30_000;

describe("reference duct workbook export", () => {
  it("fills header, parameters, runs and prices while keeping the formulas", async () => {
    const bytes = await fillDuctWorkbook(template, {
      client: "CONSTRUTORA X",
      site: "TORRE A",
      system: "PRESSURIZAÇÃO",
      proposalNumber: "26.001",
      settings: { ...DEFAULT_DUCT_SETTINGS, norma: 1, laborPerKg: 20 },
      runs: [
        {
          tag: "1SUB · Hall",
          spec: {
            a: 40,
            b: 25,
            insulation: "S",
            inner: "S",
            flange: "P",
            rechapeado: false,
            paintRechap: false,
          },
          length: 3,
        },
        {
          tag: "1PAV",
          spec: {
            a: 60,
            b: 40,
            insulation: "I",
            inner: "B",
            flange: "C",
            rechapeado: true,
            paintRechap: true,
          },
          length: 12.345,
        },
      ],
      prices: { "Chapa galvanizada # 24": 19.5, "Isopor F1": 7 },
      gaugeKgm2: [4.38, 4.82, 6.82, 8.03, 10.6],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const principal = wb.getWorksheet("Principal");
    const lev = wb.getWorksheet("Levantamento dutos");
    const precos = wb.getWorksheet("Tab_Precos");
    const calc = wb.getWorksheet("Calculos");
    if (!principal || !lev || !precos || !calc) throw new Error("sheets missing");
    expect(principal.getCell("D6").value).toBe("CONSTRUTORA X");
    expect(principal.getCell("D9").value).toBe("26.001");
    expect(principal.getCell("G12").value).toBe(1);
    expect(principal.getCell("G14").value).toBe(20);
    expect(lev.getCell("B13").value).toBe(40);
    expect(lev.getCell("C13").value).toBe(25);
    expect(lev.getCell("D13").value).toBe(3);
    expect(lev.getCell("E13").value).toBe("S = sem isolamento");
    expect(lev.getCell("G13").value).toBe("P = Powermatic");
    expect(lev.getCell("A14").value).toBe("1PAV");
    expect(lev.getCell("D14").value).toBe(12.35);
    expect(lev.getCell("E14").value).toBe("I = Isopor");
    expect(lev.getCell("F14").value).toBe("B = Bidim");
    expect(lev.getCell("G14").value).toBe("C = Cantoneira");
    expect(lev.getCell("H14").value).toBe("S = sim");
    expect(lev.getCell("I14").value).toBe("S = sim");
    expect(precos.getCell("E5").value).toBe(19.5);
    expect(precos.getCell("E14").value).toBe(7);
    // the app's sheet weights replace the template's hardcoded ones
    expect(calc.getCell("C4").value).toBe(4.82);
    expect(calc.getCell("C11").value).toBe("4,82 kg/m²");
    expect((calc.getCell("C303").value as { formula?: string }).formula).toBe("C302*4.82");
    expect((calc.getCell("F303").value as { formula?: string }).formula).toBe("F302*10.6");
    expect(calc.getCell("Q303").value).toBe(4.38);
    expect(calc.getCell("AE303").value).toBe(4.38);
    // formulas survive the round trip
    const b13 = calc.getCell("B13").value as { formula?: string };
    expect(typeof b13 === "object" && b13 && "formula" in b13).toBe(true);
  }, WORKBOOK_TIMEOUT_MS);
});
