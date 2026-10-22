import { describe, expect, it } from "vitest";
import { DEFAULT_DUCT_SETTINGS, ductBill, gaugeName } from "./ducts";

const row = (rows: ReturnType<typeof ductBill>, name: string) => rows.find((r) => r.name === name);

describe("duct take-off (NBR 16401 workbook)", () => {
  it("picks the gauge from the larger side per norma", () => {
    expect(gaugeName(30, 1)).toBe("# 26");
    expect(gaugeName(40, 1)).toBe("# 24");
    expect(gaugeName(141, 1)).toBe("# 20");
    expect(gaugeName(300, 1)).toBe("# 18");
    expect(gaugeName(40, 2)).toBe("# 26");
    expect(gaugeName(100, 2)).toBe("# 22");
    expect(gaugeName(180, 3)).toBe("# 20");
  });

  it("matches the workbook example: 40×25 cm, 3 m, Powermatic, no insulation, norma ABNT", () => {
    const rows = ductBill(
      [
        {
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
      ],
      { ...DEFAULT_DUCT_SETTINGS, norma: 1 },
    );
    // area 1.3 m perimeter × 3 m = 3.9 m² of # 24 → 22.23 kg × 1.20 allowance = 27 kg
    expect(row(rows, "Chapa galvanizada # 24")?.qty).toBe(27);
    expect(row(rows, "Chapa galvanizada # 26")).toBeUndefined();
    // Powermatic PW2 leve: 3 sections × 1.3 m × 2 = 7.8 m × 1.15 = 9 m
    expect(row(rows, "Powermatic (PW2 leve)")?.qty).toBe(9);
    expect(row(rows, "Cantos Powermatic")?.qty).toBe(24);
    expect(row(rows, "Grampo Powermatic")?.qty).toBe(12);
    expect(row(rows, "Rebite")?.qty).toBe(23);
    expect(row(rows, "Fita Adesiva Powermatic")?.qty).toBe(5);
    expect(row(rows, "Suportes de dutos")?.qty).toBe(8);
    // below 500 kg the labour rate doubles
    const mo = row(rows, "Mão de obra - rede de dutos");
    expect(mo?.qty).toBe(27);
    expect(mo?.labor).toBe(36);
    // material total as the workbook's Resumo: 459 + 45 + 20.16 + 12 + 2.3 + 10 + 16
    const material = rows.reduce((t, r) => t + r.qty * r.material, 0);
    expect(Math.round(material)).toBe(564);
  });

  it("adds insulation, tapes and corner sheet for isopor, and rechapeamento", () => {
    const rows = ductBill(
      [
        {
          spec: {
            a: 60,
            b: 40,
            insulation: "I",
            inner: "B",
            flange: "C",
            rechapeado: true,
            paintRechap: true,
          },
          length: 10,
        },
      ],
      { ...DEFAULT_DUCT_SETTINGS, norma: 2 },
    );
    // perimeter 2.0 m × 10 m = 20 m² of # 26 (60 ≤ 70) → 90 kg × 1.2 = 108
    expect(row(rows, "Chapa galvanizada # 26")?.qty).toBe(108);
    expect(row(rows, "Isopor F1")?.qty).toBe(23); // 20 × 1.15
    expect(row(rows, "Bidim OP-60")?.qty).toBe(23);
    expect(row(rows, "Frio Asfalto")?.qty).toBe(0 + Math.round(23 / 80) || undefined);
    expect(row(rows, 'Fita de Nylon ½"')?.qty).toBe(Math.round((10 / 0.5) * 2.2 * 1.2));
    expect(row(rows, 'Fecho p/ fita de nylon ½"')?.qty).toBe(30);
    // cantoneira # 26 for isopor: (0.025 + 0.02) × 10 × 4 × 1.3 = 2.34 m² × 4.5 = 11 kg
    expect(row(rows, "Chapa galvanizada # 26 (cantoneira)")?.qty).toBe(11);
    // rechapeado: ((0.6 + 0.025) + (0.4 + 0.025)) × 2 × 10 = 21 m² × 4.5 = 94.5 → 95 kg
    expect(row(rows, "Chapa galvanizada # 26 (rechapeamento)")?.qty).toBe(95);
    // flange cantoneira: 10 sections × 2.0 × 2 = 40 m × 2.66 × 1.3 = 138 kg
    expect(row(rows, "Flange em Fº Cantoneira")?.qty).toBe(138);
    // paint on the rechapeado: 21 × 1.15 = 24 m² → 1 gl fundo, 2 gl acabamento
    expect(row(rows, "Tinta de fundo - Zarcão")?.qty).toBe(1);
    expect(row(rows, "Tinta Acabamento")?.qty).toBe(2);
    expect(row(rows, "Powermatic (PW2 leve)")).toBeUndefined();
  });
});
