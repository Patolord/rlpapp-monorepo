import { describe, expect, it } from "vitest";
import { DEFAULT_DUCT_SETTINGS, ductBill, gaugeKgm2, gaugeName } from "../src/engenharia/ducts";

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
    // area 1.3 m perimeter × 3 m = 3.9 m² of # 24 → 18.8 kg (4.82 kg/m²) × 1.20 allowance = 23 kg
    expect(row(rows, "Chapa galvanizada # 24")?.qty).toBe(23);
    expect(row(rows, "Chapa galvanizada # 26")).toBeUndefined();
    // Powermatic PW2 leve: 3 sections × 1.3 m × 2 = 7.8 m × 1.15 = 9 m
    expect(row(rows, "Powermatic (PW2 leve)")?.qty).toBe(9);
    expect(row(rows, "Cantos Powermatic")?.qty).toBe(24);
    expect(row(rows, "Grampo Powermatic")?.qty).toBe(12);
    expect(row(rows, "Rebite")?.qty).toBe(23);
    expect(row(rows, "Fita Adesiva Powermatic")?.qty).toBe(5);
    expect(row(rows, "Suportes de dutos")?.qty).toBe(7); // 30 % of 23 kg
    // below 500 kg the labour rate doubles
    const mo = row(rows, "Mão de obra - rede de dutos");
    expect(mo?.qty).toBe(23);
    expect(mo?.labor).toBe(36);
    // material total like the workbook's Resumo, with the supplier's sheet weight:
    // 23 kg × 17 = 391 + 45 + 20.16 + 12 + 2.3 + 10 + 14 (supports)
    const material = rows.reduce((t, r) => t + r.qty * r.material, 0);
    expect(Math.round(material)).toBe(494);
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
    // perimeter 2.0 m × 10 m = 20 m² of # 26 (60 ≤ 70) → 87.6 kg (4.38 kg/m²) × 1.2 = 105
    expect(row(rows, "Chapa galvanizada # 26")?.qty).toBe(105);
    expect(row(rows, "Isopor F1")?.qty).toBe(23); // 20 × 1.15
    expect(row(rows, "Bidim OP-60")?.qty).toBe(23);
    expect(row(rows, "Frio Asfalto")?.qty).toBe(0 + Math.round(23 / 80) || undefined);
    expect(row(rows, 'Fita de Nylon ½"')?.qty).toBe(Math.round((10 / 0.5) * 2.2 * 1.2));
    expect(row(rows, 'Fecho p/ fita de nylon ½"')?.qty).toBe(30);
    // cantoneira # 26 for isopor: (0.025 + 0.02) × 10 × 4 × 1.3 = 2.34 m² × 4.38 = 10 kg
    expect(row(rows, "Chapa galvanizada # 26 (cantoneira)")?.qty).toBe(10);
    // rechapeado: ((0.6 + 0.025) + (0.4 + 0.025)) × 2 × 10 = 21 m² × 4.38 = 91.98 → 92 kg
    expect(row(rows, "Chapa galvanizada # 26 (rechapeamento)")?.qty).toBe(92);
    // flange cantoneira: 10 sections × 2.0 × 2 = 40 m × 2.66 × 1.3 = 138 kg
    expect(row(rows, "Flange em Fº Cantoneira")?.qty).toBe(138);
    // paint on the rechapeado: 21 × 1.15 = 24 m² → 1 gl fundo, 2 gl acabamento
    expect(row(rows, "Tinta de fundo - Zarcão")?.qty).toBe(1);
    expect(row(rows, "Tinta Acabamento")?.qty).toBe(2);
    expect(row(rows, "Powermatic (PW2 leve)")).toBeUndefined();
  });

  it("uses the edited sheet weights per gauge, falling back to the supplier's", () => {
    expect(gaugeKgm2()).toEqual([4.38, 4.82, 6.82, 8.03, 10.6]);
    expect(gaugeKgm2({ "# 24": 5.7, "# 22": 0 })).toEqual([4.38, 5.7, 6.82, 8.03, 10.6]);
    const spec = {
      insulation: "S",
      inner: "S",
      flange: "S",
      rechapeado: true,
      paintRechap: false,
    } as const;
    const rows = ductBill(
      [
        { spec: { ...spec, a: 40, b: 25 }, length: 3 },
        { spec: { ...spec, a: 30, b: 20, rechapeado: false }, length: 10 },
      ],
      { ...DEFAULT_DUCT_SETTINGS, norma: 1 },
      { "# 26": 4.5, "# 24": 5.7 },
    );
    // 3.9 m² of # 24 × 5.7 kg/m² × 1.2 = 26.7 → 27 kg (was 23 with 4.82)
    expect(row(rows, "Chapa galvanizada # 24")?.qty).toBe(27);
    // 10 m² of # 26 × 4.5 × 1.2 = 54 kg
    expect(row(rows, "Chapa galvanizada # 26")?.qty).toBe(54);
    // rechapeamento is # 26 sheet: ((0.4 + 0.025) + (0.25 + 0.025)) × 2 × 3 = 4.2 m² × 4.5 = 19 kg
    expect(row(rows, "Chapa galvanizada # 26 (rechapeamento)")?.qty).toBe(19);
    expect(row(rows, "Mão de obra - rede de dutos")?.qty).toBe(27 + 54 + 19);
  });
});
