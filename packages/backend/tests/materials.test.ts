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

async function storeImageWithContentType(
  t: ReturnType<typeof setup>,
  bytes: string,
  contentType: string
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const imageId = await ctx.storage.store(
      new Blob([bytes], { type: contentType })
    );
    // convex-test's storage.store does not persist Blob.type as contentType.
    await (
      ctx.db as unknown as {
        patch: (
          table: "_storage",
          id: Id<"_storage">,
          value: { contentType: string }
        ) => Promise<void>;
      }
    ).patch("_storage", imageId, { contentType });
    return imageId;
  });
}

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

  test("stores, replaces and clears material image", async () => {
    const { t, purchasing, warehouse } = await seedCatalogUsers();

    await expect(
      warehouse.mutation(api.materials.generateUploadUrl, {})
    ).rejects.toThrow("compras");

    const uploadUrl = await purchasing.mutation(
      api.materials.generateUploadUrl,
      {}
    );
    expect(typeof uploadUrl).toBe("string");
    expect(uploadUrl.length).toBeGreaterThan(0);

    const firstImageId = await storeImageWithContentType(
      t,
      "first",
      "image/png"
    );
    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Perfil de alumínio",
      unit: "m",
      imageId: firstImageId,
    });
    const created = await purchasing.query(api.materials.get, { materialId });
    expect(created?.imageId).toBe(firstImageId);
    expect(created?.imageUrl).toEqual(expect.any(String));

    const secondImageId = await storeImageWithContentType(
      t,
      "second",
      "image/png"
    );
    await purchasing.mutation(api.materials.update, {
      materialId,
      imageId: secondImageId,
    });
    const replaced = await purchasing.query(api.materials.get, { materialId });
    expect(replaced?.imageId).toBe(secondImageId);

    await purchasing.mutation(api.materials.update, {
      materialId,
      imageId: null,
    });
    const cleared = await purchasing.query(api.materials.get, { materialId });
    expect(cleared?.imageId).toBeNull();
    expect(cleared?.imageUrl).toBeNull();
  });

  test("rejects unsupported material image content types", async () => {
    const { t, purchasing } = await seedCatalogUsers();

    const gifId = await storeImageWithContentType(t, "gif", "image/gif");

    await expect(
      purchasing.mutation(api.materials.create, {
        name: "Material com GIF",
        unit: "un",
        imageId: gifId,
      })
    ).rejects.toThrow("JPG, PNG ou WebP");

    const materialId = await purchasing.mutation(api.materials.create, {
      name: "Material sem imagem",
      unit: "un",
    });
    await expect(
      purchasing.mutation(api.materials.update, {
        materialId,
        imageId: gifId,
      })
    ).rejects.toThrow("JPG, PNG ou WebP");
  });

  test("listCatalog and listCategories support category filter", async () => {
    const { purchasing } = await seedCatalogUsers();
    await purchasing.mutation(api.materials.create, {
      name: "Tubo de cobre",
      category: "Ar Condicionado",
      unit: "m",
    });
    await purchasing.mutation(api.materials.create, {
      name: "Cabo flexível",
      category: "Elétrica",
      unit: "m",
    });

    const categories = await purchasing.query(api.materials.listCategories, {});
    expect(categories).toEqual(["Ar Condicionado", "Elétrica"]);

    const page = await purchasing.query(api.materials.listCatalog, {
      category: "Elétrica",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.name).toBe("Cabo flexível");
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

  test("shared aliases can point to several variants of the same family", async () => {
    const { purchasing } = await seedCatalogUsers();
    const firstId = await purchasing.mutation(api.materials.create, {
      name: "Tubo de Cobre",
      variantLabel: 'Split – 1"',
      unit: "m",
      aliases: ['cobre de 1"'],
    });
    const secondId = await purchasing.mutation(api.materials.create, {
      name: "Tubo de Cobre",
      variantLabel: 'VRF – 1"',
      unit: "m",
      aliases: ['cobre de 1"'],
    });
    expect(secondId).not.toBe(firstId);

    await purchasing.mutation(api.materials.addAlias, {
      materialId: firstId,
      alias: "cobre de 1",
    });
    await purchasing.mutation(api.materials.addAlias, {
      materialId: secondId,
      alias: "cobre de 1",
    });

    const suggestions = await purchasing.query(api.materials.suggest, {
      term: "cobre de 1",
      limit: 8,
    });
    const ids = suggestions.map((item) => item._id);
    expect(ids).toContain(firstId);
    expect(ids).toContain(secondId);
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
        sourceRowNumber: 1,
        quantity: 1,
        unit: "pç",
        unitCostCents: 10,
      },
      {
        name: "Damper de regulagem manual",
        variantLabel: "850x700mm",
        dimensions: { widthMm: 850, heightMm: 700 },
        sourceMaterialId: "5237",
        sourceRowNumber: 2,
        quantity: 1,
        unit: "peça",
        unitCostCents: 10,
      },
      {
        name: "Damper de regulagem manual",
        variantLabel: "900x850mm",
        dimensions: { widthMm: 900, heightMm: 850 },
        sourceMaterialId: "5237",
        sourceRowNumber: 3,
        quantity: 1,
        unit: "peça",
        unitCostCents: 10,
      },
    ];

    const first = await purchasing.mutation(api.materials.bulkCreate, {
      source: "estoque-2023",
      items,
    });
    expect(first.created).toBe(2);
    expect(first.skipped).toBe(1);

    const second = await purchasing.mutation(api.materials.bulkCreate, {
      source: "estoque-2023",
      items,
    });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(3);

    const balances = await t.run(async (ctx) => {
      return await ctx.db.query("inventoryBalances").collect();
    });
    expect(balances).toHaveLength(2);
    expect(
      balances.reduce((total, balance) => total + balance.quantity, 0)
    ).toBe(3);
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
    expect(balances.page[0]).toHaveProperty("variantLabel");

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

  test("estoque and compras can quick-create materials; engineer cannot", async () => {
    const { purchasing, warehouse, engineer } = await seedCatalogUsers();

    const fromWarehouse = await warehouse.mutation(
      api.inventory.quickCreateMaterial,
      {
        name: "Isolamento Térmico",
        variantLabel: 'Split – 1/4" – esp. 9 mm',
        unit: "m",
        category: "Ar Condicionado",
      }
    );
    expect(fromWarehouse.name).toBe("Isolamento Térmico");
    expect(fromWarehouse.variantLabel).toBe('Split – 1/4" – esp. 9 mm');
    expect(fromWarehouse.sku).toMatch(/^MAT-\d{6}$/);
    expect(fromWarehouse.unit).toBe("m");

    const fromPurchasing = await purchasing.mutation(
      api.inventory.quickCreateMaterial,
      {
        name: "Isolamento Térmico",
        variantLabel: 'Split – 1/2" – esp. 9 mm',
        unit: "m",
        category: "Ar Condicionado",
      }
    );
    expect(fromPurchasing.materialId).not.toBe(fromWarehouse.materialId);

    await expect(
      warehouse.mutation(api.inventory.quickCreateMaterial, {
        name: "Isolamento Térmico",
        variantLabel: 'Split – 1/4" – esp. 9 mm',
        unit: "m",
      })
    ).rejects.toThrow("Material já cadastrado");

    await expect(
      warehouse.mutation(api.inventory.quickCreateMaterial, { name: "   " })
    ).rejects.toThrow("Informe o nome do material");

    await expect(
      engineer.mutation(api.inventory.quickCreateMaterial, {
        name: "Tubo de Cobre",
        unit: "m",
      })
    ).rejects.toThrow("estoque ou compras");

    const suggestions = await warehouse.query(api.materials.suggest, {
      term: "isolamento",
      limit: 8,
    });
    expect(
      suggestions.some((item) => item.variantLabel?.includes("1/4"))
    ).toBe(true);

    const access = await warehouse.query(api.inventory.getAccess, {});
    expect(access.canQuickCreateMaterial).toBe(true);
    const engineerAccess = await engineer.query(api.inventory.getAccess, {});
    expect(engineerAccess.canQuickCreateMaterial).toBe(false);
  });

  test("bulkCreate stores dimensions and technical attributes", async () => {
    const { purchasing } = await seedCatalogUsers();
    const result = await purchasing.mutation(api.materials.bulkCreate, {
      source: "catalog-attrs",
      items: [
        {
          name: "Tubo de Cobre",
          variantLabel: 'Split – 1/4"',
          sourceRowNumber: 1,
          category: "Ar Condicionado",
          unit: "m",
          dimensions: { thicknessMm: 9 },
          technicalAttributes: [
            { key: "tubeSize", value: '1/4"' },
            { key: "application", value: "Split" },
          ],
        },
      ],
    });
    expect(result.created).toBe(1);

    const suggestions = await purchasing.query(api.materials.suggest, {
      term: "cobre",
    });
    const created = suggestions.find((item) => item.variantLabel?.includes("1/4"));
    expect(created).toBeTruthy();
    const material = await purchasing.query(api.materials.get, {
      materialId: created!._id,
    });
    expect(material?.dimensions?.thicknessMm).toBe(9);
    expect(material?.technicalAttributes).toEqual(
      expect.arrayContaining([
        { key: "tubesize", value: '1/4"' },
        { key: "application", value: "Split" },
      ])
    );
  });

  test("merge sums stock, re-points history, aliases source name, and archives origin", async () => {
    const { t, purchasing, engineer } = await seedCatalogUsers();
    const targetId = await purchasing.mutation(api.materials.create, {
      name: "Grelha de Insuflamento com Registro Anodizado",
      variantLabel: "180x240mm",
      unit: "un",
    });
    const sourceId = await purchasing.mutation(api.materials.create, {
      name: "Grelha com Registro Anodizado",
      variantLabel: "18x24cm",
      unit: "un",
    });
    const source = await purchasing.query(api.materials.get, {
      materialId: sourceId,
    });
    const sourceSku = source?.sku;
    expect(sourceSku).toBeTruthy();

    const created = await purchasing.mutation(api.inventory.createDocument, {
      type: "entry",
      lines: [
        { materialId: targetId, quantity: 12 },
        { materialId: sourceId, quantity: 3 },
      ],
    });
    await purchasing.mutation(api.inventory.postDocument, {
      documentId: created.documentId,
    });

    const takeoffId = await engineer.mutation(api.takeoffs.create, {
      name: "Bocas de ar",
    });
    const takeoffItemId = await engineer.mutation(api.takeoffs.addItem, {
      takeoffId,
      rawDescription: "Grelha anodizada 18x24",
      materialId: sourceId,
      quantity: 2,
      unit: "un",
    });
    await purchasing.mutation(api.priceEvents.add, {
      materialId: sourceId,
      unitPriceCents: 4500,
      source: "manual",
      occurredAt: Date.now(),
    });

    const supplierId = await purchasing.mutation(api.suppliers.create, {
      name: "Fornecedor Grelhas",
    });
    await purchasing.mutation(api.suppliers.upsertMaterialOffering, {
      supplierId,
      materialId: sourceId,
      supplierCode: "GR-180",
    });
    await purchasing.mutation(api.suppliers.upsertMaterialOffering, {
      supplierId,
      materialId: targetId,
      supplierCode: "GR-CANON",
    });

    const preview = await purchasing.query(api.materials.mergePreview, {
      sourceId,
      targetId,
    });
    expect(
      preview.locations.some((location) => location.mergedQuantity === 15)
    ).toBe(true);

    const result = await purchasing.mutation(api.materials.merge, {
      sourceId,
      targetId,
    });
    expect(result.targetId).toBe(targetId);

    const balances = await t.run(async (ctx) => {
      const sourceBalances = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_material", (q) => q.eq("materialId", sourceId))
        .collect();
      const targetBalances = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_material", (q) => q.eq("materialId", targetId))
        .collect();
      const takeoffItem = await ctx.db.get("takeoffItems", takeoffItemId);
      const priceEvents = await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", targetId))
        .collect();
      const sourceOfferings = await ctx.db
        .query("supplierMaterials")
        .withIndex("by_material", (q) => q.eq("materialId", sourceId))
        .collect();
      const targetOfferings = await ctx.db
        .query("supplierMaterials")
        .withIndex("by_material", (q) => q.eq("materialId", targetId))
        .collect();
      return {
        sourceBalanceCount: sourceBalances.length,
        targetQuantity: targetBalances.reduce(
          (sum, balance) => sum + balance.quantity,
          0
        ),
        takeoffMaterialId: takeoffItem?.materialId,
        priceEventCount: priceEvents.length,
        sourceOfferingCount: sourceOfferings.length,
        targetOfferingCodes: targetOfferings
          .map((offering) => offering.supplierCode)
          .sort(),
      };
    });
    expect(balances.sourceBalanceCount).toBe(0);
    expect(balances.targetQuantity).toBe(15);
    expect(balances.takeoffMaterialId).toBe(targetId);
    expect(balances.priceEventCount).toBe(1);
    expect(balances.sourceOfferingCount).toBe(0);
    expect(balances.targetOfferingCodes).toEqual(["GR-CANON"]);

    const archived = await purchasing.query(api.materials.get, {
      materialId: sourceId,
    });
    expect(archived?.active).toBe(false);
    expect(archived?.status).toBe("archived");
    expect(archived?.sku).toBeNull();

    const suggestions = await purchasing.query(api.materials.suggest, {
      term: "Grelha com Registro Anodizado",
    });
    expect(suggestions.some((item) => item._id === targetId)).toBe(true);
    expect(suggestions.some((item) => item._id === sourceId)).toBe(false);

    const skuSuggestions = await purchasing.query(api.materials.suggest, {
      term: sourceSku!,
    });
    expect(skuSuggestions.some((item) => item._id === targetId)).toBe(true);

    await expect(
      purchasing.mutation(api.materials.merge, { sourceId, targetId })
    ).rejects.toThrow("já foi mesclado");
  });
});
