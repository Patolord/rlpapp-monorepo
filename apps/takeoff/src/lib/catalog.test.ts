import { describe, expect, it } from "vitest";
import {
  emptyCatalogStore,
  kindForUnit,
  mergeCatalog,
  parseRemoteCatalog,
  SEED,
  searchCatalog,
} from "./catalog";

describe("catalog", () => {
  it("ships a seed with categorised entries", () => {
    expect(SEED.length).toBeGreaterThan(100);
    expect(SEED.some((e) => e.group === "Bocas de Ar")).toBe(true);
    expect(SEED.some((e) => e.unit === "m")).toBe(true);
    expect(SEED.every((e) => ["pç", "cj", "vb", "m", "m²"].includes(e.unit))).toBe(true);
  });

  it("maps units to measurement kinds", () => {
    expect(kindForUnit("m")).toBe("linear");
    expect(kindForUnit("m²")).toBe("area");
    expect(kindForUnit("pç")).toBe("count");
  });

  it("searches accent-insensitively with all tokens required, saved entries first", () => {
    const entries = mergeCatalog({
      ...emptyCatalogStore(),
      saved: [
        {
          name: "Grelha de Insuflamento 400x400",
          group: "Bocas de Ar",
          unit: "pç",
          materialPrice: 1,
          laborPrice: 0,
        },
      ],
    });
    const hits = searchCatalog(entries, "grelha insufl 400");
    expect(hits[0].name).toBe("Grelha de Insuflamento 400x400");
    expect(hits[0].source).toBe("saved");
    expect(searchCatalog(entries, "xyzzy nothing")).toEqual([]);
    expect(searchCatalog(entries, "veneziana").every((e) => /veneziana/i.test(e.name))).toBe(true);
  });

  it("prefers the company catalog over the seed once it has been fetched", () => {
    const remote = parseRemoteCatalog({
      items: [
        {
          nome: "Grelha 300x300",
          categoria: "Bocas de Ar",
          unidade: "pç",
          preco_material: "1.250,50",
        },
        {
          name: "Duto 500x300",
          group: "Rede de Dutos",
          unit: "m",
          materialPrice: 80,
          laborPrice: 20,
        },
        { nome: "" },
      ],
    });
    expect(remote).toHaveLength(2);
    expect(remote[0].materialPrice).toBe(1250.5);
    expect(remote[1].laborPrice).toBe(20);
    const entries = mergeCatalog({ ...emptyCatalogStore(), remote });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.source === "remote")).toBe(true);
    expect(() => parseRemoteCatalog({ nope: 1 })).toThrow();
  });
});

describe("disciplines from past budgets", () => {
  it("maps worksheet names onto the canonical disciplines", async () => {
    const { normalizeDiscipline } = await import("./catalog");
    expect(normalizeDiscipline("Pressurização - Torre 01")).toBe("Pressurização de Escadas");
    expect(normalizeDiscipline("Tomada de Ar Ext.")).toBe("TAE (Tomada de Ar Externo)");
    expect(normalizeDiscipline("Detecção")).toBe("Detecção de Incêndio");
    expect(normalizeDiscipline("Infra AC - Studios")).toBe("Infra AC");
    expect(normalizeDiscipline("AC com Equip")).toBe("AC Áreas Comuns");
    expect(normalizeDiscipline("Exaustão Mec. Aptos")).toBe("Exaustão");
    expect(normalizeDiscipline("Chapéu Chinês")).toBe("Exaustão");
    expect(normalizeDiscipline("Lavanderia")).toBe("Lavanderia");
    expect(normalizeDiscipline(undefined)).toBeUndefined();
  });
});
