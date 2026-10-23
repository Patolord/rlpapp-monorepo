import { describe, expect, it } from "vitest";
import {
  applyRedirects,
  buildProposal,
  catalogUrl,
  DEFAULT_CATALOG_URL,
  describeHttpFailure,
  proposalsUrl,
} from "./catalogRemote";
import { emptyProject, type Item } from "./types";

const item = (over: Partial<Item> = {}): Item => ({
  id: "i1",
  name: "Grelha de Insuflamento 400x400",
  kind: "count",
  color: "#000",
  group: "Bocas de Ar",
  materialPrice: 120.5,
  laborPrice: 0,
  wastePct: 0,
  ...over,
});

describe("company catalog URLs", () => {
  it("falls back to the production catalog when no URL is configured", () => {
    expect(catalogUrl("")).toBe(DEFAULT_CATALOG_URL);
    expect(catalogUrl("  ")).toBe(DEFAULT_CATALOG_URL);
    expect(catalogUrl("https://dusty-ferret-162.convex.site/takeoff/catalog")).toBe(
      "https://dusty-ferret-162.convex.site/takeoff/catalog",
    );
  });

  it("derives the proposals route from the catalog route", () => {
    expect(proposalsUrl("")).toBe("https://rosy-crow-250.convex.site/takeoff/materials");
    expect(proposalsUrl("https://x.convex.site/takeoff/catalog")).toBe(
      "https://x.convex.site/takeoff/materials",
    );
    expect(proposalsUrl("https://x.example/custom/catalog.json")).toBe(
      "https://x.example/takeoff/materials",
    );
  });

  it("explains the common failures in the user's terms", () => {
    expect(describeHttpFailure(401, "")).toMatch(/token/i);
    expect(describeHttpFailure(503, "")).toMatch(/servidor/i);
    expect(describeHttpFailure(400, '{"error":"\\"name\\" is required"}')).toBe(
      'HTTP 400: "name" is required',
    );
    expect(describeHttpFailure(500, "<html>")).toBe("HTTP 500");
  });
});

describe("material proposals", () => {
  const project = { ...emptyProject(), name: "Hospital", estimator: "Fernanda" };

  it("proposes an unlinked line as a new material with its dated price", () => {
    const body = buildProposal(item({ priceDate: 1_700_000_000_000 }), project, "c1");
    expect(body).toEqual({
      clientId: "c1",
      takeoffName: "Hospital",
      requestedBy: "Fernanda",
      name: "Grelha de Insuflamento 400x400",
      unit: "pç",
      category: "Bocas de Ar",
      unitPrice: 120.5,
      priceDate: 1_700_000_000_000,
    });
  });

  it("uses the line's own unit and dates an undated price now", () => {
    const before = Date.now();
    const body = buildProposal(item({ kind: "linear", unit: undefined }), project, "c2");
    expect(body.unit).toBe("m");
    expect(body.priceDate).toBeGreaterThanOrEqual(before);
    expect(buildProposal(item({ unit: "kg" }), project, "c3").unit).toBe("kg");
  });

  it("only proposes the price when the line is already linked, and no price when it is 0", () => {
    const linked = buildProposal(item({ catalogId: "m1" }), project, "c4");
    expect(linked.materialId).toBe("m1");
    expect(linked.name).toBeUndefined();
    expect(linked.unitPrice).toBe(120.5);

    const free = buildProposal(item({ materialPrice: 0 }), project, "c5");
    expect(free.unitPrice).toBeUndefined();
    expect(free.priceDate).toBeUndefined();
    expect(free.name).toBe("Grelha de Insuflamento 400x400");
  });

  it("omits empty header fields", () => {
    const body = buildProposal(item(), emptyProject(), "c6");
    expect(body.requestedBy).toBeUndefined();
    expect(body.takeoffName).toBe("Takeoff sem nome");
  });
});

describe("catalog redirects", () => {
  it("re-points linked lines to the surviving material, following chains", () => {
    const items = [item({ id: "a", catalogId: "old" }), item({ id: "b", catalogId: "kept" })];
    const out = applyRedirects(items, { old: "mid", mid: "new" });
    expect(out.map((i) => i.catalogId)).toEqual(["new", "kept"]);
    expect(out[0].materialPrice).toBe(120.5);
    expect(out[1]).toBe(items[1]);
  });

  it("returns the same array when nothing is linked to a merged material", () => {
    const items = [item({ id: "a" }), item({ id: "b", catalogId: "kept" })];
    expect(applyRedirects(items, { other: "x" })).toBe(items);
    expect(applyRedirects(items, {})).toBe(items);
  });
});
