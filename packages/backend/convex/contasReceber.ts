import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { contaReceberStatus, formaPagamento } from "./schema";

export const list = query({
  args: {
    status: v.optional(v.string()),
    clienteId: v.optional(v.id("clientes")),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
  },
  handler: async (ctx, args) => {
    let results;

    if (args.status) {
      results = await ctx.db
        .query("contasReceber")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .collect();
    } else {
      results = await ctx.db
        .query("contasReceber")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    if (args.clienteId) {
      results = results.filter((c) => c.clienteId === args.clienteId);
    }
    if (args.categoriaId) {
      results = results.filter((c) => c.categoriaId === args.categoriaId);
    }

    return Promise.all(
      results.map(async (conta) => {
        const categoria = conta.categoriaId
          ? await ctx.db.get(conta.categoriaId)
          : null;
        const cliente = conta.clienteId
          ? await ctx.db.get(conta.clienteId)
          : null;
        const contaBancaria = conta.contaBancariaId
          ? await ctx.db.get(conta.contaBancariaId)
          : null;
        return { ...conta, categoria, cliente, contaBancaria };
      })
    );
  },
});

export const getById = query({
  args: { id: v.id("contasReceber") },
  handler: async (ctx, args) => {
    const conta = await ctx.db.get(args.id);
    if (!conta) return null;

    const categoria = conta.categoriaId
      ? await ctx.db.get(conta.categoriaId)
      : null;
    const cliente = conta.clienteId
      ? await ctx.db.get(conta.clienteId)
      : null;
    const contaBancaria = conta.contaBancariaId
      ? await ctx.db.get(conta.contaBancariaId)
      : null;

    return { ...conta, categoria, cliente, contaBancaria };
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const todas = await ctx.db.query("contasReceber").collect();
    const now = Date.now();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

    let totalAReceber = 0;
    let totalVencido = 0;
    let totalRecebidoMes = 0;
    let countVencendoSemana = 0;
    let countInadimplentes = 0;
    let countEmitido = 0;
    let countRecebido = 0;

    for (const conta of todas) {
      const saldo = conta.valor - conta.valorRecebido;

      if (conta.status === "Emitido" || conta.status === "Parcial") {
        totalAReceber += saldo;
        countEmitido++;
        if (conta.dataVencimento <= now) {
          totalVencido += saldo;
          countInadimplentes++;
        } else if (conta.dataVencimento <= weekFromNow) {
          countVencendoSemana++;
        }
      }
      if (conta.status === "Vencido") {
        totalVencido += saldo;
        countInadimplentes++;
      }
      if (
        conta.status === "Recebido" &&
        conta.dataRecebimento &&
        conta.dataRecebimento >= startOfMonthMs
      ) {
        totalRecebidoMes += conta.valor;
        countRecebido++;
      }
    }

    return {
      totalAReceber,
      totalVencido,
      totalRecebidoMes,
      countVencendoSemana,
      countInadimplentes,
      countEmitido,
      countRecebido,
      totalContas: todas.length,
    };
  },
});

export const getInadimplentes = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const emitidos = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Emitido"))
      .collect();
    const parciais = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Parcial"))
      .collect();
    const vencidos = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Vencido"))
      .collect();

    const todas = [...emitidos, ...parciais, ...vencidos].filter(
      (c) => c.dataVencimento < now
    );

    return Promise.all(
      todas
        .sort((a, b) => a.dataVencimento - b.dataVencimento)
        .slice(0, 10)
        .map(async (conta) => {
          const cliente = conta.clienteId
            ? await ctx.db.get(conta.clienteId)
            : null;
          return { ...conta, cliente };
        })
    );
  },
});

export const getProximasVencer = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

    const emitidos = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Emitido"))
      .collect();
    const parciais = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Parcial"))
      .collect();

    const proximas = [...emitidos, ...parciais].filter(
      (c) => c.dataVencimento >= now && c.dataVencimento <= weekFromNow
    );

    return Promise.all(
      proximas
        .sort((a, b) => a.dataVencimento - b.dataVencimento)
        .slice(0, 10)
        .map(async (conta) => {
          const cliente = conta.clienteId
            ? await ctx.db.get(conta.clienteId)
            : null;
          const categoria = conta.categoriaId
            ? await ctx.db.get(conta.categoriaId)
            : null;
          return { ...conta, cliente, categoria };
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
    dataEmissao: v.number(),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    clienteId: v.optional(v.id("clientes")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    notaFiscal: v.optional(v.string()),
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

    return ctx.db.insert("contasReceber", {
      ...args,
      valorRecebido: 0,
      status: "Emitido",
      userId: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("contasReceber"),
    descricao: v.optional(v.string()),
    valor: v.optional(v.number()),
    dataVencimento: v.optional(v.number()),
    dataCompetencia: v.optional(v.number()),
    dataEmissao: v.optional(v.number()),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
    clienteId: v.optional(v.id("clientes")),
    contaBancariaId: v.optional(v.id("contasBancarias")),
    formaPagamento: v.optional(formaPagamento),
    notaFiscal: v.optional(v.string()),
    observacoes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Conta não encontrada");
    if (existing.status === "Recebido" || existing.status === "Cancelado") {
      throw new Error("Não é possível editar uma conta recebida ou cancelada");
    }

    const { id, ...fields } = args;
    const updates: Record<string, any> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(id, updates);
  },
});

export const registrarRecebimento = mutation({
  args: {
    id: v.id("contasReceber"),
    valorRecebido: v.number(),
    dataRecebimento: v.optional(v.number()),
    formaPagamento: v.optional(formaPagamento),
    contaBancariaId: v.optional(v.id("contasBancarias")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const conta = await ctx.db.get(args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status === "Recebido") {
      throw new Error("Esta conta já foi totalmente recebida");
    }
    if (conta.status === "Cancelado") {
      throw new Error("Não é possível registrar recebimento de conta cancelada");
    }
    if (args.valorRecebido <= 0) {
      throw new Error("O valor recebido deve ser maior que zero");
    }

    const novoValorRecebido = conta.valorRecebido + args.valorRecebido;
    const totalmenteRecebido = novoValorRecebido >= conta.valor;

    await ctx.db.patch(args.id, {
      valorRecebido: totalmenteRecebido ? conta.valor : novoValorRecebido,
      status: totalmenteRecebido ? "Recebido" : "Parcial",
      dataRecebimento: totalmenteRecebido
        ? (args.dataRecebimento ?? Date.now())
        : conta.dataRecebimento,
      formaPagamento: args.formaPagamento ?? conta.formaPagamento,
      contaBancariaId: args.contaBancariaId ?? conta.contaBancariaId,
      updatedAt: Date.now(),
    });
  },
});

export const cancelar = mutation({
  args: {
    id: v.id("contasReceber"),
    observacao: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const conta = await ctx.db.get(args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status === "Recebido") {
      throw new Error("Não é possível cancelar uma conta já recebida");
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
