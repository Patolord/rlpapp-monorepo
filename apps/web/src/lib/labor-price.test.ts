import { describe, expect, it } from "vitest";

import { centsToLaborPriceInput, parseLaborPriceInput } from "./labor-price";

describe("labor price input", () => {
  it("formats cents as reais with a comma", () => {
    expect(centsToLaborPriceInput(4550)).toBe("45,50");
    expect(centsToLaborPriceInput(0)).toBe("0,00");
    expect(centsToLaborPriceInput(null)).toBe("");
    expect(centsToLaborPriceInput(undefined)).toBe("");
  });

  it("parses pt-BR amounts into cents", () => {
    expect(parseLaborPriceInput("45,50")).toBe(4550);
    expect(parseLaborPriceInput("45,5")).toBe(4550);
    expect(parseLaborPriceInput("1234,56")).toBe(123456);
    expect(parseLaborPriceInput("R$ 1.234,56")).toBe(123456);
    expect(parseLaborPriceInput("12")).toBe(1200);
    expect(parseLaborPriceInput("  R$45  ")).toBe(4500);
    // Dots with three digits after them are thousands separators.
    expect(parseLaborPriceInput("1.234")).toBe(123400);
  });

  it("accepts a dot as decimal separator, with or without R$", () => {
    expect(parseLaborPriceInput("45.50")).toBe(4550);
    expect(parseLaborPriceInput("45.5")).toBe(4550);
    expect(parseLaborPriceInput("R$ 45.50")).toBe(4550);
  });

  it("treats blank as no price", () => {
    expect(parseLaborPriceInput("")).toBeNull();
    expect(parseLaborPriceInput("  ")).toBeNull();
  });

  it.each(["45,50,99", "45-50", "abc", "-5", "R$", "45,505", "1.23.4", "12.345.6"])(
    "rejects malformed amount %j",
    (input) => {
      expect(() => parseLaborPriceInput(input)).toThrow(
        "Preço de mão de obra inválido"
      );
    }
  );
});
