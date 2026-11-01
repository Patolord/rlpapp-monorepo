import { describe, expect, it } from "vitest";
import { inchesToMm, proposalMaterial, splitMaterialName } from "./proposalMaterial";
import type { Item } from "./types";

describe("inchesToMm", () => {
  it("reads the tube sizes the budgets use", () => {
    expect(inchesToMm("1/4")).toBe(6.35);
    expect(inchesToMm("3/4")).toBe(19.05);
    expect(inchesToMm("1")).toBe(25.4);
    expect(inchesToMm("1.1/8")).toBe(28.58);
    expect(inchesToMm("1 1/8")).toBe(28.58);
    expect(inchesToMm("1-5/8")).toBe(41.28);
    expect(inchesToMm("abc")).toBeUndefined();
    expect(inchesToMm("1/0")).toBeUndefined();
  });
});

describe("splitMaterialName", () => {
  it("splits the catalog's family — variant — spec naming", () => {
    expect(splitMaterialName("Exaustor — Sicflux SONORA 18")).toEqual({
      name: "Exaustor",
      variantLabel: "Sicflux SONORA 18",
    });
    expect(splitMaterialName("Exaustor — Sicflux SONORA 18 — motor 220V")).toEqual({
      name: "Exaustor",
      variantLabel: "Sicflux SONORA 18",
      spec: "motor 220V",
    });
  });

  it("copper tubes: family, size as variant, diameter in mm", () => {
    expect(splitMaterialName('Tubo de cobre 1.1/8"')).toEqual({
      name: "Tubo de cobre",
      variantLabel: '1.1/8"',
      dimensions: { diameterMm: 28.58 },
    });
    // a mixed size with a space is one size, not "…cobre 1" + 1/8"
    expect(splitMaterialName('Tubo de cobre 1 1/8"')).toEqual({
      name: "Tubo de cobre",
      variantLabel: '1.1/8"',
      dimensions: { diameterMm: 28.58 },
    });
    expect(splitMaterialName('Tubo de cobre 2 1/2"')).toEqual({
      name: "Tubo de cobre",
      variantLabel: '2.1/2"',
      dimensions: { diameterMm: 63.5 },
    });
    expect(splitMaterialName('Tubo de cobre 1-5/8"')).toMatchObject({
      name: "Tubo de cobre",
      dimensions: { diameterMm: 41.28 },
    });
    expect(splitMaterialName('Tubo de cobre 1"')).toMatchObject({
      name: "Tubo de cobre",
      dimensions: { diameterMm: 25.4 },
    });
  });

  it("rectangular sizes become width × height, out of the family name", () => {
    expect(splitMaterialName("Grelha de insuflamento 400x200")).toEqual({
      name: "Grelha de insuflamento",
      dimensions: { widthMm: 400, heightMm: 200 },
    });
    expect(
      splitMaterialName("Damper de Regulagem Manual (Descarga do Ventilador) dim. 750 x 630mm"),
    ).toEqual({
      name: "Damper de Regulagem Manual (Descarga do Ventilador)",
      dimensions: { widthMm: 750, heightMm: 630 },
    });
    expect(splitMaterialName("Difusor 600×600 mm - aletado")).toEqual({
      name: "Difusor - aletado",
      dimensions: { widthMm: 600, heightMm: 600 },
    });
  });

  it("round sizes become a diameter", () => {
    expect(splitMaterialName("Duto circular Ø 200")).toEqual({
      name: "Duto circular",
      dimensions: { diameterMm: 200 },
    });
    expect(splitMaterialName("Colarinho ø250mm")).toEqual({
      name: "Colarinho",
      dimensions: { diameterMm: 250 },
    });
  });

  it("leaves names without a size alone", () => {
    expect(splitMaterialName("Caixa de passagem")).toEqual({ name: "Caixa de passagem" });
    expect(splitMaterialName("Split 12000 BTU")).toEqual({ name: "Split 12000 BTU" });
    // a bare size is not a family
    expect(splitMaterialName("400x200")).toEqual({ name: "400x200" });
  });

  it("never proposes a 0 dimension (the server refuses it)", () => {
    for (const name of ['Tubo 0"', 'Tubo 0/8"', "Grelha 00x200", "Duto Ø 00", "Grelha 0,0x200"]) {
      const dims = splitMaterialName(name).dimensions ?? {};
      for (const value of Object.values(dims)) expect(value).toBeGreaterThan(0);
    }
  });
});

describe("proposalMaterial", () => {
  const item = (over: Partial<Item>): Item => ({
    id: "i",
    name: "X",
    kind: "count",
    color: "#000",
    group: "G",
    materialPrice: 0,
    laborPrice: 0,
    wastePct: 0,
    ...over,
  });

  it("adds the weight and the VRF system to the spec", () => {
    expect(
      proposalMaterial(item({ name: "Exaustor — A — 220V", vrf: { brand: "LG", hp: 10 } }), "cj")
        .spec,
    ).toBe("220V; VRF LG 10 HP");
    expect(proposalMaterial(item({ name: "Caixa" }), "pç").spec).toBeUndefined();
  });
});
