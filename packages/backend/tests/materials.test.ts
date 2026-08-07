import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";
import {
  computeReplenishmentState,
  formatSku,
  normalizeSku,
  validateStockPolicyQuantities,
} from "../convex/lib/compras/catalog";

async function seedCatalogUsers() {
  const t = setup();
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", {
      name: "Compras",
      clerkId: "purchasing",
      role: "operator",
      department: "compras",
      isActive: true,
      createdAt: now,
    });
    await ctx.db.insert("users", {
      name: "Estoque",
      clerkId: "warehouse",
      role: "operator",
      department: "estoque",
      isActive: true,
      createdAt: now,
    });
    await ctx.db.insert("users", {
      name: "Engenheiro",
      clerkId: "engineer",
      role: "engenheiro",
      department: "engenharia",
      isActive: true,
      createdAt: now,
    });
  });

  return {
    t,
    purchasing: t.withIdentity({ subject: "purchasing" }),
    warehouse: t.withIdentity({ subject: "warehouse" }),
    engineer: t.withIdentity({ subject: "engineer" }),
  };
}

describe("catalog helpers", () => {
  test("formatSku pads sequence", () => {
    expect(formatSku(1)).toBe("MAT-000001");
    expect(formatSku(42)).toBe("MAT-000042");
  });

  test("normalizeSku uppercases value", () => {
    expect(normalizeSku(" mat-000010 ")).toBe("MAT-000010");
  });

  test("validateStockPolicyQuantities enforces ordering", () => {
    expect(() =>
      validateStockPolicyQuantities({
        minimumQuantity: 5,
        reorderPoint: 3,
        targetQuantity: 10,
      })
    ).toThrow("Estoque mínimo");
    expect(() =>
      validateStockPolicyQuantities({
        minimumQuantity: 2,
        reorderPoint: 10,
        targetQuantity: 8,
      })
    ).toThrow("Ponto de reposição");
  });

  test("computeReplenishmentState derives health and suggestion", () => {
    const policy = {
      minimumQuantity: 2,
      reorderPoint: 5,
      targetQuantity: 12,
    };
    expect(computeReplenishmentState(10, policy)).toEqual({
      state: "healthy",
      suggestedOrderQuantity: null,
    });
    expect(computeReplenishmentState(4, policy)).toEqual({
      state: "reorder",
      suggestedOrderQuantity: 8,
    });
    expect(computeReplenishmentState(1, policy)).toEqual({
      state: "below_minimum",
      suggestedOrderQuantity: 11,
    });
    expect(computeReplenishmentState(3, null)).toEqual({
      state: "unconfigured",
      suggestedOrderQuantity: null,
    });
  });
});

describe("materials catalog", () => {
  test("create auto-generates SKU and rejects duplicates", async () => {
    const { purchasing } = await seedCatalogUsers();

    const firstId = await purchasing.mutation(api.materials.create, {
      name: "Cabo PP 2,5mm",
      category: "cabo",
      unit: "m",
    });
    const first = await purchasing.query(api.materials.get, {
      materialId: firstId,
    });
    expect(first?.sku).toMatch(/^MAT-\d{6}$/);

    const secondId = await purchasing.mutation(api.materials.create, {
      name: "Disjuntor 20A",
      sku: "MAT-CUSTOM-01",
      unit: "un",
    });
    const second = await purchasing.query(api.materials.get, {
      materialId: secondId,
    });
    expect(second?.sku).toBe("MAT-CUSTOM-01");

    await expect(
      purchasing.mutation(api.materials.create, {
        name: "Outro item",
        sku: "MAT-CUSTOM-01",
      })
    ).rejects.toThrow("SKU já cadastrado");
  });

  test("listCatalog supports search by SKU", async () => {
    const { purchasing } = await seedCatalogUsers();
    await purchasing.mutation(api.materials.create, {
      name: "Sensor de temperatura",
      sku: "MAT-SEARCH-01",
      manufacturer: "Siemens",
      unit: "un",
    });

    const page = await purchasing.query(api.materials.listCatalog, {
      search: "MAT-SEARCH-01",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.name).toBe("Sensor de temperatura");
  });

  test("stock policy upsert validates and can be read by engineer", async () => {
    const { t, purchasing, warehouse, engineer } = await seedCatalogUsers();

    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Duto flexível",
      unit: "m",
    });

    const locationId = await t.run(async (ctx) => {
      return await ctx.db.insert("inventoryLocations", {
        type: "central",
        name: "Estoque Central",
        active: true,
        createdAt: Date.now(),
      });
    });

    await expect(
      purchasing.mutation(api.inventoryStockPolicies.upsert, {
        locationId,
        materialId,
        minimumQuantity: 8,
        reorderPoint: 5,
        targetQuantity: 20,
      })
    ).rejects.toThrow("Estoque mínimo");

    const policyId = await warehouse.mutation(
      api.inventoryStockPolicies.upsertFromWarehouse,
      {
        locationId,
        materialId,
        minimumQuantity: 2,
        reorderPoint: 5,
        targetQuantity: 20,
        leadTimeDays: 7,
      }
    );
    expect(policyId).toBeTruthy();

    const readable = await engineer.query(
      api.inventoryStockPolicies.getForLocation,
      { locationId, materialId }
    );
    expect(readable?.targetQuantity).toBe(20);

    await t.run(async (ctx) => {
      await ctx.db.insert("inventoryBalances", {
        locationId,
        materialId,
        quantity: 4,
        updatedAt: Date.now(),
      });
    });

    const balances = await warehouse.query(api.inventory.listBalances, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(balances.page[0]?.replenishmentState).toBe("reorder");
    expect(balances.page[0]?.suggestedOrderQuantity).toBe(16);
    expect(balances.page[0]?.materialSku).toBeTruthy();
  });
});
