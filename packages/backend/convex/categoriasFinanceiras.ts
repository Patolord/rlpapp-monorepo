import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { categoriaTipo } from "./schema";

export const list = query({
  args: {
    tipo: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let results;
    if (args.tipo) {
      results = await ctx.db
        .query("categoriasFinanceiras")
        .withIndex("by_tipo", (q) => q.eq("tipo", args.tipo as any))
        .collect();
    } else {
      results = await ctx.db.query("categoriasFinanceiras").collect();
    }

    if (args.activeOnly) {
      results = results.filter((c) => c.isActive);
    }

    return results;
  },
});

export const getById = query({
  args: { id: v.id("categoriasFinanceiras") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    nome: v.string(),
    tipo: categoriaTipo,
    cor: v.optional(v.string()),
    icone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db.insert("categoriasFinanceiras", {
      nome: args.nome,
      tipo: args.tipo,
      cor: args.cor,
      icone: args.icone,
      isActive: true,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("categoriasFinanceiras"),
    nome: v.optional(v.string()),
    tipo: v.optional(categoriaTipo),
    cor: v.optional(v.string()),
    icone: v.optional(v.string()),
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
  args: { id: v.id("categoriasFinanceiras") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Categoria não encontrada");
    await ctx.db.patch(args.id, { isActive: !existing.isActive });
  },
});
