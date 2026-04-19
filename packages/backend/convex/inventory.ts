import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAuth } from "./lib/auth";

// ── Internal helper: recalculate snapshot for a product ────────────────────

async function recalculateSnapshot(
  ctx: { db: any },
  productId: Id<"products">
) {
  const events = await ctx.db
    .query("inventoryEvents")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();

  const qtyOnHand = events.reduce(
    (sum: number, e: any) => sum + e.qtyDelta,
    0
  );

  const costEvents = await ctx.db
    .query("costEvents")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .collect();

  let avgCost = 0;
  if (costEvents.length > 0) {
    const totalCostQty = costEvents.reduce(
      (sum: number, ce: any) => sum + ce.qty,
      0
    );
    const totalCostValue = costEvents.reduce(
      (sum: number, ce: any) => sum + ce.unitCost * ce.qty,
      0
    );
    avgCost = totalCostQty > 0 ? totalCostValue / totalCostQty : 0;
  }

  const totalValue = qtyOnHand * avgCost;

  const existing = await ctx.db
    .query("inventorySnapshot")
    .withIndex("by_product", (q: any) => q.eq("productId", productId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      qtyOnHand,
      avgCost,
      totalValue,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("inventorySnapshot", {
      productId,
      qtyOnHand,
      avgCost,
      totalValue,
      updatedAt: Date.now(),
    });
  }
}

// ── Internal mutations (called by receipts.ts / shipments.ts) ──────────────

export const applyRegisteredIn = internalMutation({
  args: {
    productId: v.id("products"),
    qty: v.number(),
    refId: v.string(),
    userId: v.string(),
    unitCost: v.optional(v.number()),
    costSource: v.optional(
      v.union(
        v.literal("supplier_last"),
        v.literal("material_avg"),
        v.literal("manual"),
        v.literal("unknown")
      )
    ),
    isEstimated: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("inventoryEvents", {
      type: "RegisteredIn",
      productId: args.productId,
      qtyDelta: args.qty,
      refType: "receipt",
      refId: args.refId,
      userId: args.userId,
      createdAt: Date.now(),
    });

    if (args.unitCost !== undefined) {
      await ctx.db.insert("costEvents", {
        productId: args.productId,
        unitCost: args.unitCost,
        qty: args.qty,
        costSource: args.costSource ?? "manual",
        isEstimated: args.isEstimated ?? false,
        inventoryEventId: eventId,
        createdAt: Date.now(),
      });
    }

    await recalculateSnapshot(ctx, args.productId);
    return eventId;
  },
});

export const applyRegisteredOut = internalMutation({
  args: {
    productId: v.id("products"),
    qty: v.number(),
    refId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("inventoryEvents", {
      type: "RegisteredOut",
      productId: args.productId,
      qtyDelta: -args.qty,
      refType: "shipment",
      refId: args.refId,
      userId: args.userId,
      createdAt: Date.now(),
    });

    await recalculateSnapshot(ctx, args.productId);
    return eventId;
  },
});

export const applyReversal = internalMutation({
  args: {
    productId: v.id("products"),
    qty: v.number(),
    refId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("inventoryEvents", {
      type: "Reversal",
      productId: args.productId,
      qtyDelta: args.qty,
      refType: "shipment",
      refId: args.refId,
      userId: args.userId,
      createdAt: Date.now(),
    });

    await recalculateSnapshot(ctx, args.productId);
    return eventId;
  },
});

export const reconcile = internalMutation({
  args: {
    productId: v.id("products"),
    qtyDelta: v.number(),
    reason: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const eventId = await ctx.db.insert("inventoryEvents", {
      type: "InventoryAdjust",
      productId: args.productId,
      qtyDelta: args.qtyDelta,
      refType: "adjustment",
      refId: args.reason,
      userId: args.userId,
      createdAt: Date.now(),
    });

    await recalculateSnapshot(ctx, args.productId);
    return eventId;
  },
});

// ── Public queries ─────────────────────────────────────────────────────────

export const getStock = query({
  args: {},
  handler: async (ctx) => {
    const snapshots = await ctx.db.query("inventorySnapshot").collect();

    return Promise.all(
      snapshots.map(async (snap) => {
        const product = await ctx.db.get(snap.productId);
        return { ...snap, product };
      })
    );
  },
});

export const getStockByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("inventorySnapshot")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .first();
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const sites = await ctx.db
      .query("sites")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const snapshots = await ctx.db.query("inventorySnapshot").collect();

    let totalWarehouseItems = 0;
    let lowStockCount = 0;

    for (const snap of snapshots) {
      totalWarehouseItems += snap.qtyOnHand;
      const product = products.find((p) => p._id === snap.productId);
      if (product && snap.qtyOnHand < product.minQuantity) {
        lowStockCount++;
      }
    }

    const pendingReceipts = await ctx.db
      .query("receipts")
      .withIndex("by_status", (q) => q.eq("status", "PendingReceipt"))
      .collect();

    const activeShipments = await ctx.db
      .query("shipments")
      .withIndex("by_status", (q) => q.eq("status", "RegisteredOut"))
      .collect();

    const pendingShipments = await ctx.db
      .query("shipments")
      .withIndex("by_status", (q) => q.eq("status", "PendingShipment"))
      .collect();

    const pendingMaterialRequests = await ctx.db
      .query("materialRequests")
      .withIndex("by_status", (q) => q.eq("status", "Pendente"))
      .collect();

    const approvedMaterialRequests = await ctx.db
      .query("materialRequests")
      .withIndex("by_status", (q) => q.eq("status", "Aprovado"))
      .collect();

    const recentDeliveries = await ctx.db
      .query("deliveryConfirmations")
      .withIndex("by_confirmed")
      .order("desc")
      .take(5);

    const enrichedDeliveries = await Promise.all(
      recentDeliveries.map(async (d) => {
        const site = await ctx.db.get(d.receivedAtSiteId);
        return {
          ...d,
          siteName: site?.name ?? "Site removido",
        };
      })
    );

    const enrichedPendingRequests = await Promise.all(
      pendingMaterialRequests.slice(0, 5).map(async (r) => {
        const site = await ctx.db.get(r.siteId);
        const requester = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", r.requestedByUserId))
          .first();
        const lines = await ctx.db
          .query("materialRequestLines")
          .withIndex("by_request", (q) => q.eq("requestId", r._id))
          .collect();
        return {
          ...r,
          siteName: site?.name ?? "Site removido",
          requesterName: requester?.name ?? r.requestedByUserId,
          lineCount: lines.length,
        };
      })
    );

    return {
      totalProducts: products.length,
      totalSites: sites.length,
      totalWarehouseItems,
      lowStockCount,
      pendingReceipts: pendingReceipts.length,
      activeShipments: activeShipments.length + pendingShipments.length,
      pendingMaterialRequests: pendingMaterialRequests.length,
      approvedMaterialRequests: approvedMaterialRequests.length,
      recentDeliveries: enrichedDeliveries,
      recentPendingRequests: enrichedPendingRequests,
    };
  },
});

export const adjustInventory = mutation({
  args: {
    productId: v.id("products"),
    qtyDelta: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.qtyDelta === 0) {
      throw new Error("Quantidade de ajuste não pode ser zero");
    }
    if (!args.reason.trim()) {
      throw new Error("Motivo do ajuste é obrigatório");
    }

    if (args.qtyDelta < 0) {
      const snapshot = await ctx.db
        .query("inventorySnapshot")
        .withIndex("by_product", (q) => q.eq("productId", args.productId))
        .first();
      const available = snapshot?.qtyOnHand ?? 0;
      if (available + args.qtyDelta < 0) {
        throw new Error("Estoque insuficiente para este ajuste");
      }
    }

    await ctx.runMutation(internal.inventory.reconcile, {
      productId: args.productId,
      qtyDelta: args.qtyDelta,
      reason: args.reason,
      userId: "system",
    });
  },
});

export const listEvents = query({
  args: {
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_created")
      .order("desc")
      .collect();

    let filtered = all;
    if (args.type) {
      filtered = filtered.filter((e) => e.type === args.type);
    }
    if (args.limit) {
      filtered = filtered.slice(0, args.limit);
    }

    return Promise.all(
      filtered.map(async (event) => {
        const product = await ctx.db.get(event.productId);
        return { ...event, product };
      })
    );
  },
});
