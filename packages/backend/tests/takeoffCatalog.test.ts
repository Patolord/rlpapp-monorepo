import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  centsToReais,
  pickCurrentPriceEvent,
} from "../convex/model/procurement/priceSelection";
import { takeoffUnit } from "../convex/model/procurement/takeoffCatalog";
import { setup } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 22);

type SeededPrice = {
  unitPriceCents: number;
  occurredAt: number;
  reviewStatus?: "unreviewed" | "reviewed" | "ignored" | "duplicate";
  validUntil?: number;
  needsReview?: boolean;
};

async function seedCatalog() {
  const t = setup();
  await t.run(async (ctx) => {
    const createdAt = NOW - 30 * DAY;
    const insertMaterial = (material: {
      name: string;
      variantLabel?: string;
      spec?: string;
      sku?: string;
      category?: string;
      unit?: string;
      active: boolean;
    }) => ctx.db.insert("materials", { ...material, createdAt });

    const grelhaId = await insertMaterial({
      name: "Grelha de Insuflamento",
      variantLabel: "Anodizada 200x200mm",
      spec: "com registro",
      sku: "MAT-000101",
      unit: "un",
      active: true,
    });
    const cobreId = await insertMaterial({
      name: "Tubo de Cobre",
      sku: "MAT-000102",
      category: "Ar Condicionado",
      unit: "metro",
      active: true,
    });
    await insertMaterial({
      name: "Isolamento Elastomérico",
      sku: "MAT-000103",
      unit: "m",
      active: false,
    });

    const prices: Record<string, SeededPrice[]> = {
      [grelhaId]: [
        // Older reviewed quote: loses to the newer reviewed one below.
        { unitPriceCents: 9900, occurredAt: NOW - 20 * DAY, reviewStatus: "reviewed" },
        // Latest reviewed quote: this is the catalog price.
        {
          unitPriceCents: 12345,
          occurredAt: NOW - 5 * DAY,
          validUntil: NOW + 25 * DAY,
          reviewStatus: "reviewed",
        },
        // Newest of all, but dismissed in review: never exported.
        { unitPriceCents: 1, occurredAt: NOW - DAY, reviewStatus: "ignored" },
      ],
    };
    // Order the inserts so the ignored one is also the most recently created.
    for (const [materialId, events] of Object.entries(prices)) {
      for (const event of events) {
        await ctx.db.insert("priceEvents", {
          materialId: materialId as Id<"materials">,
          supplierNameRaw: "Fornecedor",
          unitPriceCents: event.unitPriceCents,
          unit: "un",
          source: "quote",
          occurredAt: event.occurredAt,
          validUntil: event.validUntil,
          reviewStatus: event.reviewStatus,
          needsReview: false,
          createdAt: event.occurredAt,
        });
      }
    }
    return { grelhaId, cobreId };
  });
  return t;
}

describe("price selection", () => {
  const event = (
    occurredAt: number,
    extra: Partial<SeededPrice> = {}
  ): SeededPrice => ({ unitPriceCents: 100, occurredAt, ...extra });

  test("prefers the most recent event that is still valid", () => {
    const expiredButNewer = event(NOW - DAY, {
      unitPriceCents: 500,
      validUntil: NOW - 1,
    });
    const validOlder = event(NOW - 10 * DAY, {
      unitPriceCents: 300,
      validUntil: NOW + 10 * DAY,
    });
    const openEnded = event(NOW - 15 * DAY, { unitPriceCents: 200 });
    expect(
      pickCurrentPriceEvent([expiredButNewer, validOlder, openEnded], NOW)
    ).toBe(validOlder);
  });

  test("falls back to an expired quote when nothing is valid", () => {
    const older = event(NOW - 20 * DAY, { validUntil: NOW - 5 * DAY });
    const newer = event(NOW - 10 * DAY, { validUntil: NOW - DAY });
    expect(pickCurrentPriceEvent([older, newer], NOW)).toBe(newer);
  });

  test("skips ignored and duplicate events; null when none usable", () => {
    const ignored = event(NOW, { reviewStatus: "ignored" });
    const duplicate = event(NOW - DAY, { reviewStatus: "duplicate" });
    const unreviewed = event(NOW - 2 * DAY, { reviewStatus: "unreviewed" });
    expect(pickCurrentPriceEvent([ignored, duplicate, unreviewed], NOW)).toBe(
      unreviewed
    );
    expect(pickCurrentPriceEvent([ignored, duplicate], NOW)).toBeNull();
  });

  test("an estimate awaiting review never displaces a reviewed quote", () => {
    const reviewedExpired = event(NOW - 60 * DAY, {
      unitPriceCents: 300,
      validUntil: NOW - 30 * DAY,
      reviewStatus: "reviewed",
    });
    const estimateValid = event(NOW - DAY, {
      unitPriceCents: 999,
      reviewStatus: "unreviewed",
      needsReview: true,
    });
    expect(pickCurrentPriceEvent([estimateValid, reviewedExpired], NOW)).toBe(
      reviewedExpired
    );
    // Alone, the estimate is the best information there is.
    expect(pickCurrentPriceEvent([estimateValid], NOW)).toBe(estimateValid);
  });

  test("centsToReais keeps two decimals", () => {
    expect(centsToReais(12345)).toBe(123.45);
    expect(centsToReais(0)).toBe(0);
    expect(centsToReais(1999.6)).toBe(20);
  });

  test("takeoffUnit maps pieces to pç and keeps other units", () => {
    expect(takeoffUnit("un")).toBe("pç");
    expect(takeoffUnit("peça")).toBe("pç");
    expect(takeoffUnit("pc")).toBe("pç");
    expect(takeoffUnit(undefined)).toBe("pç");
    expect(takeoffUnit("metro")).toBe("m");
    expect(takeoffUnit("kg")).toBe("kg");
    expect(takeoffUnit("m²")).toBe("m²");
  });
});

describe("takeoffCatalog.list", () => {
  test("exports active materials with the current price in reais", async () => {
    const t = await seedCatalog();
    const items = await t.query(internal.takeoffCatalog.list, { now: NOW });

    expect(items.map((item) => item.sku)).toEqual(["MAT-000101", "MAT-000102"]);

    const [grelha, cobre] = items;
    expect(grelha).toMatchObject({
      sku: "MAT-000101",
      name: "Grelha de Insuflamento",
      variant: "Anodizada 200x200mm",
      description: "Grelha de Insuflamento — Anodizada 200x200mm — com registro",
      group: "Diversos",
      unit: "pç",
      materialPrice: 123.45,
      priceDate: NOW - 5 * DAY,
      priceValidUntil: NOW + 25 * DAY,
      laborPrice: 0,
      system: null,
      status: "active",
      mergedInto: null,
    });
    // The provenance points at the event that produced the price.
    const winning = await t.run(async (ctx) =>
      grelha!.priceEventId ? await ctx.db.get("priceEvents", grelha!.priceEventId) : null
    );
    expect(winning?.unitPriceCents).toBe(12345);
    expect(winning?.reviewStatus).toBe("reviewed");

    expect(cobre).toMatchObject({
      sku: "MAT-000102",
      name: "Tubo de Cobre",
      variant: null,
      description: "Tubo de Cobre",
      group: "Ar Condicionado",
      unit: "m",
      materialPrice: 0,
      priceDate: null,
      priceValidUntil: null,
      priceEventId: null,
      laborPrice: 0,
      system: null,
      status: "active",
      mergedInto: null,
    });
  });
});

describe("GET /takeoff/catalog", () => {
  const originalToken = process.env.TAKEOFF_CATALOG_TOKEN;
  beforeEach(() => {
    delete process.env.TAKEOFF_CATALOG_TOKEN;
  });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.TAKEOFF_CATALOG_TOKEN;
    else process.env.TAKEOFF_CATALOG_TOKEN = originalToken;
  });

  test("is disabled until a token is configured", async () => {
    const t = await seedCatalog();
    const response = await t.fetch("/takeoff/catalog");
    expect(response.status).toBe(503);
  });

  test("rejects a missing or wrong token", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    const t = await seedCatalog();
    expect((await t.fetch("/takeoff/catalog")).status).toBe(401);
    expect(
      (
        await t.fetch("/takeoff/catalog", {
          headers: { Authorization: "Bearer wrong" },
        })
      ).status
    ).toBe(401);
  });

  test("returns the whole catalog as JSON", async () => {
    process.env.TAKEOFF_CATALOG_TOKEN = "secret";
    const t = await seedCatalog();
    const response = await t.fetch("/takeoff/catalog", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = (await response.json()) as {
      generatedAt: number;
      items: Array<Record<string, unknown>>;
    };
    expect(body.generatedAt).toBeGreaterThan(0);
    expect(body.items).toHaveLength(2);
    expect(body.items.map((item) => item.name)).toEqual([
      "Grelha de Insuflamento",
      "Tubo de Cobre",
    ]);
    expect(body.items[0]).toMatchObject({
      variant: "Anodizada 200x200mm",
      unit: "pç",
      materialPrice: 123.45,
      priceDate: NOW - 5 * DAY,
      priceValidUntil: NOW + 25 * DAY,
      priceEventId: expect.any(String),
      laborPrice: 0,
      system: null,
    });
    expect(Object.keys(body.items[0]!).sort()).toEqual([
      "description",
      "group",
      "id",
      "laborPrice",
      "materialPrice",
      "mergedInto",
      "name",
      "priceDate",
      "priceEventId",
      "priceValidUntil",
      "sku",
      "status",
      "system",
      "unit",
      "variant",
    ]);
  });
});
