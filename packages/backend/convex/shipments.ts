import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getUserRef } from "./lib/auth";
import { getShipmentLinesWithProducts } from "./lib/enrich";
import { staffMutation, staffQuery } from "./lib/functions";
import { shipmentStatus } from "./schema";

export const list = staffQuery({
  args: {},
  handler: async (ctx) => {
    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return Promise.all(
      shipments.map(async (shipment) => {
        const lines = await getShipmentLinesWithProducts(ctx, shipment._id);
        const site = await ctx.db.get("sites", shipment.toSiteId);
        return { ...shipment, lines, site };
      })
    );
  },
});

export const getById = staffQuery({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get("shipments", args.shipmentId);
    if (!shipment) return null;

    const lines = await getShipmentLinesWithProducts(ctx, shipment._id);
    const site = await ctx.db.get("sites", shipment.toSiteId);
    return { ...shipment, lines, site };
  },
});

export const listByStatus = staffQuery({
  args: { status: shipmentStatus },
  handler: async (ctx, args) => {
    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .collect();

    return Promise.all(
      shipments.map(async (shipment) => {
        const lines = await getShipmentLinesWithProducts(ctx, shipment._id);
        const site = await ctx.db.get("sites", shipment.toSiteId);
        return { ...shipment, lines, site };
      })
    );
  },
});

export const createShipment = staffMutation({
  args: {
    toSiteId: v.id("sites"),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        productId: v.id("products"),
        qty: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.lines.length === 0) {
      throw new Error("Remessa deve ter pelo menos uma linha");
    }

    for (const line of args.lines) {
      if (line.qty <= 0) {
        throw new Error("Quantidade deve ser maior que zero");
      }
      const snapshot = await ctx.db
        .query("inventorySnapshot")
        .withIndex("by_product", (q) => q.eq("productId", line.productId))
        .first();

      const available = snapshot?.qtyOnHand ?? 0;
      if (available < line.qty) {
        const product = await ctx.db.get("products", line.productId);
        throw new Error(
          `Estoque insuficiente para ${product?.name ?? "produto"}: disponível ${available}, solicitado ${line.qty}`
        );
      }
    }

    const now = Date.now();
    const site = await ctx.db.get("sites", args.toSiteId);
    if (!site) throw new Error("Site não encontrado");

    const shipmentId = await ctx.db.insert("shipments", {
      status: "RegisteredOut",
      toSiteId: args.toSiteId,
      notes: args.notes,
      userId: getUserRef(ctx.user),
      createdAt: now,
      updatedAt: now,
    });

    const qrProducts: { name: string; qty: number; unit: string }[] = [];

    for (const line of args.lines) {
      await ctx.db.insert("shipmentLines", {
        shipmentId,
        productId: line.productId,
        qty: line.qty,
      });

      const product = await ctx.db.get("products", line.productId);
      qrProducts.push({
        name: product?.name ?? "Produto",
        qty: line.qty,
        unit: product?.unit ?? "un",
      });

      await ctx.runMutation(internal.inventory.applyRegisteredOut, {
        productId: line.productId,
        qty: line.qty,
        refId: shipmentId,
        userId: getUserRef(ctx.user),
      });
    }

    const qrPayload = JSON.stringify({
      shipmentId,
      toSiteId: args.toSiteId,
      siteName: site.name,
      products: qrProducts,
      createdAt: now,
    });
    await ctx.db.patch("shipments", shipmentId, { qrCodeData: qrPayload });

    return shipmentId;
  },
});

export const stageShipment = staffMutation({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get("shipments", args.shipmentId);
    if (!shipment) throw new Error("Remessa não encontrada");
    if (shipment.status !== "RegisteredOut") {
      throw new Error("Remessa não está em RegisteredOut");
    }

    await ctx.db.patch("shipments", args.shipmentId, {
      status: "PendingShipment",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});

export const confirmDelivery = staffMutation({
  args: {
    shipmentId: v.id("shipments"),
    lineCounts: v.optional(
      v.array(
        v.object({
          lineId: v.id("shipmentLines"),
          countedQty: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get("shipments", args.shipmentId);
    if (!shipment) throw new Error("Remessa não encontrada");
    if (
      shipment.status !== "RegisteredOut" &&
      shipment.status !== "PendingShipment"
    ) {
      throw new Error(
        "Remessa deve estar em RegisteredOut ou PendingShipment"
      );
    }

    if (args.lineCounts) {
      for (const lc of args.lineCounts) {
        await ctx.db.patch("shipmentLines", lc.lineId, { countedQty: lc.countedQty });
      }
    }

    await ctx.db.patch("shipments", args.shipmentId, {
      status: "DeliveredConfirmed",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});

export const cancelBeforeLeave = staffMutation({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get("shipments", args.shipmentId);
    if (!shipment) throw new Error("Remessa não encontrada");
    if (
      shipment.status !== "RegisteredOut" &&
      shipment.status !== "PendingShipment"
    ) {
      throw new Error(
        "Remessa deve estar em RegisteredOut ou PendingShipment para cancelar"
      );
    }

    const lines = await ctx.db
      .query("shipmentLines")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", args.shipmentId))
      .collect();

    for (const line of lines) {
      await ctx.runMutation(internal.inventory.applyReversal, {
        productId: line.productId,
        qty: line.qty,
        refId: args.shipmentId,
        userId: shipment.userId,
      });
    }

    await ctx.db.patch("shipments", args.shipmentId, {
      status: "ReversalApplied",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});
