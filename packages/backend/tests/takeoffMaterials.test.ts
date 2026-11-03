import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  TAKEOFF_PRICE_SUPPLIER,
  parseTakeoffMaterialProposal,
} from "../convex/model/procurement/takeoffProposals";
import { setup } from "./helpers";

const NOW = Date.UTC(2026, 9, 23);

async function seedPurchasing() {
  const t = setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Compras",
      clerkId: "purchasing",
      role: "operator",
      department: "compras",
      isActive: true,
      createdAt: Date.now(),
    });
  });
  return { t, purchasing: t.withIdentity({ subject: "purchasing" }) };
}

describe("parseTakeoffMaterialProposal", () => {
  test("requires clientId and a name or materialId", () => {
    expect(parseTakeoffMaterialProposal(null)).toMatchObject({ ok: false });
    expect(parseTakeoffMaterialProposal([])).toMatchObject({ ok: false });
    expect(parseTakeoffMaterialProposal({ name: "Duto" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("clientId"),
    });
    expect(parseTakeoffMaterialProposal({ clientId: "c1" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("name"),
    });
  });

  test("rejects wrong types, negative prices and oversized text", () => {
    expect(
      parseTakeoffMaterialProposal({ clientId: "c1", name: "Duto", unitPrice: -1 })
    ).toMatchObject({ ok: false, error: expect.stringContaining("unitPrice") });
    expect(
      parseTakeoffMaterialProposal({ clientId: "c1", name: "Duto", unit: 5 })
    ).toMatchObject({ ok: false, error: expect.stringContaining("unit") });
    expect(
      parseTakeoffMaterialProposal({ clientId: "c1", name: "x".repeat(201) })
    ).toMatchObject({ ok: false, error: expect.stringContaining("name") });
    expect(
      parseTakeoffMaterialProposal({
        clientId: "c1",
        name: "Duto",
        dimensions: { widthMm: "300" },
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("widthMm") });
    // zero passaria pelo parser e só falharia em sanitizeDimensions (500)
    expect(
      parseTakeoffMaterialProposal({
        clientId: "c1",
        name: "Duto",
        dimensions: { widthMm: 300, heightMm: 0 },
      })
    ).toMatchObject({ ok: false, error: expect.stringContaining("heightMm") });
  });

  test("trims text and drops empty strings", () => {
    const parsed = parseTakeoffMaterialProposal({
      clientId: " c1 ",
      name: "  Duto chapa galvanizada ",
      variantLabel: "",
      unit: "pç",
      unitPrice: 12.5,
      dimensions: { widthMm: 300, heightMm: 200 },
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        clientId: "c1",
        materialId: undefined,
        name: "Duto chapa galvanizada",
        variantLabel: undefined,
        spec: undefined,
        category: undefined,
        unit: "pç",
        dimensions: { widthMm: 300, heightMm: 200 },
        unitPrice: 12.5,
        priceDate: undefined,
        requestedBy: undefined,
        takeoffName: undefined,
      },
    });
  });
});

describe("takeoffMaterials.propose", () => {
  test("creates a draft with SKU and a queued estimate", async () => {
    const { t } = await seedPurchasing();
    const result = await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-1",
      name: "Damper corta-fogo",
      variantLabel: "300x200mm",
      category: "Ventilação",
      unit: "pç",
      unitPrice: 450.5,
      priceDate: NOW,
      requestedBy: "Rodrigo",
      takeoffName: "Hospital Sírio",
    });
    expect(result).toMatchObject({
      outcome: "created",
      materialStatus: "draft",
      mergedInto: null,
    });
    expect(result.sku).toMatch(/^MAT-\d{6}$/);
    expect(result.priceEventId).toBeTruthy();

    const stored = await t.run(async (ctx) => {
      const material = await ctx.db.get("materials", result.materialId);
      const event = result.priceEventId
        ? await ctx.db.get("priceEvents", result.priceEventId)
        : null;
      const proposals = await ctx.db.query("takeoffMaterialProposals").collect();
      return { material, event, proposals };
    });
    expect(stored.material).toMatchObject({
      name: "Damper corta-fogo",
      variantLabel: "300x200mm",
      category: "Ventilação",
      unit: "un",
      active: true,
      status: "draft",
    });
    expect(stored.material?.familyId).toBeTruthy();
    expect(stored.event).toMatchObject({
      materialId: result.materialId,
      supplierNameRaw: TAKEOFF_PRICE_SUPPLIER,
      unitPriceCents: 45050,
      source: "manual",
      occurredAt: NOW,
      reviewStatus: "unreviewed",
      needsReview: true,
    });
    expect(stored.event?.notes).toContain("Hospital Sírio");
    expect(stored.proposals).toHaveLength(1);
    expect(stored.proposals[0]).toMatchObject({
      clientId: "line-1",
      outcome: "created",
      materialId: result.materialId,
    });
  });

  test("the same clientId is replayed without creating anything twice", async () => {
    const { t } = await seedPurchasing();
    const args = {
      clientId: "line-2",
      name: "Grelha de retorno",
      unit: "un",
      unitPrice: 80,
    };
    const first = await t.mutation(internal.takeoffMaterials.propose, args);
    const second = await t.mutation(internal.takeoffMaterials.propose, args);
    expect(second).toMatchObject({
      outcome: "replayed",
      materialId: first.materialId,
      priceEventId: first.priceEventId,
    });

    const counts = await t.run(async (ctx) => ({
      materials: (await ctx.db.query("materials").collect()).length,
      events: (await ctx.db.query("priceEvents").collect()).length,
      proposals: (await ctx.db.query("takeoffMaterialProposals").collect())
        .length,
    }));
    expect(counts).toEqual({ materials: 1, events: 1, proposals: 1 });
  });

  test("links to the identical existing material instead of a duplicate", async () => {
    const { t, purchasing } = await seedPurchasing();
    const existingId = await purchasing.mutation(api.materials.create, {
      name: "Tubo de Cobre",
      variantLabel: '1/2"',
      unit: "m",
    });

    const result = await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-3",
      name: "tubo de cobre",
      variantLabel: '1/2"',
      unit: "metro",
    });
    expect(result).toMatchObject({
      outcome: "matched",
      materialId: existingId,
      materialStatus: "active",
      priceEventId: null,
    });
    const materials = await t.run(
      async (ctx) => await ctx.db.query("materials").collect()
    );
    expect(materials).toHaveLength(1);
  });

  test("a different variant of a known family becomes its own draft", async () => {
    const { t, purchasing } = await seedPurchasing();
    const existingId = await purchasing.mutation(api.materials.create, {
      name: "Tubo de Cobre",
      variantLabel: '1/2"',
      unit: "m",
    });
    const result = await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-4",
      name: "Tubo de Cobre",
      variantLabel: '3/4"',
      unit: "m",
    });
    expect(result.outcome).toBe("created");
    expect(result.materialId).not.toBe(existingId);
    const [existing, draft] = await t.run(async (ctx) => [
      await ctx.db.get("materials", existingId),
      await ctx.db.get("materials", result.materialId),
    ]);
    expect(draft?.familyId).toBe(existing?.familyId);
    expect(draft?.status).toBe("draft");
  });

  test("price-only proposal for an existing material; unknown id fails", async () => {
    const { t, purchasing } = await seedPurchasing();
    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Isolamento térmico",
      unit: "m",
    });
    const result = await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-5",
      materialId,
      unitPrice: 19.9,
    });
    expect(result).toMatchObject({ outcome: "matched", materialId });
    expect(result.priceEventId).toBeTruthy();

    await expect(
      t.mutation(internal.takeoffMaterials.propose, {
        clientId: "line-6",
        materialId: "not-an-id",
      })
    ).rejects.toThrow("Material não encontrado");
  });
});

describe("catalog export with drafts and merges", () => {
  test("drafts are exported as such and an estimate prices them", async () => {
    const { t } = await seedPurchasing();
    const proposal = await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-7",
      name: "Damper de regulagem",
      unit: "pç",
      unitPrice: 120,
      priceDate: NOW - 1000,
    });
    const items = await t.query(internal.takeoffCatalog.list, { now: NOW });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: proposal.materialId,
      status: "draft",
      mergedInto: null,
      unit: "pç",
      materialPrice: 120,
      priceEventId: proposal.priceEventId,
    });
  });

  test("an estimate does not displace a reviewed quote on an active material", async () => {
    const { t, purchasing } = await seedPurchasing();
    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Cabo PP",
      unit: "m",
    });
    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Fornecedor A",
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId,
      supplierId,
      unitPriceCents: 1500,
      unit: "m",
      source: "quote",
      occurredAt: NOW - 10_000,
    });
    await t.mutation(internal.takeoffMaterials.propose, {
      clientId: "line-8",
      materialId,
      unitPrice: 99,
    });
    const items = await t.query(internal.takeoffCatalog.list, { now: NOW });
    expect(items[0]).toMatchObject({ id: materialId, materialPrice: 15 });
  });

  test("a merged material is exported archived with its redirect", async () => {
    const { t, purchasing } = await seedPurchasing();
    const targetId = await purchasing.mutation(api.materials.create, {
      name: "Grelha de Insuflamento",
      variantLabel: "200x200mm",
      unit: "un",
    });
    const sourceId = await purchasing.mutation(api.materials.create, {
      name: "Grelha Insuflamento Anodizada",
      variantLabel: "20x20cm",
      unit: "un",
    });
    await purchasing.mutation(api.materials.merge, { sourceId, targetId });

    const items = await t.query(internal.takeoffCatalog.list, { now: NOW });
    expect(items.map((item) => [item.id, item.status, item.mergedInto])).toEqual([
      [targetId, "active", null],
      [sourceId, "archived", targetId],
    ]);
  });
});

describe("POST /takeoff/materials", () => {
  const originalToken = process.env.TAKEOFF_CATALOG_TOKEN;
  beforeEach(() => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.TAKEOFF_CATALOG_TOKEN;
    else process.env.TAKEOFF_CATALOG_TOKEN = originalToken;
  });

  const post = (t: ReturnType<typeof setup>, body: unknown, token = "secret") =>
    t.fetch("/takeoff/materials", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  test("is disabled until a token is configured", async () => {
    delete process.env.TAKEOFF_CATALOG_TOKEN;
    const { t } = await seedPurchasing();
    expect((await post(t, { clientId: "c", name: "x" })).status).toBe(503);
  });

  test("rejects a wrong token, invalid JSON and invalid bodies", async () => {
    const { t } = await seedPurchasing();
    expect((await post(t, { clientId: "c", name: "x" }, "nope")).status).toBe(
      401
    );
    expect((await post(t, "{not json")).status).toBe(400);
    const invalid = await post(t, { clientId: "c" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: expect.stringContaining("name"),
    });
  });

  test("answers 404 for an unknown materialId", async () => {
    const { t } = await seedPurchasing();
    const response = await post(t, { clientId: "c", materialId: "missing" });
    expect(response.status).toBe(404);
  });

  test("creates the draft and returns the proposal result", async () => {
    const { t } = await seedPurchasing();
    const response = await post(t, {
      clientId: "line-9",
      name: "Veneziana de sobrepressão",
      unit: "pç",
      unitPrice: 310,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      outcome: "created",
      materialStatus: "draft",
      mergedInto: null,
    });
    expect(body.sku).toMatch(/^MAT-\d{6}$/);
    expect(typeof body.materialId).toBe("string");
    expect(typeof body.priceEventId).toBe("string");

    const replay = await post(t, {
      clientId: "line-9",
      name: "Veneziana de sobrepressão",
      unit: "pç",
      unitPrice: 310,
    });
    expect(await replay.json()).toMatchObject({
      outcome: "replayed",
      materialId: body.materialId as Id<"materials">,
    });
  });
});
