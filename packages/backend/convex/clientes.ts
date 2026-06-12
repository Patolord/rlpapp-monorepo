import { v } from "convex/values";
import { filterDefined } from "./lib/financeiro";
import { financeMutation, financeQuery } from "./lib/functions";

export const list = financeQuery({
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

export const getById = financeQuery({
  args: { id: v.id("clientes") },
  handler: async (ctx, args) => {
    return ctx.db.get("clientes", args.id);
  },
});

export const create = financeMutation({
  args: {
    nome: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    documento: v.optional(v.string()),
    endereco: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.nome.trim()) {
      throw new Error("O nome é obrigatório");
    }
    return ctx.db.insert("clientes", {
      ...args,
      isActive: true,
    });
  },
});

export const update = financeMutation({
  args: {
    id: v.id("clientes"),
    nome: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    documento: v.optional(v.string()),
    endereco: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates = filterDefined(fields);
    await ctx.db.patch("clientes", id, updates);
  },
});

export const toggleActive = financeMutation({
  args: { id: v.id("clientes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("clientes", args.id);
    if (!existing) throw new Error("Cliente não encontrado");
    await ctx.db.patch("clientes", args.id, { isActive: !existing.isActive });
  },
});
