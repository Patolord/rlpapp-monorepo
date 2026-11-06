import { v } from "convex/values";
import {
  inventoryCompatibilityRuleType,
  inventoryDocumentStatus,
  inventoryEventType,
  inventoryMovementType,
} from "../../schema/inventory";
import { replenishmentState } from "../../schema/procurement";

/**
 * Validadores de retorno compartilhados pelo estoque (`convex/inventory.ts`):
 * movimentações, saldos, eventos e regras de compatibilidade.
 */

const compatibilityIssueValidator = v.object({
  ruleId: v.id("inventoryCompatibilityRules"),
  materialAId: v.id("materials"),
  materialAName: v.string(),
  materialBId: v.id("materials"),
  materialBName: v.string(),
  message: v.string(),
});

export const inventoryDocumentRowValidator = v.object({
  _id: v.id("inventoryDocuments"),
  type: inventoryMovementType,
  status: inventoryDocumentStatus,
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  sourceLocationName: v.union(v.string(), v.null()),
  destinationLocationName: v.union(v.string(), v.null()),
  reference: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  approvalReason: v.union(v.string(), v.null()),
  createdByName: v.string(),
  createdAt: v.number(),
  postedAt: v.union(v.number(), v.null()),
  items: v.array(
    v.object({
      _id: v.id("inventoryDocumentItems"),
      materialId: v.id("materials"),
      materialName: v.string(),
      quantity: v.number(),
      unitCostCents: v.union(v.number(), v.null()),
    })
  ),
  compatibilityIssues: v.array(compatibilityIssueValidator),
});

export const inventoryBalanceRowValidator = v.object({
  _id: v.id("inventoryBalances"),
  locationId: v.id("inventoryLocations"),
  locationName: v.string(),
  materialId: v.id("materials"),
  materialName: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  materialSku: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  quantity: v.number(),
  physicalAddress: v.union(v.string(), v.null()),
  replenishmentState: replenishmentState,
  suggestedOrderQuantity: v.union(v.number(), v.null()),
  minimumQuantity: v.union(v.number(), v.null()),
  reorderPoint: v.union(v.number(), v.null()),
  targetQuantity: v.union(v.number(), v.null()),
  leadTimeDays: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

export const inventoryEventRowValidator = v.object({
  _id: v.id("inventoryEvents"),
  type: inventoryEventType,
  documentId: v.id("inventoryDocuments"),
  materialId: v.id("materials"),
  materialName: v.string(),
  unit: v.union(v.string(), v.null()),
  locationName: v.string(),
  quantityDelta: v.number(),
  createdAt: v.number(),
});

/** Tipos de evento da tela nativa antiga (`inventory.listEvents`). */
export const legacyInventoryEventType = v.union(
  v.literal("RegisteredIn"),
  v.literal("RegisteredOut"),
  v.literal("Reversal"),
  v.literal("InventoryAdjust")
);

export const legacyInventoryEventValidator = v.object({
  _id: v.id("inventoryEvents"),
  type: legacyInventoryEventType,
  qtyDelta: v.number(),
  product: v.union(
    v.object({
      name: v.string(),
      unit: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  refType: v.union(
    v.literal("receipt"),
    v.literal("shipment"),
    v.literal("adjustment")
  ),
  refId: v.string(),
  createdAt: v.number(),
});

export const compatibilityRuleRowValidator = v.object({
  _id: v.id("inventoryCompatibilityRules"),
  type: inventoryCompatibilityRuleType,
  name: v.string(),
  materialAId: v.union(v.id("materials"), v.null()),
  materialAName: v.union(v.string(), v.null()),
  materialBId: v.union(v.id("materials"), v.null()),
  materialBName: v.union(v.string(), v.null()),
  categoryA: v.union(v.string(), v.null()),
  categoryB: v.union(v.string(), v.null()),
  attributeKey: v.union(v.string(), v.null()),
  message: v.string(),
  active: v.boolean(),
});
