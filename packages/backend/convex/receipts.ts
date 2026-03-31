import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return Promise.all(
      receipts.map(async (receipt) => {
        const lines = await ctx.db
          .query("receiptLines")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect();

        const enrichedLines = await Promise.all(
          lines.map(async (line) => {
            const product = await ctx.db.get(line.productId);
            return { ...line, product };
          })
        );

        let supplier = null;
        if (receipt.supplierId) {
          supplier = await ctx.db.get(receipt.supplierId);
        }

        return { ...receipt, lines: enrichedLines, supplier };
      })
    );
  },
});

export const createReceipt = mutation({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    sourceType: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        productId: v.id("products"),
        qty: v.number(),
        unitCost: v.optional(v.number()),
        costSource: v.optional(
          v.union(
            v.literal("supplier_last"),
            v.literal("material_avg"),
            v.literal("manual"),
            v.literal("unknown")
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.lines.length === 0) {
      throw new Error("Recibo deve ter pelo menos uma linha");
    }

    for (const line of args.lines) {
      if (line.qty <= 0) {
        throw new Error("Quantidade deve ser maior que zero");
      }
    }

    const now = Date.now();
    const receiptId = await ctx.db.insert("receipts", {
      status: "PendingReceipt",
      supplierId: args.supplierId,
      sourceType: args.sourceType,
      notes: args.notes,
      userId: "system",
      createdAt: now,
      updatedAt: now,
    });

    for (const line of args.lines) {
      await ctx.db.insert("receiptLines", {
        receiptId,
        productId: line.productId,
        qty: line.qty,
        unitCost: line.unitCost,
        costSource: line.costSource,
        isEstimated: line.unitCost === undefined ? undefined : false,
      });
    }

    return receiptId;
  },
});

export const acceptReceipt = mutation({
  args: {
    receiptId: v.id("receipts"),
    lineCounts: v.optional(
      v.array(
        v.object({
          lineId: v.id("receiptLines"),
          countedQty: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new Error("Recibo não encontrado");
    if (receipt.status !== "PendingReceipt") {
      throw new Error("Recibo não está pendente");
    }

    const lines = await ctx.db
      .query("receiptLines")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const countMap = new Map(
      (args.lineCounts ?? []).map((lc) => [lc.lineId, lc.countedQty])
    );

    for (const line of lines) {
      const effectiveQty = countMap.get(line._id) ?? line.qty;

      if (countMap.has(line._id)) {
        await ctx.db.patch(line._id, { countedQty: effectiveQty });
      }

      let unitCost = line.unitCost;
      let lineCostSource = line.costSource;
      let isEstimated = line.isEstimated ?? false;

      if (unitCost === undefined) {
        const snapshot = await ctx.db
          .query("inventorySnapshot")
          .withIndex("by_product", (q) => q.eq("productId", line.productId))
          .first();

        if (snapshot && snapshot.avgCost > 0) {
          unitCost = snapshot.avgCost;
          lineCostSource = "material_avg";
          isEstimated = true;
        } else {
          unitCost = 0;
          lineCostSource = "unknown";
          isEstimated = true;
        }

        await ctx.db.patch(line._id, {
          unitCost,
          costSource: lineCostSource,
          isEstimated,
        });
      }

      await ctx.runMutation(internal.inventory.applyRegisteredIn, {
        productId: line.productId,
        qty: effectiveQty,
        refId: args.receiptId,
        userId: receipt.userId,
        unitCost,
        costSource: lineCostSource,
        isEstimated,
      });
    }

    await ctx.db.patch(args.receiptId, {
      status: "Accepted",
      updatedAt: Date.now(),
    });

    return args.receiptId;
  },
});

export const returnReceipt = mutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new Error("Recibo não encontrado");
    if (receipt.status !== "PendingReceipt") {
      throw new Error("Recibo não está pendente");
    }

    await ctx.db.patch(args.receiptId, {
      status: "Returned",
      updatedAt: Date.now(),
    });

    return args.receiptId;
  },
});

export const discardReceipt = mutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new Error("Recibo não encontrado");
    if (receipt.status !== "PendingReceipt") {
      throw new Error("Recibo não está pendente");
    }

    await ctx.db.patch(args.receiptId, {
      status: "Discarded",
      updatedAt: Date.now(),
    });

    return args.receiptId;
  },
});
