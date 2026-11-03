import { DEFAULT_DUCT_NORMAS, normaDefaults } from "@rlpapp/shared/engenharia/ducts";
import { DEFAULT_LABOR_PER_EVAP } from "@rlpapp/shared/takeoff/labor";
import { cloneBrand, SEED_BRANDS } from "@rlpapp/shared/takeoff/vrfBrands";
import { SEED_WEIGHTS, weightKey } from "@rlpapp/shared/takeoff/weights";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AIR_TERMINAL_LABOR,
  commonWordPrefix,
  emptyCatalogStore,
  isCatalogStale,
  kindForUnit,
  loadCatalogStore,
  mergeCatalog,
  normalizeDiscipline,
  parseRemoteCatalogResponse,
  parseRemoteKits,
  productName,
  searchCatalog,
  unitKey,
  upgradeRemoteEntry,
  withCompanyDefaults,
} from "./catalog";
import { SEED_KITS } from "./kits";
import { DEFAULT_GROUP } from "./types";

const parseRemoteCatalog = (json: unknown) => parseRemoteCatalogResponse(json).entries;

describe("catalog", () => {
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
    // without the company catalog, only the user's entries and the weight table are there
    expect(entries.every((e) => e.source === "saved" || e.kgPerUnit)).toBe(true);
  });

  it("puts the company catalog before the weight table once it has been fetched", () => {
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
    // the weight table (copper tubes) stays available after the company's entries
    expect(entries.slice(0, 2)).toEqual(fromCompany);
    expect(entries.slice(2).every((e) => e.source === "seed" && e.kgPerUnit)).toBe(true);
    expect(() => parseRemoteCatalog({ nope: 1 })).toThrow();
  });

  it("gives air terminals without labour the usual installation price", () => {
    const remote = parseRemoteCatalog({
      items: [
        {
          id: "g1",
          name: "Veneziana p/ Tomada de Ar c/ Tela dim 999x999mm",
          categoria: "Bocas de Ar",
          unit: "pç",
          materialPrice: 50,
          laborPrice: 0,
        },
        {
          id: "g2",
          name: "Grelha nova 123x456",
          categoria: "Diversos",
          unit: "pç",
          materialPrice: 50,
          laborPrice: 0,
        },
        {
          id: "g3",
          name: "Grelha nova 123x456 com preço",
          categoria: "Bocas de Ar",
          unit: "pç",
          materialPrice: 50,
          laborPrice: 30,
        },
        {
          id: "e1",
          name: "Exaustor novo",
          categoria: "Equipamentos",
          unit: "pç",
          materialPrice: 500,
          laborPrice: 0,
        },
        {
          id: "t1",
          name: "Terminal 2,5 mm²",
          categoria: "Terminais Elétricos",
          unit: "pç",
          materialPrice: 1,
          laborPrice: 0,
        },
        {
          id: "d1",
          name: "Difusor linear por metro",
          categoria: "Bocas de Ar",
          unit: "m",
          materialPrice: 200,
          laborPrice: 0,
        },
      ],
    });
    const entries = mergeCatalog({ ...emptyCatalogStore(), remote });
    const byId = (id: string) => entries.find((e) => e.catalogId === id)!;
    expect(byId("g1")).toMatchObject({ laborPrice: AIR_TERMINAL_LABOR, laborSource: "default" });
    expect(byId("g2")).toMatchObject({ laborPrice: AIR_TERMINAL_LABOR, laborSource: "default" });
    expect(byId("g3")).toMatchObject({ laborPrice: 30 });
    expect(byId("g3").laborSource).toBeUndefined();
    expect(byId("e1").laborPrice).toBe(0);
    // not an air terminal, or not sold by the piece: no per-piece default
    expect(byId("t1").laborPrice).toBe(0);
    expect(byId("d1").laborPrice).toBe(0);
    expect(byId("d1").laborSource).toBeUndefined();
    // the bundled seed gets it too; the user's own entries are kept as saved
    const seedOnly = mergeCatalog(emptyCatalogStore());
    expect(seedOnly.filter((e) => e.group === "Bocas de Ar").every((e) => e.laborPrice > 0)).toBe(
      true,
    );
    const saved = [
      { name: "Grelha minha", group: "Bocas de Ar", unit: "pç", materialPrice: 1, laborPrice: 0 },
    ];
    expect(mergeCatalog({ ...emptyCatalogStore(), saved })[0].laborPrice).toBe(0);
  });

  it("compares units through their synonyms", () => {
    for (const u of ["un", "pç", "pc", "peça", "PÇ", " Unidade "]) expect(unitKey(u)).toBe("pc");
    expect(unitKey("metro")).toBe(unitKey("m"));
    expect(unitKey("m2")).toBe(unitKey("m²"));
    expect(unitKey("Conjunto")).toBe(unitKey("cj"));
    expect(unitKey("KG")).toBe(unitKey("kg"));
    expect(unitKey("rolo")).not.toBe(unitKey("m"));
    expect(unitKey("m")).not.toBe(unitKey("m²"));
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
    expect(
      productName("Acionador", "Acionador — Verin VRE-AM2 - Endereçável — LEDs; IP65"),
    ).toEqual({
      name: "Acionador — Verin VRE-AM2 - Endereçável",
      variant: "Verin VRE-AM2 - Endereçável",
    });
    const spec =
      "cadastro histórico genérico: fabricante, modelo, tecnologia e tensão não confirmados; revisar o projeto antes da compra";
    expect(productName("Espelho", `Espelho — ${spec}`)).toEqual({ name: "Espelho" });
    // the payload's own variant wins over the description
    expect(productName("Espelho", `Espelho — ${spec}`, "Branco")).toEqual({
      name: "Espelho — Branco",
      variant: "Branco",
    });
    // entries cached by an earlier version are renamed once, never twice
    const old = {
      name: "Exaustor",
      description: "Exaustor — Sicflux SONORA 18",
      group: "",
      unit: "pç",
      materialPrice: 0,
      laborPrice: 0,
    };
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
          group: "Geral",
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
          group: "Geral",
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
    const bare = parseRemoteCatalogResponse([{ name: "X", unit: "m" }]);
    expect(bare.generatedAt).toBeNull();
    // no group: the app's default group, not the "Diversos" extras line
    expect(bare.entries[0].group).toBe(DEFAULT_GROUP);
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

describe("company catalog groups", () => {
  it("a blank or whitespace-only group falls back to the default group", () => {
    const parsed = parseRemoteCatalogResponse({
      items: [
        { name: "A", group: "   " },
        { name: "B", group: "" },
        { name: "C", grupo: " Exaustão " },
      ],
    });
    expect(parsed.entries.map((e) => e.group)).toEqual([DEFAULT_GROUP, DEFAULT_GROUP, "Exaustão"]);
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

describe("loading the saved catalog", () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    // a browser tab: the catalog lives in localStorage
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("gives seed kits saved before drawing labels their seed's label, keeps a cleared one", async () => {
    const [a, b] = SEED_KITS;
    const { label: _drop, ...noLabel } = a;
    const own = { id: "mine", name: "Ventilador", mode: "count", components: [] };
    storage.set(
      "takeoff.catalog",
      JSON.stringify({ saved: [], kits: [noLabel, { ...b, label: "" }, own] }),
    );
    const store = await loadCatalogStore();
    // the list of before overrides: the seed kit as is (not an override), a cleared label and a
    // kit of this machine as overrides, the other seeds hidden
    expect(store.kits.map((k) => k.label)).toEqual([a.label, "", undefined]);
    expect(a.label).toBe('1/4" · 3/8"');
    expect(store.kitOverrides.map((k) => k.id)).toEqual([b.id, "mine"]);
    expect(store.kitRemoved).toEqual(SEED_KITS.slice(2).map((k) => k.id));
    expect(store.remoteKits).toBeNull();
  });

  it("recomputes the kits in use from the company defaults and the overrides", async () => {
    const remote = [
      {
        id: "kit-x",
        name: "X",
        mode: "linear",
        components: [{ name: "Cobre", group: "T", kind: "linear", factor: 1 }],
      },
      {
        id: "kit-y",
        name: "Y",
        mode: "count",
        components: [{ name: "Split", group: "E", kind: "count", factor: 1 }],
      },
    ];
    const edited = { ...remote[0], label: "1/4" };
    storage.set(
      "takeoff.catalog",
      JSON.stringify({
        saved: [],
        kits: [{ id: "stale", name: "ignored", components: [] }],
        remoteKits: remote,
        kitOverrides: [edited],
        kitRemoved: ["kit-y"],
      }),
    );
    const store = await loadCatalogStore();
    expect(store.kits).toEqual([edited]);
  });

  it("keeps the kit list's identity when a refresh brings the same defaults", async () => {
    const remote = [
      {
        id: "kit-x",
        name: "X",
        mode: "linear",
        components: [{ name: "Cobre", group: "T", kind: "linear", factor: 1 }],
      },
    ];
    storage.set(
      "takeoff.catalog",
      JSON.stringify({ saved: [], remoteKits: remote, kitOverrides: [], kitRemoved: [] }),
    );
    const store = await loadCatalogStore();
    const again = withCompanyDefaults(store, { remoteKits: parseRemoteKits(remote) });
    expect(again.kits).toBe(store.kits);
    const changed = withCompanyDefaults(store, {
      remoteKits: parseRemoteKits([{ ...remote[0], label: "1/4" }]),
    });
    expect(changed.kits).not.toBe(store.kits);
    expect(changed.kits[0].label).toBe("1/4");
  });

  it("reads the weight table of before as overrides of the supplier's, and the other settings too", async () => {
    const [first, second, ...rest] = SEED_WEIGHTS;
    const edited = { ...first, kgPerUnit: 0.2 };
    const mine = {
      name: "Barra chata",
      group: "Ferragens",
      unit: "pç" as const,
      material: "chapa",
      kgPerUnit: 1.5,
    };
    storage.set(
      "takeoff.catalog",
      JSON.stringify({
        saved: [],
        weights: [edited, ...rest, mine],
        gaugeWeights: { "# 26": 4.38, "# 24": 5 },
        basePrices: { cobre: 125 },
        vrfBrands: [{ ...SEED_BRANDS[0], name: "Daikin (RLP)" }],
      }),
    );
    const store = await loadCatalogStore();
    expect(store.weightOverrides.map((r) => r.name)).toEqual([first.name, "Barra chata"]);
    expect(store.weightRemoved).toEqual([weightKey(second)]);
    expect(store.weights.map((r) => r.name)).toEqual([
      first.name,
      ...rest.map((r) => r.name),
      "Barra chata",
    ]);
    expect(store.weights[0].kgPerUnit).toBe(0.2);
    // the supplier's # 26 is not an override; the # 24 set by the user is
    expect(store.gaugeWeightOverrides).toEqual({ "# 24": 5 });
    expect(store.gaugeWeights["# 24"]).toBe(5);
    expect(store.gaugeWeights["# 26"]).toBe(4.38);
    expect(store.basePriceOverrides).toEqual({ cobre: 125 });
    expect(store.basePrices).toEqual({ cobre: 125 });
    expect(store.vrfBrandOverrides.map((b) => b.id)).toEqual(["daikin"]);
    expect(store.vrfBrandRemoved).toEqual(["hitachi"]);
    expect(store.vrfBrands.map((b) => b.name)).toEqual(["Daikin (RLP)"]);
  });

  it("layers the company's weights, gauges, prices and brands under the overrides", async () => {
    storage.set(
      "takeoff.catalog",
      JSON.stringify({
        saved: [],
        remoteWeights: [SEED_WEIGHTS[0]],
        weightOverrides: [],
        weightRemoved: [],
        remoteGaugeWeights: { "# 26": 4.5 },
        gaugeWeightOverrides: { "# 24": 5 },
        remoteBasePrices: { cobre: 110, chapa: 9 },
        basePriceOverrides: { chapa: 10 },
        remoteVrfBrands: [SEED_BRANDS[1]],
        vrfBrandOverrides: [],
        vrfBrandRemoved: [],
      }),
    );
    const store = await loadCatalogStore();
    expect(store.weights).toEqual([SEED_WEIGHTS[0]]);
    expect(store.gaugeWeights).toMatchObject({ "# 26": 4.5, "# 24": 5, "# 22": 6.82 });
    expect(store.basePrices).toEqual({ cobre: 110, chapa: 10 });
    expect(store.vrfBrands.map((b) => b.id)).toEqual(["hitachi"]);
    // a refresh with the same defaults keeps every list's identity
    const same = withCompanyDefaults(store, {
      remoteWeights: [{ ...SEED_WEIGHTS[0] }],
      remoteVrfBrands: [cloneBrand(SEED_BRANDS[1])],
      remoteBasePrices: { cobre: 110, chapa: 9 },
    });
    expect(same.weights).toBe(store.weights);
    expect(same.vrfBrands).toBe(store.vrfBrands);
    expect(same.basePrices).toBe(store.basePrices);
    expect(same.gaugeWeights).toBe(store.gaugeWeights);
  });

  it("reads the weights, prices and brands of the catalog response, skipping what is invalid", () => {
    const parsed = parseRemoteCatalogResponse({
      generatedAt: 1,
      items: [],
      kits: [],
      weights: {
        rows: [
          { name: " Tubo ", group: "", unit: "pç", material: "chapa", kgPerUnit: 1.5 },
          { name: "Sem peso", group: "x", unit: "m", material: "cobre", kgPerUnit: 0 },
          { name: "Ouro", group: "x", unit: "m", material: "ouro", kgPerUnit: 1 },
        ],
        gaugeWeights: { "# 26": 4.5, "# 99": 1, "# 24": -1 },
      },
      basePrices: { cobre: 125, ouro: 1, chapa: 0 },
      vrfBrands: [
        SEED_BRANDS[0],
        { ...SEED_BRANDS[1], main: [{ hp: 0, gas: "9/9", liquid: "1/4" }] },
        { id: "", name: "sem id", main: [], trunk: [], branch: [], ykit: [] },
      ],
    });
    expect(parsed.weights).toEqual({
      rows: [{ name: "Tubo", group: "Tubulações", unit: "pç", material: "chapa", kgPerUnit: 1.5 }],
      gaugeWeights: { "# 26": 4.5 },
    });
    expect(parsed.basePrices).toEqual({ cobre: 125 });
    expect(parsed.vrfBrands?.map((b) => b.id)).toEqual(["daikin"]);
    // a server from before these settings: nothing arrives, the defaults in use stay
    const older = parseRemoteCatalogResponse({ generatedAt: 1, items: [] });
    expect(older.weights).toBeNull();
    expect(older.basePrices).toBeNull();
    expect(older.vrfBrands).toBeNull();
  });

  it("reads the company's labour prices and norma table, and keeps the workbook's otherwise", () => {
    const parsed = parseRemoteCatalogResponse({
      generatedAt: 1,
      items: [],
      labor: { ductPerKg: 22, vrfPerEvap: 0, other: 5 },
      ductNormas: [
        {
          norma: 1,
          gaugeLimits: [50, 80, 140, 210],
          insulThickness: 38,
          flangeSpacing: 1,
          rechapThickness: 25,
          sheetSlackPct: null,
          insulSlackPct: 15,
          supportsPct: 30,
        },
        {
          norma: 2,
          gaugeLimits: [70, 60, 120, 150],
          insulThickness: 25,
          flangeSpacing: 1,
          rechapThickness: 25,
          sheetSlackPct: 20,
          insulSlackPct: 15,
          supportsPct: 30,
        },
        {
          norma: 9,
          gaugeLimits: [1, 2, 3, 4],
          insulThickness: 1,
          flangeSpacing: 1,
          rechapThickness: 1,
          sheetSlackPct: null,
          insulSlackPct: 1,
          supportsPct: 1,
        },
      ],
    });
    expect(parsed.labor).toEqual({ ductPerKg: 22 });
    expect(parsed.ductNormas?.map((n) => n.norma)).toEqual([1]);
    expect(parsed.ductNormas?.[0]).toMatchObject({
      insulThickness: 38,
      gaugeLimits: [50, 80, 140, 210],
    });
    const older = parseRemoteCatalogResponse({ generatedAt: 1, items: [] });
    expect(older.labor).toBeNull();
    expect(older.ductNormas).toBeNull();

    const store = withCompanyDefaults(emptyCatalogStore(), {
      remoteLabor: parsed.labor,
      remoteDuctNormas: parsed.ductNormas,
    });
    // the company's labour over the workbook's; a norma it did not publish keeps the workbook's row
    expect(store.labor).toEqual({ ductPerKg: 22, vrfPerEvap: DEFAULT_LABOR_PER_EVAP });
    expect(store.ductNormas.map((n) => n.norma)).toEqual([1]);
    expect(normaDefaults(1, store.ductNormas).insulThickness).toBe(38);
    expect(normaDefaults(3, store.ductNormas)).toEqual(DEFAULT_DUCT_NORMAS[2]);
    const again = withCompanyDefaults(store, { remoteLabor: { ductPerKg: 22 } });
    expect(again.labor).toBe(store.labor);
    expect(again.ductNormas).toBe(store.ductNormas);
  });

  it("reads the company's kits from the catalog response, skipping what is not a kit", () => {
    const parsed = parseRemoteCatalogResponse({
      generatedAt: 1,
      items: [],
      kits: [
        {
          id: "kit-9-000-inverter",
          name: "9.000 Inverter",
          mode: "linear",
          label: '1/4" · 3/8"',
          components: [
            {
              name: 'Cobre de 1/4"',
              group: "Tubulações",
              system: "Infra AC",
              kind: "linear",
              factor: 1,
            },
            { name: "Cabo PP", group: "", system: null, kind: "linear", factor: 2 },
            { name: "", group: "x", system: null, kind: "linear", factor: 1 },
            { name: "Bad kind", group: "x", system: null, kind: "weird", factor: 1 },
          ],
        },
        { id: "kit-empty", name: "Sem componentes", mode: "count", label: null, components: [] },
        {
          id: "kit-click",
          name: "Clique",
          mode: "count",
          label: null,
          components: [
            { name: "Split", group: "Equipamentos", system: null, kind: "count", factor: 1 },
          ],
        },
        "junk",
      ],
    });
    expect(parsed.kits).toEqual([
      {
        id: "kit-9-000-inverter",
        name: "9.000 Inverter",
        mode: "linear",
        label: '1/4" · 3/8"',
        components: [
          {
            name: 'Cobre de 1/4"',
            group: "Tubulações",
            system: "Infra AC",
            kind: "linear",
            factor: 1,
          },
          { name: "Cabo PP", group: DEFAULT_GROUP, kind: "linear", factor: 2 },
        ],
      },
      {
        id: "kit-click",
        name: "Clique",
        mode: "count",
        components: [{ name: "Split", group: "Equipamentos", kind: "count", factor: 1 }],
      },
    ]);
    // a server from before kits: no list, the defaults in use stay as they are
    expect(parseRemoteCatalogResponse({ generatedAt: 1, items: [] }).kits).toBeNull();
    expect(parseRemoteCatalogResponse([]).kits).toBeNull();
  });
});
