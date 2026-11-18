import { v } from "convex/values";
import {
  priceEventReviewStatus,
  priceEventSource,
  quoteFreight,
} from "../../schema/procurement";

/**
 * Validadores de retorno das propostas (`quoteProposals.ts`) e do histórico
 * por família (`priceEvents.familyHistory`).
 */

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());

/** Ver `ReferenceStats` em @rlpapp/shared/compras/priceReference. */
export const referenceStatsValidator = v.object({
  medianCents: v.number(),
  minCents: v.number(),
  maxCents: v.number(),
  count: v.number(),
  supplierCount: v.number(),
  spread: v.number(),
  firstAt: v.number(),
  lastAt: v.number(),
  totalChange: nullableNumber,
  monthlyChange: nullableNumber,
  status: v.union(v.literal("ok"), v.literal("wide"), v.literal("stale")),
});

export const quoteProposalSummaryValidator = v.object({
  _id: v.id("quoteProposals"),
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  receivedAt: v.number(),
  weekStart: v.number(),
  validUntil: nullableNumber,
  paymentTerms: nullableString,
  freight: v.union(quoteFreight, v.null()),
  reference: nullableString,
  projectId: v.union(v.id("projects"), v.null()),
  takeoffId: v.union(v.id("takeoffs"), v.null()),
  notes: nullableString,
});

export const quoteProposalValidator = v.object({
  ...quoteProposalSummaryValidator.fields,
  lines: v.array(
    v.object({
      priceEventId: v.id("priceEvents"),
      materialId: v.union(v.id("materials"), v.null()),
      materialName: nullableString,
      variantLabel: nullableString,
      rawDescription: nullableString,
      unitPriceCents: v.number(),
      unit: nullableString,
      quantity: nullableNumber,
      needsReview: v.boolean(),
      reviewStatus: v.union(priceEventReviewStatus, v.null()),
    })
  ),
});

export const quoteWeekSummaryValidator = v.object({
  weekStart: v.number(),
  priceCount: v.number(),
  supplierCount: v.number(),
  materialCount: v.number(),
  proposalCount: v.number(),
});

export const quoteWeekValidator = v.object({
  weekStart: v.number(),
  weekEnd: v.number(),
  columns: v.array(
    v.object({
      supplierKey: v.string(),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      proposals: v.array(quoteProposalSummaryValidator),
      priceCount: v.number(),
      firstAt: v.number(),
      lastAt: v.number(),
    })
  ),
  rows: v.array(
    v.object({
      rowKey: v.string(),
      materialId: v.union(v.id("materials"), v.null()),
      materialName: nullableString,
      variantLabel: nullableString,
      familyId: v.union(v.id("materialFamilies"), v.null()),
      familyName: nullableString,
      rawDescription: nullableString,
      unit: nullableString,
      quantity: nullableNumber,
      referenceCents: nullableNumber,
      cheapestSupplierKey: nullableString,
      cells: v.array(
        v.object({
          supplierKey: v.string(),
          priceEventId: v.id("priceEvents"),
          quoteProposalId: v.union(v.id("quoteProposals"), v.null()),
          unitPriceCents: v.number(),
          unit: nullableString,
          quantity: nullableNumber,
          occurredAt: v.number(),
          needsReview: v.boolean(),
        })
      ),
    })
  ),
});

export const familyPriceHistoryValidator = v.object({
  family: v.union(
    v.object({
      _id: v.id("materialFamilies"),
      name: v.string(),
      category: nullableString,
      baseUnit: nullableString,
    }),
    v.null()
  ),
  defaultMaterialId: v.union(v.id("materials"), v.null()),
  variants: v.array(
    v.object({
      materialId: v.id("materials"),
      name: v.string(),
      variantLabel: nullableString,
      manufacturer: nullableString,
      attributes: v.array(v.object({ key: v.string(), value: v.string() })),
      unit: nullableString,
      sku: nullableString,
      status: v.union(
        v.literal("draft"),
        v.literal("active"),
        v.literal("archived")
      ),
      isDefault: v.boolean(),
      reference: v.union(referenceStatsValidator, v.null()),
    })
  ),
  quotes: v.array(
    v.object({
      _id: v.id("priceEvents"),
      materialId: v.id("materials"),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierKey: v.string(),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: nullableString,
      quantity: nullableNumber,
      occurredAt: v.number(),
      validUntil: nullableNumber,
      source: priceEventSource,
      quoteProposalId: v.union(v.id("quoteProposals"), v.null()),
      needsReview: v.boolean(),
    })
  ),
});
