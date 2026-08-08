import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  allocateNextSku,
  assertUniqueBarcode,
  assertUniqueSku,
  buildMaterialIdentityKey,
  buildMaterialSearchText,
  deriveVariantLabel,
  findMaterialByIdentity,
  materialMatchesSearch,
  normalizeBarcode,
  normalizeSku,
  normalizeUnit,
  sanitizeDimensions,
  toMaterialCatalogRow,
  toMaterialListRow,
  validateUnitsPerPurchaseUnit,
} from "./lib/compras/catalog";
import { engineeringOrPurchasingQuery, purchasingMutation } from "./lib/rbac";
import { logAudit, diffFields } from "./lib/audit";
import { materialDimensions, materialStatus, replenishmentState } from "./schema";
import { normalizeText } from "./lib/compras/procurement";
import {
  bulkImportResultValidator,
  emptyBulkImportResult,
  requireTrimmedName,
} from "./lib/compras/bulkImport";
import {
  createInventoryDocument,
  findInventoryLocation,
  postInventoryDocument,
} from "./lib/inventory/operations";
import {
  canViewCentralInventory,
  computeReplenishmentState,
  getStockPolicy,
} from "./lib/inventory/stockPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const technicalAttributeValidator = v.object({
  key: v.string(),
  value: v.string(),
});

export const materialDimensionsValidator = materialDimensions;

export const materialValidator = v.object({
  _id: v.id("materials"),
  _creationTime: v.number(),
  name: v.string(),
  familyId: v.id("materialFamilies"),
  variantLabel: v.union(v.string(), v.null()),
  dimensions: v.union(materialDimensionsValidator, v.null()),
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
  familyId: v.id("materialFamilies"),
  variantLabel: v.union(v.string(), v.null()),
  dimensions: v.union(materialDimensionsValidator, v.null()),
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

export const materialFamilyValidator = v.object({
  _id: v.id("materialFamilies"),
  name: v.string(),
  nameNormalized: v.string(),
  category: v.union(v.string(), v.null()),
  baseUnit: v.union(v.string(), v.null()),
  active: v.boolean(),
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

async function findOrCreateFamily(
  ctx: MutationCtx,
  input: {
    familyId?: Id<"materialFamilies">;
    name: string;
    category?: string;
    baseUnit?: string;
  }
): Promise<Doc<"materialFamilies">> {
  if (input.familyId) {
    const family = await ctx.db.get("materialFamilies", input.familyId);
    if (!family) throw new Error("Família de material não encontrada");
    return family;
  }

  const nameNormalized = normalizeText(input.name);
  const existing = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  if (existing) return existing;

  const now = Date.now();
  const familyId = await ctx.db.insert("materialFamilies", {
    name: input.name,
    nameNormalized,
    category: input.category,
    baseUnit: input.baseUnit,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const family = await ctx.db.get("materialFamilies", familyId);
  if (!family) throw new Error("Falha ao criar família de material");
  return family;
}

async function assertUniqueIdentity(
  ctx: QueryCtx | MutationCtx,
  identityKey: string,
  excludeMaterialId?: Id<"materials">
): Promise<void> {
  const hit = await findMaterialByIdentity(ctx, {
    identityKey,
    excludeMaterialId,
  });
  if (hit) {
    const detail = hit.variantLabel ? ` (${hit.variantLabel})` : "";
    throw new Error(`Material já cadastrado: ${hit.name}${detail}`);
  }
}

async function insertUniqueAlias(
  ctx: MutationCtx,
  materialId: Id<"materials">,
  alias: string,
  createdAt: number
): Promise<Id<"materialAliases">> {
  const aliasNormalized = normalizeText(alias);
  const existing = await ctx.db
    .query("materialAliases")
    .withIndex("by_alias_normalized", (q) =>
      q.eq("aliasNormalized", aliasNormalized)
    )
    .first();
  if (existing) {
    if (existing.materialId === materialId) return existing._id;
    throw new Error(`Alias já pertence a outro material: ${alias}`);
  }
  return await ctx.db.insert("materialAliases", {
    alias,
    aliasNormalized,
    materialId,
    createdAt,
  });
}

function materialIdentityInput(input: {
  familyId: Id<"materialFamilies">;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  unit?: string;
  variantLabel?: string;
  dimensions?: {
    widthMm?: number;
    heightMm?: number;
    lengthMm?: number;
    thicknessMm?: number;
    diameterMm?: number;
  };
  technicalAttributes?: Array<{ key: string; value: string }>;
}) {
  return buildMaterialIdentityKey(input);
}

function nameSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
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

export const listFamilies = engineeringOrPurchasingQuery({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(materialFamilyValidator),
  handler: async (ctx, args) => {
    const families = args.activeOnly
      ? await ctx.db
          .query("materialFamilies")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect()
      : await ctx.db.query("materialFamilies").collect();
    return families.map((family) => ({
      _id: family._id,
      name: family.name,
      nameNormalized: family.nameNormalized,
      category: family.category ?? null,
      baseUnit: family.baseUnit ?? null,
      active: family.active,
    }));
  },
});

export const listVariants = engineeringOrPurchasingQuery({
  args: { familyId: v.id("materialFamilies") },
  returns: v.array(materialValidator),
  handler: async (ctx, args) => {
    const variants = await ctx.db
      .query("materials")
      .withIndex("by_family", (q) => q.eq("familyId", args.familyId))
      .collect();
    return variants.map(toMaterialListRow);
  },
});

export const findDuplicateCandidates = engineeringOrPurchasingQuery({
  args: {
    name: v.string(),
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    unit: v.optional(v.string()),
    dimensions: v.optional(materialDimensionsValidator),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    excludeMaterialId: v.optional(v.id("materials")),
  },
  returns: v.array(
    v.object({
      materialId: v.id("materials"),
      name: v.string(),
      variantLabel: v.union(v.string(), v.null()),
      sku: v.union(v.string(), v.null()),
      exact: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const normalizedName = normalizeText(args.name);
    let familyId = args.familyId;
    if (!familyId) {
      const family = await ctx.db
        .query("materialFamilies")
        .withIndex("by_name_normalized", (q) =>
          q.eq("nameNormalized", normalizedName)
        )
        .first();
      familyId = family?._id;
    }

    const materials = familyId
      ? await ctx.db
          .query("materials")
          .withIndex("by_family", (q) => q.eq("familyId", familyId))
          .take(25)
      : await ctx.db.query("materials").order("desc").take(100);
    const identityKey = familyId
      ? materialIdentityInput({
          familyId,
          manufacturer: args.manufacturer,
          manufacturerPartNumber: args.manufacturerPartNumber,
          unit: args.unit,
          variantLabel: args.variantLabel,
          dimensions: args.dimensions,
          technicalAttributes: args.technicalAttributes,
        })
      : null;

    return materials
      .filter((material) => material._id !== args.excludeMaterialId)
      .filter(
        (material) =>
          material.familyId === familyId ||
          normalizeText(material.name).includes(normalizedName) ||
          normalizedName.includes(normalizeText(material.name)) ||
          nameSimilarity(material.name, args.name) >= 0.6
      )
      .slice(0, 8)
      .map((material) => ({
        materialId: material._id,
        name: material.name,
        variantLabel: material.variantLabel ?? null,
        sku: material.sku ?? null,
        exact: identityKey !== null && material.identityKey === identityKey,
      }));
  },
});

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
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.string()),
    dimensions: v.optional(materialDimensionsValidator),
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
    const dimensions = sanitizeDimensions(args.dimensions);
    const technicalAttributes = sanitizeTechnicalAttributes(
      args.technicalAttributes
    );

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
    const unit = normalizeUnit(args.unit);
    const purchaseUnit = args.purchaseUnit?.trim() || undefined;
    const spec = args.spec?.trim() || undefined;
    const brandPreference = args.brandPreference?.trim() || undefined;
    const variantLabel = deriveVariantLabel({
      variantLabel: args.variantLabel,
      dimensions,
    });
    const family = await findOrCreateFamily(ctx, {
      familyId: args.familyId,
      name,
      category,
      baseUnit: unit,
    });
    const identityKey = materialIdentityInput({
      familyId: family._id,
      manufacturer,
      manufacturerPartNumber,
      unit,
      variantLabel,
      dimensions,
      technicalAttributes,
    });
    await assertUniqueIdentity(ctx, identityKey);

    const materialId = await ctx.db.insert("materials", {
      name: family.name,
      familyId: family._id,
      variantLabel,
      dimensions,
      identityKey,
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
      technicalAttributes,
      searchText: buildMaterialSearchText({
        name: family.name,
        variantLabel,
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
      await insertUniqueAlias(ctx, materialId, trimmed, now);
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "materials",
      recordId: materialId,
      details: `${sku} — ${family.name}${variantLabel ? ` (${variantLabel})` : ""}`,
    });

    return materialId;
  },
});

const bulkMaterialItemValidator = v.object({
  name: v.string(),
  variantLabel: v.optional(v.string()),
  dimensions: v.optional(materialDimensionsValidator),
  sourceMaterialId: v.optional(v.string()),
  sourceDetailId: v.optional(v.string()),
  sourceRowNumber: v.number(),
  quantity: v.optional(v.number()),
  unitCostCents: v.optional(v.number()),
  category: v.optional(v.string()),
  unit: v.optional(v.string()),
  spec: v.optional(v.string()),
  brandPreference: v.optional(v.string()),
  aliases: v.optional(v.array(v.string())),
});

export const bulkCreate = purchasingMutation({
  args: {
    items: v.array(bulkMaterialItemValidator),
    source: v.optional(v.string()),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    if (args.items.length > 200) {
      throw new Error("Máximo de 200 materiais por importação");
    }

    const result = emptyBulkImportResult();
    const now = Date.now();
    const source = args.source?.trim() || "catalog-import";
    let firstCreatedId: string | null = null;
    const inventoryLines = new Map<
      Id<"materials">,
      { quantity: number; unitCostCents?: number }
    >();

    for (let i = 0; i < args.items.length; i++) {
      const row = i + 1;
      const item = args.items[i]!;
      const nameCheck = requireTrimmedName(item.name, row, "Nome");
      if (!nameCheck.ok) {
        result.errors.push(nameCheck.error);
        continue;
      }
      if (
        item.quantity !== undefined &&
        (!Number.isFinite(item.quantity) || item.quantity < 0)
      ) {
        result.errors.push({
          row,
          message: "Quantidade deve ser um número não negativo",
        });
        continue;
      }
      if (
        !Number.isInteger(item.sourceRowNumber) ||
        item.sourceRowNumber <= 0
      ) {
        result.errors.push({
          row,
          message: "Número da linha de origem deve ser um inteiro positivo",
        });
        continue;
      }
      if (
        item.unitCostCents !== undefined &&
        (!Number.isFinite(item.unitCostCents) || item.unitCostCents < 0)
      ) {
        result.errors.push({
          row,
          message: "Custo unitário deve ser um número não negativo",
        });
        continue;
      }

      const family = await findOrCreateFamily(ctx, {
        name: nameCheck.name,
        category: item.category?.trim() || undefined,
        baseUnit: normalizeUnit(item.unit),
      });
      const dimensions = sanitizeDimensions(item.dimensions);
      const variantLabel = deriveVariantLabel({
        variantLabel: item.variantLabel,
        dimensions,
      });
      const unit = normalizeUnit(item.unit);
      const identityKey = materialIdentityInput({
        familyId: family._id,
        unit,
        variantLabel,
        dimensions,
      });
      const rowKey = [
        item.sourceMaterialId?.trim() ?? "",
        item.sourceDetailId?.trim() ?? "",
        identityKey,
        item.sourceRowNumber,
      ].join(":");
      const importedRow = await ctx.db
        .query("materialImportRows")
        .withIndex("by_source_row", (q) =>
          q.eq("source", source).eq("rowKey", rowKey)
        )
        .first();
      if (importedRow) {
        result.skipped++;
        continue;
      }
      const existingIdentity = await findMaterialByIdentity(ctx, {
        identityKey,
      });
      let materialId = existingIdentity?._id;
      if (materialId) {
        result.skipped++;
      } else {
        const sku = await allocateNextSku(ctx);
        materialId = await ctx.db.insert("materials", {
          name: family.name,
          familyId: family._id,
          variantLabel,
          dimensions,
          identityKey,
          sku,
          category: item.category?.trim() || undefined,
          unit,
          spec: item.spec?.trim() || undefined,
          brandPreference: item.brandPreference?.trim() || undefined,
          searchText: buildMaterialSearchText({
            name: family.name,
            variantLabel,
            sku,
            category: item.category?.trim() || undefined,
            brandPreference: item.brandPreference?.trim() || undefined,
            spec: item.spec?.trim() || undefined,
          }),
          trackInventory: true,
          active: true,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        if (!firstCreatedId) firstCreatedId = materialId;
        result.created++;
      }

      for (const alias of item.aliases ?? []) {
        const trimmed = alias.trim();
        if (!trimmed) continue;
        await insertUniqueAlias(ctx, materialId, trimmed, now);
      }

      await ctx.db.insert("materialImportRows", {
        source,
        rowKey,
        materialId,
        sourceMaterialId: item.sourceMaterialId?.trim() || undefined,
        sourceDetailId: item.sourceDetailId?.trim() || undefined,
        sourceRowNumber: item.sourceRowNumber,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        importedAt: now,
      });
      if (item.quantity !== undefined && item.quantity > 0) {
        const current = inventoryLines.get(materialId);
        inventoryLines.set(materialId, {
          quantity: (current?.quantity ?? 0) + item.quantity,
          unitCostCents: item.unitCostCents ?? current?.unitCostCents,
        });
      }
    }

    if (inventoryLines.size > 0) {
      const document = await createInventoryDocument(ctx, ctx.user, {
        type: "entry",
        reference: `Importação ${source}`,
        notes: "Saldo inicial importado da planilha de origem",
        lines: [...inventoryLines.entries()].map(([materialId, line]) => ({
          materialId,
          quantity: line.quantity,
          unitCostCents: line.unitCostCents,
        })),
      });
      await postInventoryDocument(ctx, ctx.user, document.documentId);
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
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.union(v.string(), v.null())),
    dimensions: v.optional(v.union(materialDimensionsValidator, v.null())),
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
    let familyId = args.familyId ?? material.familyId;
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome do material");
      const family = await findOrCreateFamily(ctx, {
        familyId: args.familyId,
        name,
        category: args.category?.trim() || material.category,
        baseUnit: normalizeUnit(args.unit) ?? material.unit,
      });
      familyId = family._id;
      updates.familyId = family._id;
      updates.name = family.name;
    } else if (args.familyId !== undefined) {
      const family = await ctx.db.get("materialFamilies", args.familyId);
      if (!family) throw new Error("Família de material não encontrada");
      updates.name = family.name;
      updates.familyId = family._id;
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
    if (args.unit !== undefined) updates.unit = normalizeUnit(args.unit);
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
    if (args.variantLabel !== undefined) {
      updates.variantLabel = args.variantLabel?.trim() || undefined;
    }
    if (args.dimensions !== undefined) {
      updates.dimensions = sanitizeDimensions(args.dimensions ?? undefined);
    }
    if (args.active !== undefined) {
      updates.active = args.active;
      if (args.status === undefined) {
        updates.status = args.active ? "active" : "archived";
      }
    }
    if (args.status !== undefined) updates.status = args.status;

    const next = { ...material, ...updates } as Doc<"materials">;
    const identityKey = materialIdentityInput({
      familyId,
      manufacturer: next.manufacturer,
      manufacturerPartNumber: next.manufacturerPartNumber,
      unit: next.unit,
      variantLabel: next.variantLabel,
      dimensions: next.dimensions,
      technicalAttributes: next.technicalAttributes,
    });
    await assertUniqueIdentity(ctx, identityKey, args.materialId);
    updates.identityKey = identityKey;
    updates.searchText = buildMaterialSearchText({
      name: next.name,
      variantLabel: next.variantLabel,
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

    return await insertUniqueAlias(
      ctx,
      args.materialId,
      alias,
      Date.now()
    );
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
