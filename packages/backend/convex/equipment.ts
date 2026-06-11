import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireStaff } from "./lib/auth";

export const get = query({
  args: { id: v.id("equipment") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db.query("equipment").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    tag: v.string(),
    type: v.string(),
    location: v.string(),
    status: v.union(
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.insert("equipment", {
      tag: args.tag,
      type: args.type,
      location: args.location,
      status: args.status,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("equipment"),
    tag: v.optional(v.string()),
    type: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("operational"),
        v.literal("warning"),
        v.literal("error")
      )
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...updates } = args;
    const equipment = await ctx.db.get(id);
    if (!equipment) throw new Error("Equipment not found");

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) filtered[key] = value;
    }

    await ctx.db.patch(id, filtered);
    return id;
  },
});
