import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { MaterialDimensions } from "./catalog";
import {
  suggestEstimate as suggestEstimateFromCandidates,
  type EstimateCandidate,
} from "./estimateSuggestion";
import { isUsablePriceEvent } from "./priceSelection";
import { normalizeText } from "../kernel/text";

export type SuggestPriceEstimateInput = {
  materialId?: Id<"materials">;
  familyId?: Id<"materialFamilies">;
  familyName?: string;
  dimensions: MaterialDimensions;
  supplierId?: Id<"suppliers">;
  now: number;
};

/**
 * Estimativa por tamanho para um item fabricado sob medida, a partir das
 * cotações da mesma família de material (do material, do id ou do nome).
 * O cálculo em si está em `estimateSuggestion.ts`; aqui ficam as leituras.
 */
export async function suggestPriceEstimate(
  ctx: QueryCtx,
  input: SuggestPriceEstimateInput
) {
  let family: Doc<"materialFamilies"> | null = null;
  if (input.materialId) {
    const material = await ctx.db.get("materials", input.materialId);
    if (material?.familyId) {
      family = await ctx.db.get("materialFamilies", material.familyId);
    }
  }
  if (!family && input.familyId) {
    family = await ctx.db.get("materialFamilies", input.familyId);
  }
  if (!family && input.familyName?.trim()) {
    family = await ctx.db
      .query("materialFamilies")
      .withIndex("by_name_normalized", (q) =>
        q.eq("nameNormalized", normalizeText(input.familyName!))
      )
      .first();
  }

  const empty = {
    familyId: family?._id ?? null,
    familyName: family?.name ?? null,
    method: null,
    suggestedUnitPriceCents: null,
    confidence: null,
    compatibleCount: 0,
    usedCount: 0,
    minCents: null,
    maxCents: null,
    supplierOnly: false,
    precedents: [],
  };
  if (!family) return empty;

  const materials = await ctx.db
    .query("materials")
    .withIndex("by_family", (q) => q.eq("familyId", family!._id))
    .collect();
  const materialById = new Map(materials.map((m) => [m._id, m]));

  const candidates: EstimateCandidate[] = [];
  for (const material of materials) {
    const events = await ctx.db
      .query("priceEvents")
      .withIndex("by_material", (q) => q.eq("materialId", material._id))
      .collect();
    for (const event of events) {
      if (!isUsablePriceEvent(event)) continue;
      const dimensions = event.dimensions ?? material.dimensions;
      if (!dimensions) continue;
      candidates.push({
        eventId: event._id,
        unitPriceCents: event.unitPriceCents,
        occurredAt: event.occurredAt,
        dimensions,
        supplierId: event.supplierId,
        supplierNameRaw: event.supplierNameRaw,
        materialId: material._id,
        needsReview: event.needsReview,
      });
    }
  }

  const result = suggestEstimateFromCandidates(
    candidates,
    input.dimensions,
    input.now,
    { supplierId: input.supplierId ?? null }
  );

  const supplierNames = new Map<string, string>();
  const precedents = [];
  for (const precedent of result.precedents) {
    let supplierName = precedent.supplierNameRaw ?? "Fornecedor desconhecido";
    if (precedent.supplierId) {
      const cached = supplierNames.get(precedent.supplierId);
      if (cached) {
        supplierName = cached;
      } else {
        const supplier = await ctx.db.get("suppliers", precedent.supplierId);
        if (supplier) supplierName = supplier.name;
        supplierNames.set(precedent.supplierId, supplierName);
      }
    }
    precedents.push({
      eventId: precedent.eventId,
      unitPriceCents: precedent.unitPriceCents,
      occurredAt: precedent.occurredAt,
      dimensions: precedent.dimensions,
      supplierId: precedent.supplierId,
      supplierName,
      materialId: precedent.materialId,
      variantLabel: precedent.materialId
        ? (materialById.get(precedent.materialId)?.variantLabel ?? null)
        : null,
      sizeDifferencePercent: precedent.sizeDifferencePercent,
    });
  }

  if (result.method === null) {
    return { ...empty, compatibleCount: result.compatibleCount, precedents };
  }
  return {
    familyId: family._id,
    familyName: family.name,
    method: result.method,
    suggestedUnitPriceCents: result.suggestedUnitPriceCents,
    confidence: result.confidence,
    compatibleCount: result.compatibleCount,
    usedCount: result.usedCount,
    minCents: result.minCents,
    maxCents: result.maxCents,
    supplierOnly: result.supplierOnly,
    precedents,
  };
}
