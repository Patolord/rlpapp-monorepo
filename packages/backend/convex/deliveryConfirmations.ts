import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, getUserByIdentity, requireRole, getUserRef } from "./lib/auth";

export const list = query({
  args: {
    siteId: v.optional(v.id("sites")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let confirmations;

    if (args.siteId) {
      confirmations = await ctx.db
        .query("deliveryConfirmations")
        .withIndex("by_site", (q) => q.eq("receivedAtSiteId", args.siteId!))
        .order("desc")
        .collect();
    } else {
      confirmations = await ctx.db
        .query("deliveryConfirmations")
        .withIndex("by_confirmed")
        .order("desc")
        .collect();
    }

    if (args.startDate) {
      confirmations = confirmations.filter(
        (c) => c.confirmedAt >= args.startDate!
      );
    }
    if (args.endDate) {
      confirmations = confirmations.filter(
        (c) => c.confirmedAt <= args.endDate!
      );
    }

    return Promise.all(
      confirmations.map(async (confirmation) => {
        const shipment = await ctx.db.get(confirmation.shipmentId);
        const site = await ctx.db.get(confirmation.receivedAtSiteId);

        let shipmentLines: {
          productName: string;
          qty: number;
          unit: string;
          countedQty?: number;
        }[] = [];
        if (shipment) {
          const lines = await ctx.db
            .query("shipmentLines")
            .withIndex("by_shipment", (q) =>
              q.eq("shipmentId", shipment._id)
            )
            .collect();
          shipmentLines = await Promise.all(
            lines.map(async (line) => {
              const product = await ctx.db.get(line.productId);
              return {
                productName: product?.name ?? "Produto removido",
                qty: line.qty,
                unit: product?.unit ?? "un",
                countedQty: line.countedQty,
              };
            })
          );
        }

        const confirmedByUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) =>
            q.eq("email", confirmation.confirmedByUserId)
          )
          .first();

        return {
          ...confirmation,
          site,
          shipment,
          shipmentLines,
          confirmedByUserName: confirmedByUser?.name ?? confirmation.confirmedByUserId,
        };
      })
    );
  },
});

export const getByShipment = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("deliveryConfirmations")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", args.shipmentId))
      .first();
  },
});

export const confirmFromQR = mutation({
  args: {
    shipmentId: v.id("shipments"),
    receivedAtSiteId: v.id("sites"),
    receiverName: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [
      "operator",
      "admin",
      "manager",
      "director",
    ]);

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Remessa não encontrada");

    if (
      shipment.status !== "RegisteredOut" &&
      shipment.status !== "PendingShipment"
    ) {
      throw new Error(
        "Remessa já foi entregue, cancelada ou revertida"
      );
    }

    if (shipment.toSiteId !== args.receivedAtSiteId) {
      const expectedSite = await ctx.db.get(shipment.toSiteId);
      const receivedSite = await ctx.db.get(args.receivedAtSiteId);
      throw new Error(
        `Site de destino não confere. Esperado: ${expectedSite?.name ?? "desconhecido"}, Recebido em: ${receivedSite?.name ?? "desconhecido"}`
      );
    }

    const existing = await ctx.db
      .query("deliveryConfirmations")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", args.shipmentId))
      .first();
    if (existing) {
      throw new Error("Esta remessa já foi confirmada anteriormente");
    }

    const now = Date.now();

    await ctx.db.insert("deliveryConfirmations", {
      shipmentId: args.shipmentId,
      receiverName: args.receiverName,
      receivedAtSiteId: args.receivedAtSiteId,
      confirmedByUserId: getUserRef(user),
      confirmedAt: now,
      notes: args.notes,
    });

    await ctx.db.patch(args.shipmentId, {
      status: "DeliveredConfirmed",
      updatedAt: now,
    });

    return args.shipmentId;
  },
});
