import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import { buildMaterialSearchText } from "../convex/lib/compras/catalog";
import {
  describeMaterial,
  extractSkuCandidates,
  normalizeLookupQuery,
  tokenCoverage,
} from "../convex/lib/compras/materialLookup";
import { normalizeText } from "../convex/lib/compras/procurement";
import { setup } from "./helpers";

const CERAMIC_DESCRIPTION =
  "Manta de Fibra Cerâmica com Face Aluminizada — espessura 1,5” (38mm) — densidade 96 kg/m3";

async function seedCatalog() {
  const t = setup();
  await t.run(async (ctx) => {
    const now = Date.now();
    const materials = [
      {
        name: "Manta de Fibra Cerâmica com Face Aluminizada",
        variantLabel: "espessura 1,5” (38mm)",
        spec: "densidade 96 kg/m3",
        sku: "MAT-000234",
        active: true,
        aliases: ["isolamento de duto", "manta duto", "manta ceramica"],
      },
      {
        name: "Manta de Lã de Vidro com Face Aluminizada",
        variantLabel: "espessura 1”",
        sku: "MAT-000235",
        active: true,
        aliases: ["manta la de vidro"],
      },
      {
        name: "Isolamento Elastomérico",
        sku: "MAT-000236",
        active: false,
        aliases: ["isolamento elastomerico"],
      },
    ];
    for (const { aliases, ...material } of materials) {
      const familyId = await ctx.db.insert("materialFamilies", {
        name: material.name,
        nameNormalized: normalizeText(material.name),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const materialId = await ctx.db.insert("materials", {
        ...material,
        familyId,
        searchText: buildMaterialSearchText(material),
        createdAt: now,
      });
      for (const alias of aliases) {
        await ctx.db.insert("materialAliases", {
          alias,
          aliasNormalized: normalizeText(alias),
          materialId,
          createdAt: now,
        });
      }
    }
  });
  return t;
}

describe("lookup helpers", () => {
  test.each([
    ["me de nome completo de isolamento de duto", "isolamento de duto"],
    ["Me dá o nome completo do Isolamento de Duto?", "isolamento de duto"],
    ["me da descrição do isolamento de duto", "isolamento de duto"],
    ["qual o nome completo daquela manta de duto", "manta de duto"],
    ["descrição completa da manta aluminizada", "manta aluminizada"],
    ["manta cerâmica", "manta ceramica"],
    ["qual", "qual"],
  ])("normalizeLookupQuery(%s)", (raw, expected) => {
    expect(normalizeLookupQuery(raw)).toBe(expected);
  });

  test("extractSkuCandidates accepts short and padded forms", () => {
    expect(extractSkuCandidates("qual o mat-234?")).toEqual([
      "MAT-234",
      "MAT-000234",
    ]);
    expect(extractSkuCandidates("manta duto")).toEqual([]);
  });

  test("tokenCoverage keeps com/sem so opposite specs don't fully match", () => {
    expect(tokenCoverage("tubo sem costura", "tubo com costura")).toBeLessThan(1);
    expect(tokenCoverage("tubo sem costura", "tubo sem costura")).toBe(1);
  });

  test("tokenCoverage matches bare numbers against sizes with units", () => {
    const query = normalizeLookupQuery("me da o cabo pp 3x2,5");
    expect(tokenCoverage(query, "Cabo PP 3x2,5mm²")).toBe(1);
    expect(tokenCoverage(query, "Cabo PP 3x2,50mm²")).toBeLessThan(1);
  });

  test("describeMaterial joins name, variant and spec", () => {
    expect(describeMaterial({ name: "Cabo", variantLabel: "2,5 mm" })).toBe(
      "Cabo — 2,5 mm"
    );
  });
});

describe("findMaterial", () => {
  test("resolves an alias from a conversational request", async () => {
    const t = await seedCatalog();
    const result = await t.query(internal.materialLookup.findMaterial, {
      query: "me de nome completo de isolamento de duto",
    });
    expect(result).toMatchObject({
      status: "found",
      matchedBy: "alias",
      material: { code: "MAT-000234", description: CERAMIC_DESCRIPTION },
    });
  });

  test("resolves by SKU and by exact name", async () => {
    const t = await seedCatalog();
    expect(
      await t.query(internal.materialLookup.findMaterial, { query: "MAT-234" })
    ).toMatchObject({ status: "found", matchedBy: "sku" });
    expect(
      await t.query(internal.materialLookup.findMaterial, {
        query: "manta de lã de vidro com face aluminizada",
      })
    ).toMatchObject({
      status: "found",
      matchedBy: "name",
      material: { code: "MAT-000235" },
    });
  });

  test("falls back to search when wording differs from the alias", async () => {
    const t = await seedCatalog();
    const result = await t.query(internal.materialLookup.findMaterial, {
      query: "qual o código do isolamento do duto",
    });
    expect(result).toMatchObject({
      status: "found",
      matchedBy: "search",
      material: { code: "MAT-000234" },
    });
  });

  test("returns candidates instead of guessing", async () => {
    const t = await seedCatalog();
    const result = await t.query(internal.materialLookup.findMaterial, {
      query: "manta aluminizada",
    });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidates.map((c) => c.code).sort()).toEqual([
      "MAT-000234",
      "MAT-000235",
    ]);
  });

  test("inactive rows sharing an alias don't hide other active matches", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 8; i++) {
        const materialId = await ctx.db.insert("materials", {
          name: `Fita ${i}`,
          sku: `MAT-00090${i}`,
          active: i >= 6,
          createdAt: now,
        });
        await ctx.db.insert("materialAliases", {
          alias: "fita isolante",
          aliasNormalized: "fita isolante",
          materialId,
          createdAt: now,
        });
      }
    });
    const result = await t.query(internal.materialLookup.findMaterial, {
      query: "fita isolante",
    });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidates.map((c) => c.code).sort()).toEqual([
      "MAT-000906",
      "MAT-000907",
    ]);
  });

  test("ignores inactive materials and suggests partial matches", async () => {
    const t = await seedCatalog();
    const inactive = await t.query(internal.materialLookup.findMaterial, {
      query: "isolamento elastomérico",
    });
    expect(inactive.status).toBe("not_found");
    if (inactive.status !== "not_found") return;
    expect(inactive.candidates.map((c) => c.code)).toEqual(["MAT-000234"]);
    expect(
      await t.query(internal.materialLookup.findMaterial, {
        query: "parafuso sextavado",
      })
    ).toEqual({ status: "not_found", candidates: [] });
  });
});

describe("GET /materials/lookup", () => {
  const originalToken = process.env.MATERIAL_LOOKUP_TOKEN;
  beforeEach(() => {
    delete process.env.MATERIAL_LOOKUP_TOKEN;
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.MATERIAL_LOOKUP_TOKEN;
    else process.env.MATERIAL_LOOKUP_TOKEN = originalToken;
  });

  test("is disabled until a token is configured", async () => {
    const t = await seedCatalog();
    const response = await t.fetch("/materials/lookup?q=manta%20duto");
    expect(response.status).toBe(503);
  });

  test("rejects missing token and malformed input", async () => {
    process.env.MATERIAL_LOOKUP_TOKEN = "secret";
    const t = await seedCatalog();
    expect((await t.fetch("/materials/lookup?q=manta")).status).toBe(401);
    const auth = { headers: { Authorization: "Bearer secret" } };
    expect((await t.fetch("/materials/lookup", auth)).status).toBe(400);
    expect(
      (await t.fetch(`/materials/lookup?q=${"a".repeat(201)}`, auth)).status
    ).toBe(400);
  });

  test("returns the canonical record", async () => {
    process.env.MATERIAL_LOOKUP_TOKEN = "secret";
    const t = await seedCatalog();
    const response = await t.fetch(
      `/materials/lookup?q=${encodeURIComponent("isolamento de duto")}`,
      { headers: { Authorization: "Bearer secret" } }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "found",
      material: { code: "MAT-000234", description: CERAMIC_DESCRIPTION },
    });
  });
});
