import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireRole, getUserRef } from "./lib/auth";
import { getRequestLinesWithProducts } from "./lib/enrich";
import { staffQuery } from "./lib/functions";
import { materialRequestStatus, materialRequestUrgency } from "./schema";

export const create = mutation({
  args: {
    siteId: v.id("sites"),
    reason: v.string(),
    urgency: materialRequestUrgency,
    dateNeeded: v.number(),
    lines: v.array(
      v.object({
        productId: v.id("products"),
        qty: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, [
      "operator",
      "admin",
      "manager",
      "director",
    ]);

    if (args.lines.length === 0) {
      throw new Error("Solicitação deve ter pelo menos um item");
    }
    for (const line of args.lines) {
      if (line.qty <= 0) {
        throw new Error("Quantidade deve ser maior que zero");
      }
    }
    if (!args.reason.trim()) {
      throw new Error("Motivo é obrigatório");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("materialRequests", {
      status: "Pendente",
      siteId: args.siteId,
      reason: args.reason,
      urgency: args.urgency,
      dateNeeded: args.dateNeeded,
      requestedByUserId: getUserRef(user),
      createdAt: now,
      updatedAt: now,
    });

    for (const line of args.lines) {
      await ctx.db.insert("materialRequestLines", {
        requestId,
        productId: line.productId,
        qty: line.qty,
      });
    }

    return requestId;
  },
});

export const list = staffQuery({
  args: {
    status: v.optional(materialRequestStatus),
  },
  handler: async (ctx, args) => {
    let requests;

    if (args.status) {
      requests = await ctx.db
        .query("materialRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      requests = await ctx.db
        .query("materialRequests")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    return Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get("sites", request.siteId);
        const lines = await getRequestLinesWithProducts(ctx, request._id);

        const requester = await ctx.db
          .query("users")
          .withIndex("by_email", (q) =>
            q.eq("email", request.requestedByUserId)
          )
          .first();

        let reviewer = null;
        if (request.reviewedByUserId) {
          reviewer = await ctx.db
            .query("users")
            .withIndex("by_email", (q) =>
              q.eq("email", request.reviewedByUserId!)
            )
            .first();
        }

        return {
          ...request,
          site,
          lines,
          requesterName: requester?.name ?? request.requestedByUserId,
          reviewerName: reviewer?.name ?? request.reviewedByUserId,
        };
      })
    );
  },
});

export const listByUser = staffQuery({
  args: {},
  handler: async (ctx) => {
    const user = ctx.user;

    const requests = await ctx.db
      .query("materialRequests")
      .withIndex("by_requested", (q) =>
        q.eq("requestedByUserId", getUserRef(user))
      )
      .order("desc")
      .collect();

    return Promise.all(
      requests.map(async (request) => {
        const site = await ctx.db.get("sites", request.siteId);
        const lines = await getRequestLinesWithProducts(ctx, request._id);
        return { ...request, site, lines };
      })
    );
  },
});

export const pendingCount = staffQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("materialRequests")
      .withIndex("by_status", (q) => q.eq("status", "Pendente"))
      .collect();
    return pending.length;
  },
});

export const approve = mutation({
  args: {
    requestId: v.id("materialRequests"),
    reviewNotes: v.optional(v.string()),
    lineEdits: v.optional(
      v.array(
        v.object({
          lineId: v.id("materialRequestLines"),
          approvedQty: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "director"]);

    const request = await ctx.db.get("materialRequests", args.requestId);
    if (!request) throw new Error("Solicitação não encontrada");
    if (request.status !== "Pendente") {
      throw new Error("Solicitação não está pendente");
    }

    if (args.lineEdits) {
      for (const edit of args.lineEdits) {
        if (edit.approvedQty < 0) {
          throw new Error("Quantidade aprovada não pode ser negativa");
        }
        await ctx.db.patch("materialRequestLines", edit.lineId, {
          approvedQty: edit.approvedQty,
        });
      }
    } else {
      const lines = await ctx.db
        .query("materialRequestLines")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect();
      for (const line of lines) {
        await ctx.db.patch("materialRequestLines", line._id, { approvedQty: line.qty });
      }
    }

    await ctx.db.patch("materialRequests", args.requestId, {
      status: "Aprovado",
      reviewedByUserId: getUserRef(user),
      reviewNotes: args.reviewNotes,
      updatedAt: Date.now(),
    });

    return args.requestId;
  },
});

export const reject = mutation({
  args: {
    requestId: v.id("materialRequests"),
    reviewNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "director"]);

    const request = await ctx.db.get("materialRequests", args.requestId);
    if (!request) throw new Error("Solicitação não encontrada");
    if (request.status !== "Pendente") {
      throw new Error("Solicitação não está pendente");
    }

    await ctx.db.patch("materialRequests", args.requestId, {
      status: "Rejeitado",
      reviewedByUserId: getUserRef(user),
      reviewNotes: args.reviewNotes,
      updatedAt: Date.now(),
    });

    return args.requestId;
  },
});

export const convertToShipment = mutation({
  args: {
    requestId: v.id("materialRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["admin", "manager", "director"]);

    const request = await ctx.db.get("materialRequests", args.requestId);
    if (!request) throw new Error("Solicitação não encontrada");
    if (request.status !== "Aprovado") {
      throw new Error("Solicitação deve estar aprovada para converter");
    }

    const lines = await ctx.db
      .query("materialRequestLines")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();

    const shipmentLines = lines
      .filter((line) => (line.approvedQty ?? line.qty) > 0)
      .map((line) => ({
        productId: line.productId,
        qty: line.approvedQty ?? line.qty,
      }));

    if (shipmentLines.length === 0) {
      throw new Error("Nenhuma linha com quantidade aprovada");
    }

    for (const line of shipmentLines) {
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
    const site = await ctx.db.get("sites", request.siteId);
    if (!site) throw new Error("Site não encontrado");

    const shipmentId = await ctx.db.insert("shipments", {
      status: "RegisteredOut",
      toSiteId: request.siteId,
      notes: `Gerado da solicitação: ${request.reason}`,
      userId: getUserRef(user),
      createdAt: now,
      updatedAt: now,
    });

    const qrProducts: { name: string; qty: number; unit: string }[] = [];

    for (const line of shipmentLines) {
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
        userId: getUserRef(user),
      });
    }

    const qrPayload = JSON.stringify({
      shipmentId,
      toSiteId: request.siteId,
      siteName: site.name,
      products: qrProducts,
      createdAt: now,
    });
    await ctx.db.patch("shipments", shipmentId, { qrCodeData: qrPayload });

    await ctx.db.patch("materialRequests", args.requestId, {
      status: "Convertido",
      resultingShipmentId: shipmentId,
      updatedAt: now,
    });

    return shipmentId;
  },
});
