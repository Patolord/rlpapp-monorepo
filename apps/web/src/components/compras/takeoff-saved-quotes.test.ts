import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { type TakeoffSavedQuote, TakeoffSavedQuotes } from "./takeoff-saved-quotes";

const quote = (id: string, supplierName: string, unitPriceCents: number, day: number) =>
  ({
    _id: id,
    supplierName,
    unitPriceCents,
    occurredAt: Date.UTC(2026, 9, day),
    versusEstimate: null,
  }) satisfies TakeoffSavedQuote;

describe("TakeoffSavedQuotes", () => {
  test("lists every saved quote, the cheapest one included even when it is the oldest", () => {
    // newest first, as takeoffs.get returns them
    const quotes = [
      quote("q3", "Fornecedor C", 15000, 20),
      quote("q2", "Fornecedor B", 14000, 10),
      quote("q1", "Fornecedor A", 9000, 1),
    ];
    const html = renderToStaticMarkup(createElement(TakeoffSavedQuotes, { quotes }));
    for (const name of ["Fornecedor C", "Fornecedor B", "Fornecedor A"]) {
      expect(html).toContain(name);
    }
    expect(html).toContain("90,00");
  });

  test("renders nothing without quotes", () => {
    expect(renderToStaticMarkup(createElement(TakeoffSavedQuotes, { quotes: [] }))).toBe("");
  });
});
