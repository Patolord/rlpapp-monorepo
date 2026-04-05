import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { tipoConta } from "./schema";

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      return ctx.db
        .query("contasBancarias")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return ctx.db.query("contasBancarias").collect();
  },
});

export const getById = query({
  args: { id: v.id("contasBancarias") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    nome: v.string(),
    banco: v.string(),
    agencia: v.string(),
    conta: v.string(),
    tipo: tipoConta,
    saldoInicial: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db.insert("contasBancarias", {
      ...args,
      isActive: true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("contasBancarias"),
    nome: v.optional(v.string()),
    banco: v.optional(v.string()),
    agencia: v.optional(v.string()),
    conta: v.optional(v.string()),
    tipo: v.optional(tipoConta),
    saldoInicial: v.optional(v.number()),
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
  args: { id: v.id("contasBancarias") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Conta bancária não encontrada");
    await ctx.db.patch(args.id, { isActive: !existing.isActive });
  },
});
