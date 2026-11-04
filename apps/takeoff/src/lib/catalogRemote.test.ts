import { describe, expect, it } from "vitest";
import { applyRedirects, buildProposal } from "./catalogRemote";
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

describe("material proposals", () => {
  const project = { ...emptyProject(), name: "Hospital", estimator: "Fernanda" };

  it("proposes an unlinked line as a new material with its dated price", () => {
    const body = buildProposal(item({ priceDate: 1_700_000_000_000 }), project, "c1");
    expect(body).toEqual({
      clientId: "c1",
      takeoffName: "Hospital",
      // family + size, so purchasing matches it to the existing material
      name: "Grelha de Insuflamento",
      dimensions: { widthMm: 400, heightMm: 400 },
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
    expect(free.name).toBe("Grelha de Insuflamento");
  });

  it("sends variant, diameter and the weight as spec for a copper tube", () => {
    const tube = buildProposal(
      item({
        name: 'Tubo de cobre 1/2"',
        kind: "linear",
        group: "Tubulações",
        baseMaterial: "cobre",
        kgPerUnit: 0.263,
      }),
      project,
      "c7",
    );
    expect(tube).toMatchObject({
      name: "Tubo de cobre",
      variantLabel: '1/2"',
      dimensions: { diameterMm: 12.7 },
      spec: '0,263 kg/m (Cobre até 5/8")',
      unit: "m",
    });
  });

  it("leaves the requester to the server (the signed-in user)", () => {
    const body = buildProposal(item(), emptyProject(), "c6");
    expect(body).not.toHaveProperty("requestedBy");
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
