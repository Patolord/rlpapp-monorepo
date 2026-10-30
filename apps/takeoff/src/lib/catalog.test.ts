import { describe, expect, it } from "vitest";
import {
  commonWordPrefix,
  emptyCatalogStore,
  isCatalogStale,
  kindForUnit,
  mergeCatalog,
  normalizeDiscipline,
  parseRemoteCatalogResponse,
  productName,
  SEED,
  upgradeRemoteEntry,
  searchCatalog,
} from "./catalog";

const parseRemoteCatalog = (json: unknown) => parseRemoteCatalogResponse(json).entries;

describe("catalog", () => {
  it("ships a seed with categorised entries", () => {
    expect(SEED.length).toBeGreaterThan(100);
    expect(SEED.some((e) => e.group === "Bocas de Ar")).toBe(true);
    expect(SEED.some((e) => e.unit === "m")).toBe(true);
    expect(
      SEED.every((e) => ["pç", "cj", "vb", "m", "m²", "kg", "gl", "bd", "l"].includes(e.unit)),
    ).toBe(true);
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
    const fromCompany = entries.filter((e) => e.source === "remote");
    expect(fromCompany).toHaveLength(2);
    // the bundled seed steps aside; the weight table (copper tubes) stays available after it
    expect(entries.slice(0, 2)).toEqual(fromCompany);
    expect(entries.slice(2).every((e) => e.source === "seed" && e.kgPerUnit)).toBe(true);
    expect(mergeCatalog(emptyCatalogStore()).some((e) => e.source === "seed" && !e.kgPerUnit)).toBe(
      true,
    );
    expect(() => parseRemoteCatalog({ nope: 1 })).toThrow();
  });

  it("keeps every variant of a family as its own searchable entry", () => {
    const items = ["MAXX 100 220V", "SONORA 14", "SONORA 18"].map((v, i) => ({
      id: `m${i}`,
      sku: `MAT-00013${i}`,
      name: "Exaustor",
      description: `Exaustor — Sicflux ${v}`,
      group: "Ventilação e Exaustão",
      unit: "pç",
      status: "active",
    }));
    const store = { ...emptyCatalogStore(), remote: parseRemoteCatalog({ items }) };
    const entries = mergeCatalog(store).filter((e) => e.source === "remote");
    expect(entries.map((e) => e.variant)).toEqual([
      "Sicflux MAXX 100 220V",
      "Sicflux SONORA 14",
      "Sicflux SONORA 18",
    ]);
    expect(searchCatalog(entries, "exaustor sonora 18").map((e) => e.sku)).toEqual(["MAT-000132"]);
    expect(productName("Exaustor", "Exaustor")).toEqual({ name: "Exaustor" });
    expect(productName("Exaustor", "Outro nome")).toEqual({ name: "Exaustor" });
    // the spec after the variant is not part of the name; a spec alone is not a variant
    expect(productName("Acionador", "Acionador — Verin VRE-AM2 - Endereçável — LEDs; IP65")).toEqual(
      { name: "Acionador — Verin VRE-AM2 - Endereçável", variant: "Verin VRE-AM2 - Endereçável" },
    );
    const spec = "cadastro histórico genérico: fabricante, modelo, tecnologia e tensão não confirmados; revisar o projeto antes da compra";
    expect(productName("Espelho", `Espelho — ${spec}`)).toEqual({ name: "Espelho" });
    // the payload's own variant wins over the description
    expect(productName("Espelho", `Espelho — ${spec}`, "Branco")).toEqual({
      name: "Espelho — Branco",
      variant: "Branco",
    });
    // entries cached by an earlier version are renamed once, never twice
    const old = { name: "Exaustor", description: "Exaustor — Sicflux SONORA 18", group: "", unit: "pç", materialPrice: 0, laborPrice: 0 };
    const upgraded = upgradeRemoteEntry(old);
    expect(upgraded.name).toBe("Exaustor — Sicflux SONORA 18");
    expect(upgradeRemoteEntry(upgraded)).toBe(upgraded);
  });

  it("reads the company response: provenance, drafts and merge redirects", () => {
    const parsed = parseRemoteCatalogResponse({
      generatedAt: 1_761_200_000_000,
      items: [
        {
          id: "m1",
          sku: "MAT-000101",
          name: "Grelha de Insuflamento",
          description: "Grelha de Insuflamento — Anodizada 200x200mm",
          group: "Bocas de Ar",
          unit: "pç",
          materialPrice: 123.45,
          priceDate: 1_760_000_000_000,
          priceValidUntil: null,
          priceEventId: "pe1",
          laborPrice: 0,
          system: null,
          status: "active",
          mergedInto: null,
        },
        {
          id: "m2",
          sku: "MAT-000102",
          name: "Damper corta-fogo",
          description: "Damper corta-fogo",
          group: "Diversos",
          unit: "pç",
          materialPrice: 0,
          priceDate: null,
          priceValidUntil: null,
          priceEventId: null,
          laborPrice: 0,
          system: null,
          status: "draft",
          mergedInto: null,
        },
        {
          id: "m0",
          sku: null,
          name: "Grelha Insuflamento Anodizada",
          description: "Grelha Insuflamento Anodizada",
          group: "Diversos",
          unit: "pç",
          materialPrice: 0,
          priceDate: null,
          priceValidUntil: null,
          priceEventId: null,
          laborPrice: 0,
          system: null,
          status: "archived",
          mergedInto: "m1",
        },
      ],
    });
    expect(parsed.generatedAt).toBe(1_761_200_000_000);
    expect(parsed.redirects).toEqual({ m0: "m1" });
    // a material is named after its product, so the variants of a family stay apart
    expect(parsed.entries.map((e) => e.name)).toEqual([
      "Grelha de Insuflamento — Anodizada 200x200mm",
      "Damper corta-fogo",
    ]);
    expect(parsed.entries[0]).toMatchObject({
      catalogId: "m1",
      sku: "MAT-000101",
      variant: "Anodizada 200x200mm",
      description: "Grelha de Insuflamento — Anodizada 200x200mm",
      materialPrice: 123.45,
      priceDate: 1_760_000_000_000,
      priceValidUntil: undefined,
      status: "active",
      system: undefined,
    });
    expect(parsed.entries[1]).toMatchObject({ status: "draft", priceDate: undefined });
    expect(parsed.entries[1].variant).toBeUndefined();
    // a bare array (hand-made file) still works and has no generatedAt
    expect(parseRemoteCatalogResponse([{ name: "X", unit: "m" }]).generatedAt).toBeNull();
  });
});

describe("disciplines from past budgets", () => {
  it("maps worksheet names onto the canonical disciplines", () => {
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

describe("commonWordPrefix", () => {
  it("dims what every result shares and keeps the distinguishing tail", () => {
    const names = [
      "Damper de Regulagem Manual Reforçado (Descarga do Ventilador) dim. 1060x900mm",
      "Damper de Regulagem Manual Reforçado (Descarga do Ventilador) dim. 750x630mm",
      "Damper de Regulagem Manual Reforçado (Descarga do Ventilador) dim. 750x300mm",
    ];
    expect(commonWordPrefix(names)).toBe(
      "Damper de Regulagem Manual Reforçado (Descarga do Ventilador) dim. ",
    );
    // a word is never cut in half, and a short overlap is not worth dimming
    expect(
      commonWordPrefix(["Grelha de Insuflamento 400x400", "Grelha de Insuflamento 300x300"]),
    ).toBe("Grelha de Insuflamento ");
    expect(commonWordPrefix(["Grelha 400", "Grelha 300"])).toBe("");
    expect(commonWordPrefix(["Difusor", "Damper"])).toBe("");
    expect(commonWordPrefix(["Só um"])).toBe("");
    // a name that is exactly the shared part would vanish: then nothing is dimmed
    expect(commonWordPrefix(["Tubo de cobre", 'Tubo de cobre 1/2"'])).toBe("");
  });
});

describe("catalog freshness", () => {
  it("asks for an update after a week, or when never fetched", () => {
    const now = new Date(2026, 9, 26, 12).getTime();
    const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
    expect(isCatalogStale(null, now)).toBe(true);
    expect(isCatalogStale(daysAgo(0), now)).toBe(false);
    expect(isCatalogStale(daysAgo(6), now)).toBe(false);
    expect(isCatalogStale(daysAgo(8), now)).toBe(true);
  });
});
