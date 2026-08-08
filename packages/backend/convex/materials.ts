import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  allocateNextSku,
  assertUniqueBarcode,
  assertUniqueSku,
  buildMaterialSearchText,
  materialMatchesSearch,
  normalizeBarcode,
  normalizeSku,
  toMaterialCatalogRow,
  toMaterialListRow,
  validateUnitsPerPurchaseUnit,
} from "./lib/compras/catalog";
import { engineeringOrPurchasingQuery, purchasingMutation } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import { materialStatus, replenishmentState } from "./schema";
import { normalizeText } from "./lib/compras/procurement";
import {
  bulkImportResultValidator,
  emptyBulkImportResult,
  requireTrimmedName,
} from "./lib/compras/bulkImport";
import { findInventoryLocation } from "./lib/inventory/operations";
import {
  canViewCentralInventory,
  computeReplenishmentState,
  getStockPolicy,
} from "./lib/inventory/stockPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const technicalAttributeValidator = v.object({
  key: v.string(),
  value: v.string(),
});

export const materialValidator = v.object({
  _id: v.id("materials"),
  _creationTime: v.number(),
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  spec: v.union(v.string(), v.null()),
  brandPreference: v.union(v.string(), v.null()),
  technicalAttributes: v.union(
    v.array(technicalAttributeValidator),
    v.null()
  ),
  active: v.boolean(),
  status: v.union(materialStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

export const materialCatalogValidator = v.object({
  _id: v.id("materials"),
  _creationTime: v.number(),
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  barcode: v.union(v.string(), v.null()),
  manufacturer: v.union(v.string(), v.null()),
  manufacturerPartNumber: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  purchaseUnit: v.union(v.string(), v.null()),
  unitsPerPurchaseUnit: v.union(v.number(), v.null()),
  trackInventory: v.boolean(),
  spec: v.union(v.string(), v.null()),
  brandPreference: v.union(v.string(), v.null()),
  technicalAttributes: v.union(
    v.array(technicalAttributeValidator),
    v.null()
  ),
  active: v.boolean(),
  status: v.union(materialStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  centralReplenishmentState: replenishmentState,
  centralQuantity: v.union(v.number(), v.null()),
});

function sanitizeTechnicalAttributes(
  attributes: Array<{ key: string; value: string }> | undefined
): Array<{ key: string; value: string }> | undefined {
  if (attributes === undefined) return undefined;
  if (attributes.length > 20) {
    throw new Error("Um material pode ter no máximo 20 atributos técnicos");
  }

  const result: Array<{ key: string; value: string }> = [];
  const keys = new Set<string>();
  for (const attribute of attributes) {
    const key = normalizeText(attribute.key);
    const value = attribute.value.trim();
    if (!key || !value) {
      throw new Error("Preencha a chave e o valor de todos os atributos técnicos");
    }
    if (keys.has(key)) {
      throw new Error(`Atributo técnico duplicado: ${key}`);
    }
    keys.add(key);
    result.push({ key, value });
  }
  return result;
}

async function buildCatalogRow(
  ctx: QueryCtx,
  material: Doc<"materials">,
  options: { includeCentralStock: boolean }
) {
  let centralQuantity: number | null = null;
  let centralReplenishmentState: "unconfigured" | "healthy" | "reorder" | "below_minimum" =
    "unconfigured";

  if (options.includeCentralStock) {
    const centralLocation = await findInventoryLocation(ctx, undefined);
    if (centralLocation) {
      const balance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q
            .eq("locationId", centralLocation._id)
            .eq("materialId", material._id)
        )
        .unique();
      centralQuantity = balance?.quantity ?? 0;
      const policy = await getStockPolicy(
        ctx,
        centralLocation._id,
        material._id
      );
      centralReplenishmentState = computeReplenishmentState(
        centralQuantity,
        policy
      ).state;
    }
  }

  return {
    ...toMaterialCatalogRow(material),
    centralReplenishmentState,
    centralQuantity,
  };
}

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(materialValidator),
  handler: async (ctx, args) => {
    let materials = await ctx.db.query("materials").order("desc").collect();
    if (args.activeOnly) {
      materials = materials.filter((m) => m.active);
    }
    if (args.search?.trim()) {
      materials = materials.filter((m) =>
        materialMatchesSearch(m, args.search!)
      );
    }
    return materials.map(toMaterialListRow);
  },
});

export const listCatalog = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(materialCatalogValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const includeCentralStock = canViewCentralInventory(ctx.user);
    const search = args.search?.trim();
    let results;
    if (search) {
      const all = await ctx.db.query("materials").order("desc").collect();
      const filtered = all.filter((material) => {
        if (args.activeOnly && !material.active) return false;
        return materialMatchesSearch(material, search);
      });
      const start = args.paginationOpts.cursor
        ? Number.parseInt(args.paginationOpts.cursor, 10)
        : 0;
      const page = filtered.slice(start, start + args.paginationOpts.numItems);
      const next = start + args.paginationOpts.numItems;
      results = {
        page,
        isDone: next >= filtered.length,
        continueCursor: String(next),
      };
    } else if (args.activeOnly) {
      results = await ctx.db
        .query("materials")
        .withIndex("by_active", (q) => q.eq("active", true))
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      results = await ctx.db
        .query("materials")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (material) =>
          buildCatalogRow(ctx, material, { includeCentralStock })
        )
      ),
    };
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.union(materialCatalogValidator, v.null()),
  handler: async (ctx, args) => {
    const m = await ctx.db.get("materials", args.materialId);
    return m
      ? await buildCatalogRow(ctx, m, {
          includeCentralStock: canViewCentralInventory(ctx.user),
        })
      : null;
  },
});

export const suggest = engineeringOrPurchasingQuery({
  args: { term: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("materials"),
      name: v.string(),
      sku: v.union(v.string(), v.null()),
      unit: v.union(v.string(), v.null()),
      matchType: v.union(
        v.literal("alias"),
        v.literal("name"),
        v.literal("sku"),
        v.literal("barcode")
      ),
    })
  ),
  handler: async (ctx, args) => {
    const term = normalizeText(args.term);
    if (!term) return [];
    const limit = args.limit ?? 8;

    const aliasHits = await ctx.db
      .query("materialAliases")
      .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", term))
      .take(limit);

    const results: Array<{
      _id: Id<"materials">;
      name: string;
      sku: string | null;
      unit: string | null;
      matchType: "alias" | "name" | "sku" | "barcode";
    }> = [];

    for (const alias of aliasHits) {
      const m = await ctx.db.get("materials", alias.materialId);
      if (m?.active) {
        results.push({
          _id: m._id,
          name: m.name,
          sku: m.sku ?? null,
          unit: m.unit ?? null,
          matchType: "alias",
        });
      }
    }

    const skuHit = await ctx.db
      .query("materials")
      .withIndex("by_sku", (q) => q.eq("sku", normalizeSku(args.term)))
      .unique();
    if (skuHit?.active && !results.some((r) => r._id === skuHit._id)) {
      results.push({
        _id: skuHit._id,
        name: skuHit.name,
        sku: skuHit.sku ?? null,
        unit: skuHit.unit ?? null,
        matchType: "sku",
      });
    }

    const barcodeHit = await ctx.db
      .query("materials")
      .withIndex("by_barcode", (q) => q.eq("barcode", normalizeBarcode(args.term)))
      .unique();
    if (
      barcodeHit?.active &&
      !results.some((r) => r._id === barcodeHit._id)
    ) {
      results.push({
        _id: barcodeHit._id,
        name: barcodeHit.name,
        sku: barcodeHit.sku ?? null,
        unit: barcodeHit.unit ?? null,
        matchType: "barcode",
      });
    }

    const all = await ctx.db.query("materials").collect();
    for (const m of all) {
      if (!m.active) continue;
      if (results.some((r) => r._id === m._id)) continue;
      if (materialMatchesSearch(m, term)) {
        results.push({
          _id: m._id,
          name: m.name,
          sku: m.sku ?? null,
          unit: m.unit ?? null,
          matchType: "name",
        });
      }
      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  },
});

export const create = purchasingMutation({
  args: {
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    aliases: v.optional(v.array(v.string())),
  },
  returns: v.id("materials"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do material");

    validateUnitsPerPurchaseUnit(args.unitsPerPurchaseUnit);

    const sku = args.sku?.trim()
      ? normalizeSku(args.sku)
      : await allocateNextSku(ctx);
    await assertUniqueSku(ctx, sku);

    const barcode = args.barcode?.trim()
      ? normalizeBarcode(args.barcode)
      : undefined;
    if (barcode) await assertUniqueBarcode(ctx, barcode);

    const now = Date.now();
    const category = args.category?.trim() || undefined;
    const manufacturer = args.manufacturer?.trim() || undefined;
    const manufacturerPartNumber =
      args.manufacturerPartNumber?.trim() || undefined;
    const unit = args.unit?.trim() || undefined;
    const purchaseUnit = args.purchaseUnit?.trim() || undefined;
    const spec = args.spec?.trim() || undefined;
    const brandPreference = args.brandPreference?.trim() || undefined;

    const materialId = await ctx.db.insert("materials", {
      name,
      sku,
      barcode,
      manufacturer,
      manufacturerPartNumber,
      category,
      unit,
      purchaseUnit,
      unitsPerPurchaseUnit: args.unitsPerPurchaseUnit,
      trackInventory: args.trackInventory ?? true,
      spec,
      brandPreference,
      technicalAttributes: sanitizeTechnicalAttributes(args.technicalAttributes),
      searchText: buildMaterialSearchText({
        name,
        sku,
        barcode,
        category,
        manufacturer,
        manufacturerPartNumber,
        brandPreference,
        spec,
      }),
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const alias of args.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      await ctx.db.insert("materialAliases", {
        alias: trimmed,
        aliasNormalized: normalizeText(trimmed),
        materialId,
        createdAt: now,
      });
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "materials",
      recordId: materialId,
      details: `${sku} — ${name}`,
    });

    return materialId;
  },
});

const bulkMaterialItemValidator = v.object({
  name: v.string(),
  category: v.optional(v.string()),
  unit: v.optional(v.string()),
  spec: v.optional(v.string()),
  brandPreference: v.optional(v.string()),
  aliases: v.optional(v.array(v.string())),
});

export const bulkCreate = purchasingMutation({
  args: {
    items: v.array(bulkMaterialItemValidator),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    if (args.items.length > 200) {
      throw new Error("Máximo de 200 materiais por importação");
    }

    const result = emptyBulkImportResult();
    const now = Date.now();
    const existing = await ctx.db.query("materials").collect();
    const existingNames = new Set(existing.map((m) => normalizeText(m.name)));

    let firstCreatedId: string | null = null;

    for (let i = 0; i < args.items.length; i++) {
      const row = i + 1;
      const item = args.items[i]!;
      const nameCheck = requireTrimmedName(item.name, row, "Nome");
      if (!nameCheck.ok) {
        result.errors.push(nameCheck.error);
        continue;
      }

      const normalizedName = normalizeText(nameCheck.name);
      if (existingNames.has(normalizedName)) {
        result.skipped++;
        continue;
      }

      const materialId = await ctx.db.insert("materials", {
        name: nameCheck.name,
        category: item.category?.trim() || undefined,
        unit: item.unit?.trim() || undefined,
        spec: item.spec?.trim() || undefined,
        brandPreference: item.brandPreference?.trim() || undefined,
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      for (const alias of item.aliases ?? []) {
        const trimmed = alias.trim();
        if (!trimmed) continue;
        await ctx.db.insert("materialAliases", {
          alias: trimmed,
          aliasNormalized: normalizeText(trimmed),
          materialId,
          createdAt: now,
        });
      }

      existingNames.add(normalizedName);
      if (!firstCreatedId) firstCreatedId = materialId;
      result.created++;
    }

    if (result.created > 0 && firstCreatedId) {
      await logAudit(ctx, ctx.user, {
        action: "create",
        tableName: "materials",
        recordId: firstCreatedId,
        details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
      });
    }

    return result;
  },
});

export const update = purchasingMutation({
  args: {
    materialId: v.id("materials"),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.union(v.string(), v.null())),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    active: v.optional(v.boolean()),
    status: v.optional(materialStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const material = await ctx.db.get("materials", args.materialId);
    if (!material) throw new Error("Material não encontrado");

    const before = {
      name: material.name,
      category: material.category,
      unit: material.unit,
      spec: material.spec,
      brandPreference: material.brandPreference,
      active: material.active,
      status: material.status,
    };
    validateUnitsPerPurchaseUnit(args.unitsPerPurchaseUnit);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do material");
      updates.name = name;
    }
    if (args.sku !== undefined) {
      const sku = normalizeSku(args.sku);
      if (!sku) throw new Error("Informe o SKU");
      await assertUniqueSku(ctx, sku, args.materialId);
      updates.sku = sku;
    }
    if (args.barcode !== undefined) {
      const barcode =
        args.barcode === null ? undefined : normalizeBarcode(args.barcode);
      if (barcode) {
        await assertUniqueBarcode(ctx, barcode, args.materialId);
      }
      updates.barcode = barcode;
    }
    if (args.manufacturer !== undefined) {
      updates.manufacturer = args.manufacturer.trim() || undefined;
    }
    if (args.manufacturerPartNumber !== undefined) {
      updates.manufacturerPartNumber =
        args.manufacturerPartNumber.trim() || undefined;
    }
    if (args.category !== undefined) {
      updates.category = args.category.trim() || undefined;
    }
    if (args.unit !== undefined) updates.unit = args.unit.trim() || undefined;
    if (args.purchaseUnit !== undefined) {
      updates.purchaseUnit = args.purchaseUnit.trim() || undefined;
    }
    if (args.unitsPerPurchaseUnit !== undefined) {
      updates.unitsPerPurchaseUnit = args.unitsPerPurchaseUnit;
    }
    if (args.trackInventory !== undefined) {
      updates.trackInventory = args.trackInventory;
    }
    if (args.spec !== undefined) updates.spec = args.spec.trim() || undefined;
    if (args.brandPreference !== undefined) {
      updates.brandPreference = args.brandPreference.trim() || undefined;
    }
    if (args.technicalAttributes !== undefined) {
      updates.technicalAttributes = sanitizeTechnicalAttributes(
        args.technicalAttributes
      );
    }
    if (args.active !== undefined) {
      updates.active = args.active;
      if (args.status === undefined) {
        updates.status = args.active ? "active" : "archived";
      }
    }
    if (args.status !== undefined) updates.status = args.status;

    const next = { ...material, ...updates };
    updates.searchText = buildMaterialSearchText({
      name: next.name,
      sku: next.sku,
      barcode: next.barcode,
      category: next.category,
      manufacturer: next.manufacturer,
      manufacturerPartNumber: next.manufacturerPartNumber,
      brandPreference: next.brandPreference,
      spec: next.spec,
    });

    await ctx.db.patch("materials", args.materialId, updates);
    const afterDoc = await ctx.db.get("materials", args.materialId);
    const after = afterDoc
      ? {
          name: afterDoc.name,
          category: afterDoc.category,
          unit: afterDoc.unit,
          spec: afterDoc.spec,
          brandPreference: afterDoc.brandPreference,
          active: afterDoc.active,
          status: afterDoc.status,
        }
      : before;
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "materials",
      recordId: args.materialId,
      entityLabel: after.name,
      changes: diffFields(before, after, [
        "name",
        "category",
        "unit",
        "spec",
        "brandPreference",
        "active",
        "status",
      ]),
      snapshotBefore: before,
      snapshotAfter: after,
    });
    return null;
  },
});

export const addAlias = purchasingMutation({
  args: {
    materialId: v.id("materials"),
    alias: v.string(),
  },
  returns: v.id("materialAliases"),
  handler: async (ctx, args) => {
    const material = await ctx.db.get("materials", args.materialId);
    if (!material) throw new Error("Material não encontrado");
    const alias = args.alias.trim();
    if (!alias) throw new Error("Informe o alias");

    return await ctx.db.insert("materialAliases", {
      alias,
      aliasNormalized: normalizeText(alias),
      materialId: args.materialId,
      createdAt: Date.now(),
    });
  },
});

export const listAliases = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.array(
    v.object({
      _id: v.id("materialAliases"),
      alias: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const aliases = await ctx.db
      .query("materialAliases")
      .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
      .collect();
    return aliases.map((a) => ({
      _id: a._id,
      alias: a.alias,
      createdAt: a.createdAt,
    }));
  },
});
