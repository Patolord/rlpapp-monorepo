import { describe, expect, it } from "vitest";
import { parseRemoteCatalogResponse } from "./catalog";
import {
  describeReferenceStatus,
  offReference,
  parsePriceReference,
  signedPercent,
} from "./priceReference";

const ref = {
  price: 3020,
  minPrice: 2890,
  maxPrice: 3120,
  spread: 0.076,
  count: 6,
  supplierCount: 3,
  monthlyChange: 0.01,
  lastAt: 1_762_000_000_000,
  status: "ok",
};

describe("price reference", () => {
  it("parses the reference the company catalog publishes", () => {
    expect(parsePriceReference(ref)).toEqual(ref);
    expect(parsePriceReference({ ...ref, monthlyChange: null })?.monthlyChange).toBeUndefined();
    expect(parsePriceReference(null)).toBeUndefined();
    expect(parsePriceReference({ price: 0, lastAt: 1 })).toBeUndefined();
  });

  it("reaches the catalog entry", () => {
    const { entries } = parseRemoteCatalogResponse({
      items: [
        { id: "m1", name: "Split 9.000", materialPrice: 3050, reference: ref },
        { id: "m2", name: "Grelha", materialPrice: 80, reference: null },
      ],
    });
    expect(entries[0].reference?.price).toBe(3020);
    expect(entries[1].reference).toBeUndefined();
  });

  it("describes the status and the distance of a line price", () => {
    expect(describeReferenceStatus(parsePriceReference(ref)!)).toMatch(/sem cotar de novo/);
    expect(describeReferenceStatus({ ...parsePriceReference(ref)!, status: "stale" })).toMatch(
      /90 dias/,
    );
    expect(signedPercent(-0.238)).toBe("−23,8%");
    expect(offReference(3050, parsePriceReference(ref)!)).toBeCloseTo(0.0099, 3);
    expect(offReference(3025, parsePriceReference(ref)!)).toBeNull();
    expect(offReference(0, parsePriceReference(ref)!)).toBeNull();
  });
});
