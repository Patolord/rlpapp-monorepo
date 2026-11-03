import { describe, expect, test } from "vitest";
import { reaisToCents, unsupportedCurrencyError } from "../src/takeoff/desktopBudget";

describe("reaisToCents", () => {
  test("rounds to whole cents", () => {
    expect(reaisToCents(12.5)).toBe(1250);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(1.005)).toBe(100);
    expect(reaisToCents(1.006)).toBe(101);
    expect(reaisToCents(0)).toBe(0);
  });

  test("treats non-finite values as zero", () => {
    expect(reaisToCents(Number.NaN)).toBe(0);
    expect(reaisToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("unsupportedCurrencyError", () => {
  test("accepts reais or no currency", () => {
    expect(unsupportedCurrencyError("BRL")).toBeNull();
    expect(unsupportedCurrencyError(" brl ")).toBeNull();
    expect(unsupportedCurrencyError(undefined)).toBeNull();
    expect(unsupportedCurrencyError("")).toBeNull();
  });

  test("rejects other currencies with a message for the user", () => {
    expect(unsupportedCurrencyError("usd")).toMatch(/USD.*reais \(BRL\)/);
    expect(unsupportedCurrencyError("EUR")).toMatch(/Mude a moeda do projeto para BRL/);
  });
});
