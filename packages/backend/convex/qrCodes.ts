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
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return ids;
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

    await ctx.db.patch(qrCode._id, {
      equipmentId: args.equipmentId,
    });
  },
});
