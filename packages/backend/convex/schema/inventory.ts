import { defineTable } from "convex/server";
import { v } from "convex/values";

// Locais de estoque, documentos de movimentação, saldos, políticas e solicitações.

export const inventoryLocationType = v.union(
  v.literal("central"),
  v.literal("project")
);

export const inventoryMovementType = v.union(
  v.literal("entry"),
  v.literal("transfer"),
  v.literal("consumption"),
  v.literal("return"),
  v.literal("adjustment"),
  v.literal("reversal")
);

export const inventoryDocumentStatus = v.union(
  v.literal("draft"),
  v.literal("pending_approval"),
  v.literal("approved"),
  v.literal("posted"),
  v.literal("rejected"),
  v.literal("reversed")
);

export const inventoryEventType = v.union(
  v.literal("in"),
  v.literal("out"),
  v.literal("adjustment"),
  v.literal("reversal")
);

export const inventoryCompatibilityRuleType = v.union(
  v.literal("forbidden_pair"),
  v.literal("attributes_must_match")
);

export const inventoryRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
  v.literal("fulfilled")
);

// Cadastro em campo (celular): o que aconteceu com cada item capturado.
// matched = somou num material que já existia; created = material novo;
// review = material novo em rascunho, parecido com outro, para Compras revisar.
export const materialCaptureOutcome = v.union(
  v.literal("matched"),
  v.literal("created"),
  v.literal("review")
);

export const materialCaptureMatchReason = v.union(
  v.literal("chosen"),
  v.literal("barcode"),
  v.literal("sku"),
  v.literal("identity"),
  v.literal("alias"),
  v.literal("new")
);

export const materialCaptureQuantityMode = v.union(
  v.literal("add"),
  v.literal("set")
);

export const inventoryRequestReason = v.union(
  v.literal("replenishment"),
  v.literal("new")
);

export const inventoryTables = {
  inventoryLocations: defineTable({
    type: inventoryLocationType,
    name: v.string(),
    projectId: v.optional(v.id("projects")),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_project", ["projectId"]),
  inventoryDocuments: defineTable({
    type: inventoryMovementType,
    status: inventoryDocumentStatus,
    sourceLocationId: v.optional(v.id("inventoryLocations")),
    destinationLocationId: v.optional(v.id("inventoryLocations")),
    projectId: v.optional(v.id("projects")),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    compatibilityIssues: v.optional(
      v.array(
        v.object({
          ruleId: v.id("inventoryCompatibilityRules"),
          materialAId: v.id("materials"),
          materialBId: v.id("materials"),
          message: v.string(),
        })
      )
    ),
    approvalReason: v.optional(v.string()),
    approvedByUserId: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectedByUserId: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    postedAt: v.optional(v.number()),
    reversalOfDocumentId: v.optional(v.id("inventoryDocuments")),
    reversedByDocumentId: v.optional(v.id("inventoryDocuments")),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_project", ["projectId", "createdAt"])
    .index("by_project_status", ["projectId", "status", "createdAt"])
    .index("by_created_by", ["createdByUserId", "createdAt"])
    .index("by_reversal_of", ["reversalOfDocumentId"]),
  inventoryDocumentItems: defineTable({
    documentId: v.id("inventoryDocuments"),
    lineNumber: v.number(),
    materialId: v.id("materials"),
    quantity: v.number(),
    unitCostCents: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId", "lineNumber"])
    .index("by_material", ["materialId"]),
  inventoryEvents: defineTable({
    documentId: v.id("inventoryDocuments"),
    documentItemId: v.id("inventoryDocumentItems"),
    type: inventoryEventType,
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    quantityDelta: v.number(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_location", ["locationId", "createdAt"])
    .index("by_material", ["materialId", "createdAt"]),
  inventoryBalances: defineTable({
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    quantity: v.number(),
    // MVP: um endereço textual por material no estoque central.
    physicalAddress: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_location", ["locationId"])
    .index("by_location_material", ["locationId", "materialId"])
    .index("by_material", ["materialId"]),
  inventoryStockPolicies: defineTable({
    locationId: v.id("inventoryLocations"),
    materialId: v.id("materials"),
    minimumQuantity: v.number(),
    reorderPoint: v.number(),
    targetQuantity: v.number(),
    leadTimeDays: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  })
    .index("by_location", ["locationId"])
    .index("by_material", ["materialId"])
    .index("by_location_material", ["locationId", "materialId"]),
  inventoryCompatibilityRules: defineTable({
    type: inventoryCompatibilityRuleType,
    name: v.string(),
    materialAId: v.optional(v.id("materials")),
    materialBId: v.optional(v.id("materials")),
    categoryA: v.optional(v.string()),
    categoryB: v.optional(v.string()),
    attributeKey: v.optional(v.string()),
    message: v.string(),
    active: v.boolean(),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_type", ["type"])
    .index("by_material_a", ["materialAId"])
    .index("by_material_b", ["materialBId"]),
  inventoryRequests: defineTable({
    projectId: v.id("projects"),
    status: inventoryRequestStatus,
    requestedByUserId: v.id("users"),
    notes: v.optional(v.string()),
    reviewedByUserId: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    fulfilledByDocumentId: v.optional(v.id("inventoryDocuments")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_requested_by", ["requestedByUserId", "createdAt"])
    .index("by_project_status", ["projectId", "status", "createdAt"]),
  inventoryRequestItems: defineTable({
    requestId: v.id("inventoryRequests"),
    materialId: v.id("materials"),
    quantity: v.number(),
    unit: v.optional(v.string()),
    reason: inventoryRequestReason,
    markedDepleted: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_material", ["materialId"]),

  materialCaptures: defineTable({
    // Gerado no aparelho: a fila offline reenvia sem duplicar.
    clientId: v.string(),
    locationId: v.id("inventoryLocations"),
    projectId: v.optional(v.id("projects")),
    materialId: v.id("materials"),
    outcome: materialCaptureOutcome,
    matchReason: materialCaptureMatchReason,
    // Materiais parecidos encontrados no envio (base da revisão de rascunhos).
    similarMaterialIds: v.array(v.id("materials")),
    // O que a pessoa digitou ou leu no aparelho, como veio.
    input: v.object({
      name: v.optional(v.string()),
      variantLabel: v.optional(v.string()),
      unit: v.optional(v.string()),
      category: v.optional(v.string()),
      barcode: v.optional(v.string()),
      manufacturer: v.optional(v.string()),
      manufacturerPartNumber: v.optional(v.string()),
      spec: v.optional(v.string()),
    }),
    quantityMode: materialCaptureQuantityMode,
    countedQuantity: v.number(),
    // Variação lançada no saldo (pode ser zero ou negativa no modo "set").
    quantityDelta: v.number(),
    physicalAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    documentId: v.optional(v.id("inventoryDocuments")),
    offline: v.boolean(),
    capturedAt: v.number(),
    capturedByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_client_id", ["clientId"])
    .index("by_captured_by", ["capturedByUserId", "createdAt"])
    .index("by_material", ["materialId"])
    .index("by_outcome", ["outcome", "createdAt"]),
};
