import { v } from "convex/values";
import { filterDefined } from "./lib/financeiro";
import { financeMutation, financeQuery } from "./lib/functions";
import { categoriaTipo } from "./schema";

export const list = financeQuery({
  args: {
    tipo: v.optional(categoriaTipo),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let results;
    if (args.tipo) {
      results = await ctx.db
        .query("categoriasFinanceiras")
        .withIndex("by_tipo", (q) => q.eq("tipo", args.tipo!))
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

export const getById = financeQuery({
  args: { id: v.id("categoriasFinanceiras") },
  handler: async (ctx, args) => {
    return ctx.db.get("categoriasFinanceiras", args.id);
  },
});

export const create = financeMutation({
  args: {
    nome: v.string(),
    tipo: categoriaTipo,
    cor: v.optional(v.string()),
    icone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("categoriasFinanceiras", {
      nome: args.nome,
      tipo: args.tipo,
      cor: args.cor,
      icone: args.icone,
      isActive: true,
    });
  },
});

export const update = financeMutation({
  args: {
    id: v.id("categoriasFinanceiras"),
    nome: v.optional(v.string()),
    tipo: v.optional(categoriaTipo),
    cor: v.optional(v.string()),
    icone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates = filterDefined(fields);
    await ctx.db.patch("categoriasFinanceiras", id, updates);
  },
});

export const toggleActive = financeMutation({
  args: { id: v.id("categoriasFinanceiras") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("categoriasFinanceiras", args.id);
    if (!existing) throw new Error("Categoria não encontrada");
    await ctx.db.patch("categoriasFinanceiras", args.id, { isActive: !existing.isActive });
  },
});
