import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { transacaoTipo } from "./schema";

export const list = query({
  args: {
    contaBancariaId: v.optional(v.id("contasBancarias")),
    conciliacaoStatus: v.optional(v.string()),
    dataInicio: v.optional(v.number()),
    dataFim: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let results;

    if (args.contaBancariaId) {
      results = await ctx.db
        .query("transacoesBancarias")
        .withIndex("by_conta", (q) => q.eq("contaBancariaId", args.contaBancariaId!))
        .order("desc")
        .collect();
    } else {
      results = await ctx.db
        .query("transacoesBancarias")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    if (args.conciliacaoStatus) {
      results = results.filter((t) => t.conciliacaoStatus === args.conciliacaoStatus);
    }
    if (args.dataInicio) {
      results = results.filter((t) => t.data >= args.dataInicio!);
    }
    if (args.dataFim) {
      results = results.filter((t) => t.data <= args.dataFim!);
    }

    return Promise.all(
      results.map(async (t) => {
        const contaBancaria = await ctx.db.get(t.contaBancariaId);
        const conciliacoes = await ctx.db
          .query("conciliacoes")
          .withIndex("by_transacao", (q) => q.eq("transacaoBancariaId", t._id))
          .collect();
        return { ...t, contaBancaria, conciliacoes };
      })
    );
  },
});

export const getById = query({
  args: { id: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.id);
    if (!t) return null;
    const contaBancaria = await ctx.db.get(t.contaBancariaId);
    const conciliacoes = await ctx.db
      .query("conciliacoes")
      .withIndex("by_transacao", (q) => q.eq("transacaoBancariaId", t._id))
      .collect();
    return { ...t, contaBancaria, conciliacoes };
  },
});

export const create = mutation({
  args: {
    contaBancariaId: v.id("contasBancarias"),
    data: v.number(),
    descricao: v.string(),
    valor: v.number(),
    tipo: transacaoTipo,
    observacoes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    if (!args.descricao.trim()) {
      throw new Error("A descrição é obrigatória");
    }
    if (args.valor <= 0) {
      throw new Error("O valor deve ser maior que zero");
    }

    return ctx.db.insert("transacoesBancarias", {
      ...args,
      conciliacaoStatus: "pendente",
      userId: identity.subject,
      createdAt: Date.now(),
    });
  },
});

export const createBatch = mutation({
  args: {
    transacoes: v.array(
      v.object({
        contaBancariaId: v.id("contasBancarias"),
        data: v.number(),
        descricao: v.string(),
        valor: v.number(),
        tipo: transacaoTipo,
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const ids = [];
    for (const t of args.transacoes) {
      const id = await ctx.db.insert("transacoesBancarias", {
        ...t,
        conciliacaoStatus: "pendente",
        userId: identity.subject,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    return ids;
  },
});

export const update = mutation({
  args: {
    id: v.id("transacoesBancarias"),
    descricao: v.optional(v.string()),
    valor: v.optional(v.number()),
    data: v.optional(v.number()),
    tipo: v.optional(transacaoTipo),
    observacoes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Transação não encontrada");
    if (existing.conciliacaoStatus === "conciliado") {
      throw new Error("Não é possível editar uma transação conciliada");
    }

    const { id, ...fields } = args;
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Transação não encontrada");
    if (existing.conciliacaoStatus === "conciliado") {
      throw new Error("Não é possível excluir uma transação conciliada");
    }
    await ctx.db.delete(args.id);
  },
});

export const ignorar = mutation({
  args: { id: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Transação não encontrada");
    if (existing.conciliacaoStatus === "conciliado") {
      throw new Error("Não é possível ignorar uma transação conciliada");
    }
    await ctx.db.patch(args.id, {
      conciliacaoStatus: existing.conciliacaoStatus === "ignorado" ? "pendente" : "ignorado",
    });
  },
});
