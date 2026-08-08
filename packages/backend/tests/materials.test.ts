import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup } from "./helpers";
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

  test("blocks exact variants while allowing different dimensions", async () => {
    const { purchasing } = await seedCatalogUsers();
    const firstId = await purchasing.mutation(api.materials.create, {
      name: "Grelha simples fixa",
      variantLabel: "Branca 200x200mm",
      dimensions: { widthMm: 200, heightMm: 200 },
      unit: "peça",
    });

    await expect(
      purchasing.mutation(api.materials.create, {
        name: "GRELHA SIMPLES FIXA",
        variantLabel: "Branca 200 × 200 mm",
        dimensions: { widthMm: 200, heightMm: 200 },
        unit: "pç",
      })
    ).rejects.toThrow("Material já cadastrado");

    const secondId = await purchasing.mutation(api.materials.create, {
      name: "Grelha simples fixa",
      variantLabel: "Branca 300x300mm",
      dimensions: { widthMm: 300, heightMm: 300 },
      unit: "un",
    });
    expect(secondId).not.toBe(firstId);

    const candidates = await purchasing.query(
      api.materials.findDuplicateCandidates,
      {
        name: "grelha simples fixa",
        variantLabel: "Branca 200x200mm",
        dimensions: { widthMm: 200, heightMm: 200 },
        unit: "un",
      }
    );
    expect(candidates.some((candidate) => candidate.exact)).toBe(true);
  });

  test("prevents an alias from pointing to different materials", async () => {
    const { purchasing } = await seedCatalogUsers();
    const firstId = await purchasing.mutation(api.materials.create, {
      name: "Cabo PP",
      variantLabel: "3x1,5mm²",
      unit: "m",
    });
    const secondId = await purchasing.mutation(api.materials.create, {
      name: "Cabo PP",
      variantLabel: "3x2,5mm²",
      unit: "m",
    });
    await purchasing.mutation(api.materials.addAlias, {
      materialId: firstId,
      alias: "cabo flexível pequeno",
    });
    await expect(
      purchasing.mutation(api.materials.addAlias, {
        materialId: secondId,
        alias: "Cabo flexivel pequeno",
      })
    ).rejects.toThrow("Alias já pertence");
  });

  test("links many suppliers to one material without changing catalog ownership", async () => {
    const { purchasing } = await seedCatalogUsers();
    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Detector de fumaça",
      unit: "un",
    });
    const firstSupplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Fornecedor A",
    });
    const secondSupplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Fornecedor B",
    });
    await purchasing.mutation(api.suppliers.upsertMaterialOffering, {
      supplierId: firstSupplierId,
      materialId,
      supplierCode: "A-100",
      preferred: true,
    });
    await purchasing.mutation(api.suppliers.upsertMaterialOffering, {
      supplierId: secondSupplierId,
      materialId,
      supplierCode: "B-200",
    });
    await expect(
      purchasing.mutation(api.suppliers.upsertMaterialOffering, {
        supplierId: firstSupplierId,
        materialId: await purchasing.mutation(api.materials.create, {
          name: "Detector de temperatura",
          unit: "un",
        }),
        supplierCode: "A-100",
      })
    ).rejects.toThrow("já está vinculado");

    const offerings = await purchasing.query(
      api.suppliers.listMaterialOfferings,
      { materialId }
    );
    expect(offerings).toHaveLength(2);
    expect(offerings.map((offering) => offering.supplierCode).sort()).toEqual([
      "A-100",
      "B-200",
    ]);
  });

  test("keeps custom takeoff dimensions contextual until purchasing promotes them", async () => {
    const { purchasing, engineer } = await seedCatalogUsers();
    const takeoffId = await engineer.mutation(api.takeoffs.create, {
      name: "Dampers especiais",
    });
    const itemId = await engineer.mutation(api.takeoffs.addItem, {
      takeoffId,
      rawDescription: "Damper de regulagem manual",
      quantity: 1,
      unit: "pç",
      customDimensions: { widthMm: 850, heightMm: 700 },
      customSpecification: "Galvanizado",
    });

    const before = await engineer.query(api.takeoffs.get, {
      takeoffId,
      now: Date.now(),
    });
    expect(before?.items[0]?.materialId).toBeNull();
    expect(before?.items[0]?.customDimensions).toEqual({
      widthMm: 850,
      heightMm: 700,
    });

    const promoted = await purchasing.mutation(
      api.takeoffs.promoteItemToMaterial,
      { itemId }
    );
    expect(promoted.created).toBe(true);
    const material = await purchasing.query(api.materials.get, {
      materialId: promoted.materialId,
    });
    expect(material?.dimensions).toEqual({ widthMm: 850, heightMm: 700 });

    const after = await engineer.query(api.takeoffs.get, {
      takeoffId,
      now: Date.now(),
    });
    expect(after?.items[0]?.materialId).toBe(promoted.materialId);
  });

  test("imports spreadsheet variants and opening stock idempotently", async () => {
    const { t, purchasing } = await seedCatalogUsers();
    const items = [
      {
        name: "Damper de regulagem manual",
        variantLabel: "850x700mm",
        dimensions: { widthMm: 850, heightMm: 700 },
        sourceMaterialId: "5237",
        sourceDetailId: "3",
        quantity: 1,
        unit: "pç",
        unitCostCents: 10,
      },
      {
        name: "Damper de regulagem manual",
        variantLabel: "850x700mm",
        dimensions: { widthMm: 850, heightMm: 700 },
        sourceMaterialId: "5237",
        sourceDetailId: "7",
        quantity: 1,
        unit: "peça",
        unitCostCents: 10,
      },
    ];

    const first = await purchasing.mutation(api.materials.bulkCreate, {
      source: "estoque-2023",
      items,
    });
    expect(first.created).toBe(1);
    expect(first.skipped).toBe(1);

    const second = await purchasing.mutation(api.materials.bulkCreate, {
      source: "estoque-2023",
      items,
    });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const balances = await t.run(async (ctx) => {
      return await ctx.db.query("inventoryBalances").collect();
    });
    expect(balances).toHaveLength(1);
    expect(balances[0]?.quantity).toBe(2);
  });

  test("stock policy upsert validates; central qty stays scoped to warehouse/purchasing", async () => {
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

    // Estoque não tem compras.write — precisa de upsertFromWarehouse.
    await expect(
      warehouse.mutation(api.inventoryStockPolicies.upsert, {
        locationId,
        materialId,
        minimumQuantity: 2,
        reorderPoint: 5,
        targetQuantity: 20,
      })
    ).rejects.toThrow("compras");

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

    // Estoque também pode garantir o local central (staff + canManageStockPolicy).
    const ensured = await warehouse.mutation(
      api.inventoryStockPolicies.ensureCentralLocation,
      {}
    );
    expect(ensured).toBe(locationId);

    const readable = await purchasing.query(
      api.inventoryStockPolicies.getForLocation,
      { locationId, materialId }
    );
    expect(readable?.targetQuantity).toBe(20);

    await expect(
      engineer.query(api.inventoryStockPolicies.getForLocation, {
        locationId,
        materialId,
      })
    ).rejects.toThrow("só pode consultar estoques de obras");

    const engineerPolicies = await engineer.query(
      api.inventoryStockPolicies.listForMaterial,
      { materialId }
    );
    expect(engineerPolicies).toEqual([]);

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

    const purchasingCatalog = await purchasing.query(api.materials.get, {
      materialId,
    });
    expect(purchasingCatalog?.centralQuantity).toBe(4);

    const engineerCatalog = await engineer.query(api.materials.get, {
      materialId,
    });
    expect(engineerCatalog?.centralQuantity).toBeNull();
    expect(engineerCatalog?.centralReplenishmentState).toBe("unconfigured");
  });
});
