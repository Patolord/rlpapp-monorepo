import { v } from "convex/values";
import {
  materialDimensions,
  materialStatus,
  replenishmentState,
} from "../../schema/procurement";
import { priceChangeValidator } from "./priceHistory";

export const technicalAttributeValidator = v.object({
  key: v.string(),
  value: v.string(),
});

export const materialDimensionsValidator = materialDimensions;

export const materialValidator = v.object({
  _id: v.id("materials"),
  _creationTime: v.number(),
  name: v.string(),
  familyId: v.union(v.id("materialFamilies"), v.null()),
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
  familyId: v.union(v.id("materialFamilies"), v.null()),
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
  imageId: v.union(v.id("_storage"), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  // Mão de obra por unidade, em centavos, exportada ao RLP Takeoff.
  laborPriceCents: v.union(v.number(), v.null()),
  laborPriceUpdatedAt: v.union(v.number(), v.null()),
  active: v.boolean(),
  status: v.union(materialStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  centralReplenishmentState: replenishmentState,
  centralQuantity: v.union(v.number(), v.null()),
  // Resumo de fornecimento para a tabela do catálogo.
  supplierCount: v.number(),
  preferredSupplierName: v.union(v.string(), v.null()),
  latestPrice: v.union(
    v.object({
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      supplierName: v.string(),
      freshness: v.union(
        v.literal("fresh"),
        v.literal("usable"),
        v.literal("old"),
        v.literal("stale")
      ),
      /** Variação vs. o preço anterior do mesmo fornecedor (mesma unidade). */
      change: v.union(priceChangeValidator, v.null()),
    }),
    v.null()
  ),
});

/** Página de `listCatalog` (formato de `.paginate()`). */
export const materialCatalogPageValidator = v.object({
  page: v.array(materialCatalogValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
  pageStatus: v.optional(v.union(v.string(), v.null())),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});

export const materialFamilyValidator = v.object({
  _id: v.id("materialFamilies"),
  name: v.string(),
  nameNormalized: v.string(),
  category: v.union(v.string(), v.null()),
  baseUnit: v.union(v.string(), v.null()),
  active: v.boolean(),
});

export const materialDuplicateCandidateValidator = v.object({
  materialId: v.id("materials"),
  name: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  sku: v.union(v.string(), v.null()),
  exact: v.boolean(),
});

export const materialSuggestionValidator = v.object({
  _id: v.id("materials"),
  name: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  sku: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  matchType: v.union(
    v.literal("alias"),
    v.literal("name"),
    v.literal("sku"),
    v.literal("barcode")
  ),
});

export const materialAliasValidator = v.object({
  _id: v.id("materialAliases"),
  alias: v.string(),
  createdAt: v.number(),
});

export const bulkMaterialItemValidator = v.object({
  name: v.string(),
  variantLabel: v.optional(v.string()),
  dimensions: v.optional(materialDimensionsValidator),
  technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
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

const mergeMaterialSummaryValidator = v.object({
  _id: v.id("materials"),
  name: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  sku: v.union(v.string(), v.null()),
  active: v.boolean(),
});

export const materialMergePreviewValidator = v.union(
  v.object({
    ok: v.literal(true),
    source: mergeMaterialSummaryValidator,
    target: mergeMaterialSummaryValidator,
    locations: v.array(
      v.object({
        locationId: v.id("inventoryLocations"),
        locationName: v.string(),
        sourceQuantity: v.number(),
        targetQuantity: v.number(),
        mergedQuantity: v.number(),
      })
    ),
    takeoffItemCount: v.number(),
    priceEventCount: v.number(),
    offeringCount: v.number(),
    aliasCount: v.number(),
  }),
  v.object({
    ok: v.literal(false),
    error: v.string(),
  })
);
