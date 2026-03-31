import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Receipt states (RFC §4.1)
export const receiptStatus = v.union(
  v.literal("PendingReceipt"),
  v.literal("Accepted"),
  v.literal("Returned"),
  v.literal("Discarded")
);

// Shipment states (RFC §4.2)
export const shipmentStatus = v.union(
  v.literal("RegisteredOut"),
  v.literal("PendingShipment"),
  v.literal("DeliveredConfirmed"),
  v.literal("CanceledBeforeLeave"),
  v.literal("ReversalApplied")
);

// Inventory event types (RFC §4.3)
export const inventoryEventType = v.union(
  v.literal("RegisteredIn"),
  v.literal("RegisteredOut"),
  v.literal("Reversal"),
  v.literal("InventoryAdjust")
);

// Reference type for inventory events
export const refType = v.union(
  v.literal("receipt"),
  v.literal("shipment"),
  v.literal("adjustment")
);

// Cost source for receipt lines and cost events
export const costSource = v.union(
  v.literal("supplier_last"),
  v.literal("material_avg"),
  v.literal("manual"),
  v.literal("unknown")
);

// User roles
export const userRoles = v.union(
  v.literal("director"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("operator")
);

// Department types
export const departments = v.union(
  v.literal("estoque"),
  v.literal("financeiro"),
  v.literal("rh"),
  v.literal("engenharia")
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: userRoles,
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_active", ["isActive"]),

  products: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    unit: v.string(),
    minQuantity: v.number(),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  suppliers: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  sites: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
    responsiblePhone: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  // --- RFC-0001 tables ---

  receipts: defineTable({
    status: receiptStatus,
    supplierId: v.optional(v.id("suppliers")),
    sourceType: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  receiptLines: defineTable({
    receiptId: v.id("receipts"),
    productId: v.id("products"),
    qty: v.number(),
    countedQty: v.optional(v.number()),
    unitCost: v.optional(v.number()),
    costSource: v.optional(costSource),
    isEstimated: v.optional(v.boolean()),
  })
    .index("by_receipt", ["receiptId"]),

  shipments: defineTable({
    status: shipmentStatus,
    toSiteId: v.id("sites"),
    notes: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_site", ["toSiteId"]),

  shipmentLines: defineTable({
    shipmentId: v.id("shipments"),
    productId: v.id("products"),
    qty: v.number(),
    countedQty: v.optional(v.number()),
  })
    .index("by_shipment", ["shipmentId"]),

  inventoryEvents: defineTable({
    type: inventoryEventType,
    productId: v.id("products"),
    qtyDelta: v.number(),
    refType: refType,
    refId: v.string(),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_type", ["type"])
    .index("by_created", ["createdAt"])
    .index("by_ref", ["refType", "refId"]),

  costEvents: defineTable({
    productId: v.id("products"),
    unitCost: v.number(),
    qty: v.number(),
    costSource: costSource,
    isEstimated: v.boolean(),
    inventoryEventId: v.optional(v.id("inventoryEvents")),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_event", ["inventoryEventId"]),

  inventorySnapshot: defineTable({
    productId: v.id("products"),
    qtyOnHand: v.number(),
    avgCost: v.number(),
    totalValue: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"]),
});
