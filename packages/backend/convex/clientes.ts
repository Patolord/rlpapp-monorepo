import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return ctx.db
        .query("clientes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return ctx.db.query("clientes").collect();
  },
});

export const getById = query({
  args: { id: v.id("clientes") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    nome: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    documento: v.optional(v.string()),
    endereco: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.nome.trim()) {
      throw new Error("O nome é obrigatório");
    }
    return ctx.db.insert("clientes", {
      ...args,
      isActive: true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("clientes"),
    nome: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    documento: v.optional(v.string()),
    endereco: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...fields } = args;
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const toggleActive = mutation({
  args: { id: v.id("clientes") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Cliente não encontrado");
    await ctx.db.patch(args.id, { isActive: !existing.isActive });
  },
});
