import { v } from "convex/values";
import {
  materialDimensions,
  takeoffBudgetMeta,
  takeoffItemStatus,
  takeoffSource,
  takeoffStatus,
} from "../../schema/procurement";

/** Validadores de retorno de `takeoffs.ts`. */

export const takeoffValidator = v.object({
  _id: v.id("takeoffs"),
  _creationTime: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  projectSlug: v.union(v.string(), v.null()),
  name: v.string(),
  status: v.union(takeoffStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  itemCount: v.number(),
  /** "desktop" quando publicado pelo app desktop de takeoff. */
  source: v.union(takeoffSource, v.null()),
  externalId: v.union(v.string(), v.null()),
  /** Cabeçalho e resumo por aba do orçamento publicado pelo desktop. */
  budget: v.union(takeoffBudgetMeta, v.null()),
  publishedAt: v.union(v.number(), v.null()),
  publishedByName: v.union(v.string(), v.null()),
});

export const takeoffItemValidator = v.object({
  _id: v.id("takeoffItems"),
  _creationTime: v.number(),
  takeoffId: v.id("takeoffs"),
  projectId: v.union(v.id("projects"), v.null()),
  rawDescription: v.string(),
  quantity: v.union(v.number(), v.null()),
  unit: v.union(v.string(), v.null()),
  materialId: v.union(v.id("materials"), v.null()),
  materialName: v.union(v.string(), v.null()),
  customDimensions: v.union(materialDimensions, v.null()),
  customSpecification: v.union(v.string(), v.null()),
  estimatedUnitPriceCents: v.union(v.number(), v.null()),
  notes: v.union(v.string(), v.null()),
  status: v.union(takeoffItemStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  /** Linhas do desktop: id estável, aba, seção, mão de obra e posição. */
  externalLineId: v.union(v.string(), v.null()),
  sheet: v.union(v.string(), v.null()),
  section: v.union(v.string(), v.null()),
  laborUnitPriceCents: v.union(v.number(), v.null()),
  /** Totais da linha como o desktop calculou (null: quantidade × preço). */
  materialTotalCents: v.union(v.number(), v.null()),
  laborTotalCents: v.union(v.number(), v.null()),
  sortOrder: v.union(v.number(), v.null()),
  /** Saiu do orçamento desktop mas foi mantida pela Compras. */
  externalRemovedAt: v.union(v.number(), v.null()),
  warnings: v.array(v.string()),
  latestPrices: v.array(
    v.object({
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      source: v.string(),
      freshness: v.union(
        v.literal("fresh"),
        v.literal("usable"),
        v.literal("old"),
        v.literal("stale")
      ),
      suggestedUnitPriceCents: v.union(v.number(), v.null()),
    })
  ),
  /** Cotações registradas para este item, mais recente primeiro. */
  quotes: v.array(
    v.object({
      _id: v.id("priceEvents"),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      validUntil: v.union(v.number(), v.null()),
      source: v.string(),
      /** Desvio da cotação em relação ao preço estimado do item. */
      versusEstimate: v.union(
        v.object({
          deltaCents: v.number(),
          deltaPercent: v.union(v.number(), v.null()),
          fromCents: v.number(),
          fromAt: v.number(),
        }),
        v.null()
      ),
    })
  ),
});
