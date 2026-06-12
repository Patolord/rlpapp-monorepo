import { v } from "convex/values";
import { filterDefined } from "./lib/financeiro";
import { financeMutation, financeQuery } from "./lib/functions";
import { tipoConta } from "./schema";

export const list = financeQuery({
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

export const getById = financeQuery({
  args: { id: v.id("contasBancarias") },
  handler: async (ctx, args) => {
    return ctx.db.get("contasBancarias", args.id);
  },
});

export const create = financeMutation({
  args: {
    nome: v.string(),
    banco: v.string(),
    agencia: v.string(),
    conta: v.string(),
    tipo: tipoConta,
    saldoInicial: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("contasBancarias", {
      ...args,
      isActive: true,
    });
  },
});

export const update = financeMutation({
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
    const { id, ...fields } = args;
    const updates = filterDefined(fields);
    await ctx.db.patch("contasBancarias", id, updates);
  },
});

export const toggleActive = financeMutation({
  args: { id: v.id("contasBancarias") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("contasBancarias", args.id);
    if (!existing) throw new Error("Conta bancária não encontrada");
    await ctx.db.patch("contasBancarias", args.id, { isActive: !existing.isActive });
  },
});
