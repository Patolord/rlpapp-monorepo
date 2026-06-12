import { v } from "convex/values";
import { financeQuery } from "./lib/functions";

export const fluxoDeCaixa = financeQuery({
  args: {
    dataInicio: v.number(),
    dataFim: v.number(),
    agrupamento: v.optional(v.union(v.literal("dia"), v.literal("semana"), v.literal("mes"))),
  },
  handler: async (ctx, args) => {
    const agrupamento = args.agrupamento ?? "mes";

    const contasPagar = await ctx.db.query("contasPagar").collect();
    const contasReceber = await ctx.db.query("contasReceber").collect();

    const saidas = contasPagar.filter(
      (c) =>
        c.status === "Pago" &&
        c.dataPagamento &&
        c.dataPagamento >= args.dataInicio &&
        c.dataPagamento <= args.dataFim
    );

    const entradas = contasReceber.filter(
      (c) =>
        c.status === "Recebido" &&
        c.dataRecebimento &&
        c.dataRecebimento >= args.dataInicio &&
        c.dataRecebimento <= args.dataFim
    );

    const getKey = (timestamp: number): string => {
      const d = new Date(timestamp);
      if (agrupamento === "dia") {
        return d.toISOString().split("T")[0];
      }
      if (agrupamento === "semana") {
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        return monday.toISOString().split("T")[0];
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    const periods = new Map<string, { entradas: number; saidas: number }>();

    for (const c of entradas) {
      const key = getKey(c.dataRecebimento!);
      const p = periods.get(key) ?? { entradas: 0, saidas: 0 };
      p.entradas += c.valor;
      periods.set(key, p);
    }

    for (const c of saidas) {
      const key = getKey(c.dataPagamento!);
      const p = periods.get(key) ?? { entradas: 0, saidas: 0 };
      p.saidas += c.valor;
      periods.set(key, p);
    }

    const sorted = [...periods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, data]) => ({
        periodo,
        entradas: data.entradas,
        saidas: data.saidas,
        saldo: data.entradas - data.saidas,
      }));

    let saldoAcumulado = 0;
    const result = sorted.map((p) => {
      saldoAcumulado += p.saldo;
      return { ...p, saldoAcumulado };
    });

    const totalEntradas = result.reduce((s, p) => s + p.entradas, 0);
    const totalSaidas = result.reduce((s, p) => s + p.saidas, 0);

    return {
      periodos: result,
      totalEntradas,
      totalSaidas,
      saldoTotal: totalEntradas - totalSaidas,
    };
  },
});

export const dre = financeQuery({
  args: {
    dataInicio: v.number(),
    dataFim: v.number(),
  },
  handler: async (ctx, args) => {
    const contasPagar = await ctx.db.query("contasPagar").collect();
    const contasReceber = await ctx.db.query("contasReceber").collect();
    const categorias = await ctx.db.query("categoriasFinanceiras").collect();

    const despesasPagas = contasPagar.filter(
      (c) =>
        c.status === "Pago" &&
        c.dataPagamento &&
        c.dataPagamento >= args.dataInicio &&
        c.dataPagamento <= args.dataFim
    );

    const receitasRecebidas = contasReceber.filter(
      (c) =>
        c.status === "Recebido" &&
        c.dataRecebimento &&
        c.dataRecebimento >= args.dataInicio &&
        c.dataRecebimento <= args.dataFim
    );

    const receitasPorCategoria = new Map<string, { nome: string; total: number; count: number }>();
    for (const c of receitasRecebidas) {
      const catId = c.categoriaId ?? "sem-categoria";
      const cat = c.categoriaId ? categorias.find((cat) => cat._id === c.categoriaId) : null;
      const entry = receitasPorCategoria.get(catId) ?? {
        nome: cat?.nome ?? "Sem Categoria",
        total: 0,
        count: 0,
      };
      entry.total += c.valor;
      entry.count++;
      receitasPorCategoria.set(catId, entry);
    }

    const despesasPorCategoria = new Map<string, { nome: string; total: number; count: number }>();
    for (const c of despesasPagas) {
      const catId = c.categoriaId ?? "sem-categoria";
      const cat = c.categoriaId ? categorias.find((cat) => cat._id === c.categoriaId) : null;
      const entry = despesasPorCategoria.get(catId) ?? {
        nome: cat?.nome ?? "Sem Categoria",
        total: 0,
        count: 0,
      };
      entry.total += c.valor;
      entry.count++;
      despesasPorCategoria.set(catId, entry);
    }

    const totalReceitas = receitasRecebidas.reduce((s, c) => s + c.valor, 0);
    const totalDespesas = despesasPagas.reduce((s, c) => s + c.valor, 0);

    return {
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
      margemPercentual:
        totalReceitas > 0
          ? Math.round(((totalReceitas - totalDespesas) / totalReceitas) * 10000) / 100
          : 0,
      receitas: [...receitasPorCategoria.values()].sort((a, b) => b.total - a.total),
      despesas: [...despesasPorCategoria.values()].sort((a, b) => b.total - a.total),
    };
  },
});

export const aging = financeQuery({
  args: {
    tipo: v.union(v.literal("pagar"), v.literal("receber")),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const now = args.now;
    const day = 24 * 60 * 60 * 1000;

    const faixas = [
      { label: "A vencer", min: 0, max: Infinity, isOverdue: false },
      { label: "1-30 dias", min: 1, max: 30, isOverdue: true },
      { label: "31-60 dias", min: 31, max: 60, isOverdue: true },
      { label: "61-90 dias", min: 61, max: 90, isOverdue: true },
      { label: "90+ dias", min: 91, max: Infinity, isOverdue: true },
    ];

    if (args.tipo === "pagar") {
      const contas = await ctx.db.query("contasPagar").collect();
      const abertas = contas.filter(
        (c) => c.status !== "Pago" && c.status !== "Cancelado"
      );

      const resultado = faixas.map((faixa) => {
        const filtered = abertas.filter((c) => {
          const diasAtraso = Math.floor((now - c.dataVencimento) / day);
          if (!faixa.isOverdue) return diasAtraso < 0;
          return diasAtraso >= faixa.min && diasAtraso <= faixa.max;
        });
        return {
          faixa: faixa.label,
          count: filtered.length,
          total: filtered.reduce((s, c) => s + c.valor, 0),
        };
      });

      return resultado;
    } else {
      const contas = await ctx.db.query("contasReceber").collect();
      const abertas = contas.filter(
        (c) => c.status !== "Recebido" && c.status !== "Cancelado"
      );

      const resultado = faixas.map((faixa) => {
        const filtered = abertas.filter((c) => {
          const diasAtraso = Math.floor((now - c.dataVencimento) / day);
          if (!faixa.isOverdue) return diasAtraso < 0;
          return diasAtraso >= faixa.min && diasAtraso <= faixa.max;
        });
        return {
          faixa: faixa.label,
          count: filtered.length,
          total: filtered.reduce((s, c) => s + (c.valor - c.valorRecebido), 0),
        };
      });

      return resultado;
    }
  },
});

export const porCategoria = financeQuery({
  args: {
    dataInicio: v.number(),
    dataFim: v.number(),
    tipo: v.union(v.literal("despesas"), v.literal("receitas")),
  },
  handler: async (ctx, args) => {
    const categorias = await ctx.db.query("categoriasFinanceiras").collect();

    if (args.tipo === "despesas") {
      const contas = await ctx.db.query("contasPagar").collect();
      const filtradas = contas.filter(
        (c) =>
          c.status === "Pago" &&
          c.dataPagamento &&
          c.dataPagamento >= args.dataInicio &&
          c.dataPagamento <= args.dataFim
      );

      const porCat = new Map<string, { nome: string; total: number; count: number }>();
      for (const c of filtradas) {
        const catId = c.categoriaId ?? "sem-categoria";
        const cat = c.categoriaId ? categorias.find((cat) => cat._id === c.categoriaId) : null;
        const entry = porCat.get(catId) ?? {
          nome: cat?.nome ?? "Sem Categoria",
          total: 0,
          count: 0,
        };
        entry.total += c.valor;
        entry.count++;
        porCat.set(catId, entry);
      }

      const total = filtradas.reduce((s, c) => s + c.valor, 0);
      return {
        categorias: [...porCat.values()]
          .sort((a, b) => b.total - a.total)
          .map((c) => ({
            ...c,
            percentual: total > 0 ? Math.round((c.total / total) * 10000) / 100 : 0,
          })),
        total,
      };
    } else {
      const contas = await ctx.db.query("contasReceber").collect();
      const filtradas = contas.filter(
        (c) =>
          c.status === "Recebido" &&
          c.dataRecebimento &&
          c.dataRecebimento >= args.dataInicio &&
          c.dataRecebimento <= args.dataFim
      );

      const porCat = new Map<string, { nome: string; total: number; count: number }>();
      for (const c of filtradas) {
        const catId = c.categoriaId ?? "sem-categoria";
        const cat = c.categoriaId ? categorias.find((cat) => cat._id === c.categoriaId) : null;
        const entry = porCat.get(catId) ?? {
          nome: cat?.nome ?? "Sem Categoria",
          total: 0,
          count: 0,
        };
        entry.total += c.valor;
        entry.count++;
        porCat.set(catId, entry);
      }

      const total = filtradas.reduce((s, c) => s + c.valor, 0);
      return {
        categorias: [...porCat.values()]
          .sort((a, b) => b.total - a.total)
          .map((c) => ({
            ...c,
            percentual: total > 0 ? Math.round((c.total / total) * 10000) / 100 : 0,
          })),
        total,
      };
    }
  },
});
