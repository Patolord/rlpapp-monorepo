import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { contaPagarStatus, formaPagamento } from "./schema";

export const list = query({
  args: {
    status: v.optional(v.string()),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    fornecedorId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    let results;

    if (args.status) {
      results = await ctx.db
        .query("contasPagar")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .collect();
    } else {
      results = await ctx.db
        .query("contasPagar")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    if (args.categoriaId) {
      results = results.filter((c) => c.categoriaId === args.categoriaId);
    }
    if (args.fornecedorId) {
      results = results.filter((c) => c.fornecedorId === args.fornecedorId);
    }

    return Promise.all(
      results.map(async (conta) => {
        const categoria = conta.categoriaId
          ? await ctx.db.get(conta.categoriaId)
          : null;
        const fornecedor = conta.fornecedorId
          ? await ctx.db.get(conta.fornecedorId)
          : null;
        const contaBancaria = conta.contaBancariaId
          ? await ctx.db.get(conta.contaBancariaId)
          : null;
        return { ...conta, categoria, fornecedor, contaBancaria };
      })
    );
  },
});

export const getById = query({
  args: { id: v.id("contasPagar") },
  handler: async (ctx, args) => {
    const conta = await ctx.db.get(args.id);
    if (!conta) return null;

    const categoria = conta.categoriaId
      ? await ctx.db.get(conta.categoriaId)
      : null;
    const fornecedor = conta.fornecedorId
      ? await ctx.db.get(conta.fornecedorId)
      : null;
    const contaBancaria = conta.contaBancariaId
      ? await ctx.db.get(conta.contaBancariaId)
      : null;
    const aprovacoes = await ctx.db
      .query("aprovacoes")
      .withIndex("by_conta", (q) => q.eq("contaPagarId", args.id))
      .collect();

    return { ...conta, categoria, fornecedor, contaBancaria, aprovacoes };
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const todas = await ctx.db.query("contasPagar").collect();
    const now = Date.now();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

    let totalPendente = 0;
    let totalVencido = 0;
    let totalPagoMes = 0;
    let countVencendoSemana = 0;
    let countVencido = 0;
    let countPendente = 0;
    let countPago = 0;

    for (const conta of todas) {
      if (conta.status === "Pendente" || conta.status === "Aprovado") {
        totalPendente += conta.valor;
        countPendente++;
        if (conta.dataVencimento <= now) {
          totalVencido += conta.valor;
          countVencido++;
        } else if (conta.dataVencimento <= weekFromNow) {
          countVencendoSemana++;
        }
      }
      if (conta.status === "Vencido") {
        totalVencido += conta.valor;
        countVencido++;
      }
      if (
        conta.status === "Pago" &&
        conta.dataPagamento &&
        conta.dataPagamento >= startOfMonthMs
      ) {
        totalPagoMes += conta.valor;
        countPago++;
      }
    }

    return {
      totalPendente,
      totalVencido,
      totalPagoMes,
      countVencendoSemana,
      countVencido,
      countPendente,
      countPago,
      totalContas: todas.length,
    };
  },
});

export const getVencidas = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pendentes = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Pendente"))
      .collect();
    const aprovadas = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Aprovado"))
      .collect();
    const vencidas = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Vencido"))
      .collect();

    const todas = [...pendentes, ...aprovadas, ...vencidas].filter(
      (c) => c.dataVencimento < now && c.status !== "Pago" && c.status !== "Cancelado"
    );

    return Promise.all(
      todas
        .sort((a, b) => a.dataVencimento - b.dataVencimento)
        .slice(0, 10)
        .map(async (conta) => {
          const fornecedor = conta.fornecedorId
            ? await ctx.db.get(conta.fornecedorId)
            : null;
          return { ...conta, fornecedor };
        })
    );
  },
});

export const getProximasVencer = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

    const pendentes = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Pendente"))
      .collect();
    const aprovadas = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Aprovado"))
      .collect();

    const proximas = [...pendentes, ...aprovadas].filter(
      (c) => c.dataVencimento >= now && c.dataVencimento <= weekFromNow
    );

    return Promise.all(
      proximas
        .sort((a, b) => a.dataVencimento - b.dataVencimento)
        .slice(0, 10)
        .map(async (conta) => {
          const fornecedor = conta.fornecedorId
            ? await ctx.db.get(conta.fornecedorId)
            : null;
          const categoria = conta.categoriaId
            ? await ctx.db.get(conta.categoriaId)
            : null;
          return { ...conta, fornecedor, categoria };
        })
    );
  },
});

export const create = mutation({
  args: {
    descricao: v.string(),
    valor: v.number(),
    dataVencimento: v.number(),
    dataCompetencia: v.number(),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    fornecedorId: v.optional(v.id("suppliers")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    recorrente: v.optional(v.boolean()),
    observacoes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    if (args.valor <= 0) {
      throw new Error("O valor deve ser maior que zero");
    }
    if (!args.descricao.trim()) {
      throw new Error("A descrição é obrigatória");
    }

    return ctx.db.insert("contasPagar", {
      ...args,
      status: "Pendente",
      userId: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("contasPagar"),
    descricao: v.optional(v.string()),
    valor: v.optional(v.number()),
    dataVencimento: v.optional(v.number()),
    dataCompetencia: v.optional(v.number()),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    fornecedorId: v.optional(v.id("suppliers")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    recorrente: v.optional(v.boolean()),
    observacoes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Conta não encontrada");
    if (existing.status === "Pago" || existing.status === "Cancelado") {
      throw new Error("Não é possível editar uma conta paga ou cancelada");
    }

    const { id, ...fields } = args;
    const updates: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const aprovar = mutation({
  args: {
    id: v.id("contasPagar"),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const conta = await ctx.db.get(args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status !== "Pendente" && conta.status !== "Vencido") {
      throw new Error("Apenas contas pendentes ou vencidas podem ser aprovadas");
    }

    await ctx.db.patch(args.id, {
      status: "Aprovado",
      updatedAt: Date.now(),
    });

    await ctx.db.insert("aprovacoes", {
      contaPagarId: args.id,
      aprovadorId: identity.subject,
      status: "aprovado",
      observacao: args.observacao,
      createdAt: Date.now(),
    });
  },
});

export const registrarPagamento = mutation({
  args: {
    id: v.id("contasPagar"),
    dataPagamento: v.optional(v.number()),
    formaPagamento: v.optional(formaPagamento),
    contaBancariaId: v.optional(v.id("contasBancarias")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const conta = await ctx.db.get(args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status === "Pago") {
      throw new Error("Esta conta já foi paga");
    }
    if (conta.status === "Cancelado") {
      throw new Error("Não é possível pagar uma conta cancelada");
    }

    await ctx.db.patch(args.id, {
      status: "Pago",
      dataPagamento: args.dataPagamento ?? Date.now(),
      formaPagamento: args.formaPagamento ?? conta.formaPagamento,
      contaBancariaId: args.contaBancariaId ?? conta.contaBancariaId,
      updatedAt: Date.now(),
    });
  },
});

export const cancelar = mutation({
  args: {
    id: v.id("contasPagar"),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const conta = await ctx.db.get(args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status === "Pago") {
      throw new Error("Não é possível cancelar uma conta já paga");
    }

    await ctx.db.patch(args.id, {
      status: "Cancelado",
      observacoes: args.observacao
        ? `${conta.observacoes ? conta.observacoes + " | " : ""}Cancelado: ${args.observacao}`
        : conta.observacoes,
      updatedAt: Date.now(),
    });
  },
});
