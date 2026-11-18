import { describe, expect, test } from "vitest";
import {
  dateInputToInstant,
  minuteCutoff,
  formatSignedPercent,
  fromWeekParam,
  shiftWeekParam,
  supplierTotals,
  toWeekParam,
} from "./quote-weeks";

const brt = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h + 3);

describe("semana na URL", () => {
  test("qualquer dia vira a segunda-feira da semana", () => {
    expect(toWeekParam(brt(2026, 11, 6))).toBe("2026-11-02");
    expect(toWeekParam(brt(2026, 11, 8, 23))).toBe("2026-11-02");
    expect(fromWeekParam("2026-11-05")).toBe(brt(2026, 11, 2, 0));
    expect(fromWeekParam("02/11/2026")).toBeNull();
  });

  test("data da proposta é o início do dia; o corte das consultas, o fim do minuto", () => {
    expect(dateInputToInstant("2026-11-18")).toBe(brt(2026, 11, 18, 0));
    const nineOClock = brt(2026, 11, 18, 9);
    expect(minuteCutoff(nineOClock + 25_000)).toBe(nineOClock + 60_000 - 1);
    expect(minuteCutoff(nineOClock)).toBe(nineOClock + 60_000 - 1);
    // Uma cotação das 15h não passa no corte das 9h.
    expect(brt(2026, 11, 18, 15)).toBeGreaterThan(minuteCutoff(nineOClock));
  });

  test("anda semana a semana", () => {
    expect(shiftWeekParam("2026-11-02", 1)).toBe("2026-11-09");
    expect(shiftWeekParam("2026-11-02", -1)).toBe("2026-10-26");
  });

  test("percentual com sinal", () => {
    expect(formatSignedPercent(0.027)).toBe("+2,7%");
    expect(formatSignedPercent(-0.018)).toBe("−1,8%");
    expect(formatSignedPercent(0)).toBe("0,0%");
  });
});

describe("totais por fornecedor", () => {
  test("compara só os itens que todos cotaram e soma o menor de cada", () => {
    const rows = [
      { quantity: 6, cells: [{ supplierKey: "d", unitPriceCents: 300 }, { supplierKey: "f", unitPriceCents: 310 }] },
      { quantity: 2, cells: [{ supplierKey: "d", unitPriceCents: 400 }] },
      { quantity: 4, cells: [{ supplierKey: "d", unitPriceCents: 100 }, { supplierKey: "f", unitPriceCents: 90 }] },
      // Sem quantidade: alternativa, não entra nos totais.
      { quantity: null, cells: [{ supplierKey: "f", unitPriceCents: 999 }] },
    ];
    const { bySupplier, commonRows, cheapestMixCents } = supplierTotals(rows, ["d", "f"]);
    expect(commonRows).toBe(2);
    expect(bySupplier.get("d")).toEqual({
      quotedCents: 1800 + 800 + 400,
      quotedRows: 3,
      missingRows: 0,
      commonCents: 1800 + 400,
    });
    expect(bySupplier.get("f")).toMatchObject({ missingRows: 1, commonCents: 1860 + 360 });
    expect(cheapestMixCents).toBe(1800 + 800 + 360);
  });
});
