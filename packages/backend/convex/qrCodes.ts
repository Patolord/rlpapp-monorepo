import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!qrCode) return null;

    let equipment = null;
    if (qrCode.equipmentId) {
      equipment = await ctx.db.get(qrCode.equipmentId);
    }

    return { qrCode, equipment };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("qrCodes").order("desc").collect();
  },
});

export const listWithEquipment = query({
  args: {
    filter: v.optional(
      v.union(
        v.literal("linked"),
        v.literal("free"),
        v.literal("all"),
        v.literal("latest_batch")
      )
    ),
  },
  handler: async (ctx, args) => {
    let qrCodes = await ctx.db.query("qrCodes").order("desc").collect();

    const filterMode = args.filter ?? "all";
    if (filterMode === "linked") {
      qrCodes = qrCodes.filter((q) => q.equipmentId);
    } else if (filterMode === "free") {
      qrCodes = qrCodes.filter((q) => !q.equipmentId);
    } else if (filterMode === "latest_batch") {
      const latestBatch = qrCodes.find((q) => q.batchId)?.batchId;
      if (latestBatch) {
        qrCodes = qrCodes.filter((q) => q.batchId === latestBatch);
      }
    }

    return Promise.all(
      qrCodes.map(async (qr) => ({
        ...qr,
        equipment: qr.equipmentId ? await ctx.db.get(qr.equipmentId) : null,
      }))
    );
  },
});

export const getByEquipmentId = query({
  args: { equipmentId: v.id("equipment") },
  handler: async (ctx, args) => {
    const qrCodes = await ctx.db.query("qrCodes").order("desc").collect();
    return qrCodes.find((q) => q.equipmentId === args.equipmentId) ?? null;
  },
});

export const create = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (existing) {
      throw new Error(`QR code with token "${args.token}" already exists`);
    }

    return await ctx.db.insert("qrCodes", {
      token: args.token,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const batchCreate = mutation({
  args: {
    tokens: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const batchId = `batch-${Date.now()}`;
    const ids = [];
    for (const token of args.tokens) {
      const existing = await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();

      if (existing) continue;

      const id = await ctx.db.insert("qrCodes", {
        token,
        status: "active",
        batchId,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return { ids, batchId };
  },
});

export const assignEquipment = mutation({
  args: {
    token: v.string(),
    equipmentId: v.id("equipment"),
  },
  handler: async (ctx, args) => {
    const qrCode = await ctx.db
      .query("qrCodes")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!qrCode) {
      throw new Error("QR code not found");
    }

    if (qrCode.equipmentId) {
      throw new Error("QR code already linked to equipment");
    }

    await ctx.db.patch(qrCode._id, {
      equipmentId: args.equipmentId,
    });
  },
});
