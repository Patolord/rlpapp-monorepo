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
    expect(parseLaborPriceInput("R$ 1.234,56")).toBe(123456);
    expect(parseLaborPriceInput("12")).toBe(1200);
  });

  it("accepts a dot as decimal separator when unambiguous", () => {
    expect(parseLaborPriceInput("45.50")).toBe(4550);
    expect(parseLaborPriceInput("45.5")).toBe(4550);
    // Three digits after the dot: thousands separator, as in pt-BR.
    expect(parseLaborPriceInput("1.234")).toBe(123400);
  });

  it("treats blank as no price and rejects garbage", () => {
    expect(parseLaborPriceInput("  ")).toBeNull();
    expect(() => parseLaborPriceInput("abc")).toThrow("mão de obra");
    expect(() => parseLaborPriceInput("-5")).toThrow("mão de obra");
  });
});
