import { v } from "convex/values";
import { financeMutation, financeQuery } from "./lib/functions";

export const conciliar = financeMutation({
  args: {
    transacaoBancariaId: v.id("transacoesBancarias"),
    contaPagarId: v.optional(v.id("contasPagar")),
    contaReceberId: v.optional(v.id("contasReceber")),
  },
  handler: async (ctx, args) => {

    if (!args.contaPagarId && !args.contaReceberId) {
      throw new Error("É necessário vincular a uma conta a pagar ou receber");
    }
    if (args.contaPagarId && args.contaReceberId) {
      throw new Error("Vincule a apenas uma conta (pagar ou receber)");
    }

    const transacao = await ctx.db.get("transacoesBancarias", args.transacaoBancariaId);
    if (!transacao) throw new Error("Transação bancária não encontrada");
    if (transacao.conciliacaoStatus === "conciliado") {
      throw new Error("Transação já conciliada");
    }

    if (args.contaPagarId) {
      const conta = await ctx.db.get("contasPagar", args.contaPagarId);
      if (!conta) throw new Error("Conta a pagar não encontrada");
    }
    if (args.contaReceberId) {
      const conta = await ctx.db.get("contasReceber", args.contaReceberId);
      if (!conta) throw new Error("Conta a receber não encontrada");
    }

    await ctx.db.patch("transacoesBancarias", args.transacaoBancariaId, {
      conciliacaoStatus: "conciliado",
    });

    return ctx.db.insert("conciliacoes", {
      transacaoBancariaId: args.transacaoBancariaId,
      contaPagarId: args.contaPagarId,
      contaReceberId: args.contaReceberId,
      userId: ctx.user.clerkId ?? ctx.user._id,
      createdAt: Date.now(),
    });
  },
});

export const desconciliar = financeMutation({
  args: { transacaoBancariaId: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {

    const transacao = await ctx.db.get("transacoesBancarias", args.transacaoBancariaId);
    if (!transacao) throw new Error("Transação bancária não encontrada");
    if (transacao.conciliacaoStatus !== "conciliado") {
      throw new Error("Transação não está conciliada");
    }

    const conciliacoes = await ctx.db
      .query("conciliacoes")
      .withIndex("by_transacao", (q) => q.eq("transacaoBancariaId", args.transacaoBancariaId))
      .collect();

    for (const c of conciliacoes) {
      await ctx.db.delete("conciliacoes", c._id);
    }

    await ctx.db.patch("transacoesBancarias", args.transacaoBancariaId, {
      conciliacaoStatus: "pendente",
    });
  },
});

export const getDashboardSummary = financeQuery({
  args: {
    contaBancariaId: v.optional(v.id("contasBancarias")),
  },
  handler: async (ctx, args) => {
    let transacoes;
    if (args.contaBancariaId) {
      transacoes = await ctx.db
        .query("transacoesBancarias")
        .withIndex("by_conta", (q) => q.eq("contaBancariaId", args.contaBancariaId!))
        .collect();
    } else {
      transacoes = await ctx.db.query("transacoesBancarias").collect();
    }

    let totalTransacoes = transacoes.length;
    let totalConciliadas = 0;
    let totalPendentes = 0;
    let totalIgnoradas = 0;
    let valorConciliado = 0;
    let valorPendente = 0;

    for (const t of transacoes) {
      if (t.conciliacaoStatus === "conciliado") {
        totalConciliadas++;
        valorConciliado += t.valor;
      } else if (t.conciliacaoStatus === "pendente") {
        totalPendentes++;
        valorPendente += t.valor;
      } else {
        totalIgnoradas++;
      }
    }

    const percentualConciliado =
      totalTransacoes > 0
        ? Math.round((totalConciliadas / totalTransacoes) * 100)
        : 0;

    return {
      totalTransacoes,
      totalConciliadas,
      totalPendentes,
      totalIgnoradas,
      valorConciliado,
      valorPendente,
      percentualConciliado,
    };
  },
});

export const getSugestoes = financeQuery({
  args: { transacaoBancariaId: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {
    const transacao = await ctx.db.get("transacoesBancarias", args.transacaoBancariaId);
    if (!transacao) return [];

    const tolerance = transacao.valor * 0.05;
    const dateTolerance = 5 * 24 * 60 * 60 * 1000;

    if (transacao.tipo === "debito") {
      const contas = await ctx.db.query("contasPagar").collect();
      return contas
        .filter((c) => {
          if (c.status === "Cancelado") return false;
          const valorMatch = Math.abs(c.valor - transacao.valor) <= tolerance;
          const dateMatch = Math.abs(c.dataVencimento - transacao.data) <= dateTolerance;
          return valorMatch && dateMatch;
        })
        .slice(0, 5)
        .map((c) => ({
          tipo: "contaPagar" as const,
          id: c._id,
          descricao: c.descricao,
          valor: c.valor,
          data: c.dataVencimento,
          status: c.status,
        }));
    } else {
      const contas = await ctx.db.query("contasReceber").collect();
      return contas
        .filter((c) => {
          if (c.status === "Cancelado" || c.status === "Recebido") return false;
          const saldo = c.valor - c.valorRecebido;
          const valorMatch = Math.abs(saldo - transacao.valor) <= tolerance;
          const dateMatch = Math.abs(c.dataVencimento - transacao.data) <= dateTolerance;
          return valorMatch && dateMatch;
        })
        .slice(0, 5)
        .map((c) => ({
          tipo: "contaReceber" as const,
          id: c._id,
          descricao: c.descricao,
          valor: c.valor - c.valorRecebido,
          data: c.dataVencimento,
          status: c.status,
        }));
    }
  },
});

export const listByTransacao = financeQuery({
  args: { transacaoBancariaId: v.id("transacoesBancarias") },
  handler: async (ctx, args) => {
    const conciliacoes = await ctx.db
      .query("conciliacoes")
      .withIndex("by_transacao", (q) => q.eq("transacaoBancariaId", args.transacaoBancariaId))
      .collect();

    return Promise.all(
      conciliacoes.map(async (c) => {
        const contaPagar = c.contaPagarId ? await ctx.db.get("contasPagar", c.contaPagarId) : null;
        const contaReceber = c.contaReceberId ? await ctx.db.get("contasReceber", c.contaReceberId) : null;
        return { ...c, contaPagar, contaReceber };
      })
    );
  },
});
