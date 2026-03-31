import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return Promise.all(
      shipments.map(async (shipment) => {
        const lines = await ctx.db
          .query("shipmentLines")
          .withIndex("by_shipment", (q) =>
            q.eq("shipmentId", shipment._id)
          )
          .collect();

        const enrichedLines = await Promise.all(
          lines.map(async (line) => {
            const product = await ctx.db.get(line.productId);
            return { ...line, product };
          })
        );

        const site = await ctx.db.get(shipment.toSiteId);

        return { ...shipment, lines: enrichedLines, site };
      })
    );
  },
});

export const createShipment = mutation({
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
    await requireAuth(ctx);
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
        const product = await ctx.db.get(line.productId);
        throw new Error(
          `Estoque insuficiente para ${product?.name ?? "produto"}: disponível ${available}, solicitado ${line.qty}`
        );
      }
    }

    const now = Date.now();
    const shipmentId = await ctx.db.insert("shipments", {
      status: "RegisteredOut",
      toSiteId: args.toSiteId,
      notes: args.notes,
      userId: "system",
      createdAt: now,
      updatedAt: now,
    });

    for (const line of args.lines) {
      await ctx.db.insert("shipmentLines", {
        shipmentId,
        productId: line.productId,
        qty: line.qty,
      });

      await ctx.runMutation(internal.inventory.applyRegisteredOut, {
        productId: line.productId,
        qty: line.qty,
        refId: shipmentId,
        userId: "system",
      });
    }

    return shipmentId;
  },
});

export const stageShipment = mutation({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Remessa não encontrada");
    if (shipment.status !== "RegisteredOut") {
      throw new Error("Remessa não está em RegisteredOut");
    }

    await ctx.db.patch(args.shipmentId, {
      status: "PendingShipment",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});

export const confirmDelivery = mutation({
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
    await requireAuth(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
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
        await ctx.db.patch(lc.lineId, { countedQty: lc.countedQty });
      }
    }

    await ctx.db.patch(args.shipmentId, {
      status: "DeliveredConfirmed",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});

export const cancelBeforeLeave = mutation({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
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

    await ctx.db.patch(args.shipmentId, {
      status: "ReversalApplied",
      updatedAt: Date.now(),
    });

    return args.shipmentId;
  },
});
