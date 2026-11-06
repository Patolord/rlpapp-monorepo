import { v } from "convex/values";
import {
  materialDimensions,
  priceEventReviewStatus,
  priceEventSource,
} from "../../schema/procurement";
import { priceChangeValidator } from "./priceHistory";

/** Validadores de retorno de `priceEvents.ts` (eventos, histórico e estimativa). */

const priceFreshnessValidator = v.union(
  v.literal("fresh"),
  v.literal("usable"),
  v.literal("old"),
  v.literal("stale")
);

export const priceEventValidator = v.object({
  _id: v.id("priceEvents"),
  _creationTime: v.number(),
  rawDescription: v.union(v.string(), v.null()),
  materialId: v.union(v.id("materials"), v.null()),
  materialName: v.union(v.string(), v.null()),
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  unitPriceCents: v.number(),
  unit: v.union(v.string(), v.null()),
  quantity: v.union(v.number(), v.null()),
  source: priceEventSource,
  occurredAt: v.number(),
  validUntil: v.union(v.number(), v.null()),
  projectId: v.union(v.id("projects"), v.null()),
  takeoffId: v.union(v.id("takeoffs"), v.null()),
  takeoffItemId: v.union(v.id("takeoffItems"), v.null()),
  dimensions: v.union(materialDimensions, v.null()),
  notes: v.union(v.string(), v.null()),
  reviewStatus: v.union(priceEventReviewStatus, v.null()),
  needsReview: v.boolean(),
  createdAt: v.number(),
  ageDays: v.number(),
  freshness: priceFreshnessValidator,
  suggestedUnitPriceCents: v.union(v.number(), v.null()),
  warnings: v.array(v.string()),
});

const nullablePriceChange = v.union(priceChangeValidator, v.null());

const priceHistoryPointValidator = v.object({
  _id: v.id("priceEvents"),
  occurredAt: v.number(),
  unitPriceCents: v.number(),
  unit: v.union(v.string(), v.null()),
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  source: priceEventSource,
  needsReview: v.boolean(),
  change: nullablePriceChange,
});

export const priceHistoryValidator = v.object({
  unit: v.union(v.string(), v.null()),
  current: v.union(priceEventValidator, v.null()),
  summary: v.union(
    v.object({
      change30d: nullablePriceChange,
      change90d: nullablePriceChange,
      changeFromPrevious: nullablePriceChange,
      minCents: v.number(),
      minAt: v.number(),
      maxCents: v.number(),
      maxAt: v.number(),
      count: v.number(),
      firstAt: v.number(),
      lastAt: v.number(),
    }),
    v.null()
  ),
  points: v.array(priceHistoryPointValidator),
  suppliers: v.array(
    v.object({
      /** Chave única da série (id, nome bruto ou evento). */
      key: v.string(),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      source: priceEventSource,
      freshness: priceFreshnessValidator,
      change: nullablePriceChange,
      count: v.number(),
    })
  ),
  excludedCount: v.number(),
});

const estimatePrecedentValidator = v.object({
  eventId: v.id("priceEvents"),
  unitPriceCents: v.number(),
  occurredAt: v.number(),
  dimensions: materialDimensions,
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  materialId: v.union(v.id("materials"), v.null()),
  variantLabel: v.union(v.string(), v.null()),
  sizeDifferencePercent: v.number(),
});

export const estimateSuggestionValidator = v.object({
  familyId: v.union(v.id("materialFamilies"), v.null()),
  familyName: v.union(v.string(), v.null()),
  method: v.union(
    v.literal("exact"),
    v.literal("nearest"),
    v.literal("regression"),
    v.null()
  ),
  suggestedUnitPriceCents: v.union(v.number(), v.null()),
  confidence: v.union(
    v.literal("high"),
    v.literal("medium"),
    v.literal("low"),
    v.null()
  ),
  compatibleCount: v.number(),
  usedCount: v.number(),
  minCents: v.union(v.number(), v.null()),
  maxCents: v.union(v.number(), v.null()),
  supplierOnly: v.boolean(),
  precedents: v.array(estimatePrecedentValidator),
});
