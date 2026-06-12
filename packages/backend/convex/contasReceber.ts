import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { appendCancelamento, filterDefined } from "./lib/financeiro";
import { financeMutation, financeQuery } from "./lib/functions";
import {
  categoriaFinanceiraDoc,
  clienteDoc,
  contaReceberDoc,
  contaReceberEnriched,
} from "./lib/validators";
import { contaReceberStatus, formaPagamento } from "./schema";

export const list = financeQuery({
  args: {
    status: v.optional(contaReceberStatus),
    clienteId: v.optional(v.id("clientes")),
    categoriaId: v.optional(v.id("categoriasFinanceiras")),
  },
  returns: v.array(contaReceberEnriched),
  handler: async (ctx, args) => {
    let results;

    if (args.status) {
      results = await ctx.db
        .query("contasReceber")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
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
          ? await ctx.db.get("categoriasFinanceiras", conta.categoriaId)
          : null;
        const cliente = conta.clienteId
          ? await ctx.db.get("clientes", conta.clienteId)
          : null;
        const contaBancaria = conta.contaBancariaId
          ? await ctx.db.get("contasBancarias", conta.contaBancariaId)
          : null;
        return { ...conta, categoria, cliente, contaBancaria };
      })
    );
  },
});

export const getById = financeQuery({
  args: { id: v.id("contasReceber") },
  returns: v.union(contaReceberEnriched, v.null()),
  handler: async (ctx, args) => {
    const conta = await ctx.db.get("contasReceber", args.id);
    if (!conta) return null;

    const categoria = conta.categoriaId
      ? await ctx.db.get("categoriasFinanceiras", conta.categoriaId)
      : null;
    const cliente = conta.clienteId
      ? await ctx.db.get("clientes", conta.clienteId)
      : null;
    const contaBancaria = conta.contaBancariaId
      ? await ctx.db.get("contasBancarias", conta.contaBancariaId)
      : null;

    return { ...conta, categoria, cliente, contaBancaria };
  },
});

export const getDashboardSummary = financeQuery({
  args: { now: v.number() },
  returns: v.object({
    totalAReceber: v.number(),
    totalVencido: v.number(),
    totalRecebidoMes: v.number(),
    countVencendoSemana: v.number(),
    countInadimplentes: v.number(),
    countEmitido: v.number(),
    countRecebido: v.number(),
    totalContas: v.number(),
  }),
  handler: async (ctx, args) => {
    const todas = await ctx.db.query("contasReceber").collect();
    const now = args.now;
    const startOfMonth = new Date(now);
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

export const getInadimplentes = financeQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      ...contaReceberDoc.fields,
      cliente: v.union(clienteDoc, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const now = args.now;
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
            ? await ctx.db.get("clientes", conta.clienteId)
            : null;
          return { ...conta, cliente };
        })
    );
  },
});

export const getProximasVencer = financeQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      ...contaReceberDoc.fields,
      cliente: v.union(clienteDoc, v.null()),
      categoria: v.union(categoriaFinanceiraDoc, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const now = args.now;
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
            ? await ctx.db.get("clientes", conta.clienteId)
            : null;
          const categoria = conta.categoriaId
            ? await ctx.db.get("categoriasFinanceiras", conta.categoriaId)
            : null;
          return { ...conta, cliente, categoria };
        })
    );
  },
});

export const create = financeMutation({
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
  returns: v.id("contasReceber"),
  handler: async (ctx, args) => {
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
      userId: ctx.user.clerkId ?? ctx.user._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const update = financeMutation({
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("contasReceber", args.id);
    if (!existing) throw new Error("Conta não encontrada");
    if (existing.status === "Recebido" || existing.status === "Cancelado") {
      throw new Error("Não é possível editar uma conta recebida ou cancelada");
    }

    const { id, ...fields } = args;
    const updates: Partial<Doc<"contasReceber">> = {
      ...filterDefined(fields),
      updatedAt: Date.now(),
    };
    await ctx.db.patch("contasReceber", id, updates);
  },
});

export const registrarRecebimento = financeMutation({
  args: {
    id: v.id("contasReceber"),
    valorRecebido: v.number(),
    dataRecebimento: v.optional(v.number()),
    formaPagamento: v.optional(formaPagamento),
    contaBancariaId: v.optional(v.id("contasBancarias")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conta = await ctx.db.get("contasReceber", args.id);
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

    await ctx.db.patch("contasReceber", args.id, {
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

export const cancelar = financeMutation({
  args: {
    id: v.id("contasReceber"),
    observacao: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conta = await ctx.db.get("contasReceber", args.id);
    if (!conta) throw new Error("Conta não encontrada");
    if (conta.status === "Recebido") {
      throw new Error("Não é possível cancelar uma conta já recebida");
    }

    await ctx.db.patch("contasReceber", args.id, {
      status: "Cancelado",
      observacoes: appendCancelamento(conta.observacoes, args.observacao),
      updatedAt: Date.now(),
    });
  },
});
