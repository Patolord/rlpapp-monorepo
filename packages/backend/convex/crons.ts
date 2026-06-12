import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Transiciona contas com vencimento ultrapassado para "Vencido".
// Roda diariamente; as queries de dashboard também tratam atrasos em tempo
// real via timestamp do cliente, então o cron só materializa o status.
export const marcarContasVencidas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const pagarPendentes = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Pendente"))
      .collect();
    const pagarAprovadas = await ctx.db
      .query("contasPagar")
      .withIndex("by_status", (q) => q.eq("status", "Aprovado"))
      .collect();

    for (const conta of [...pagarPendentes, ...pagarAprovadas]) {
      if (conta.dataVencimento < now) {
        await ctx.db.patch("contasPagar", conta._id, {
          status: "Vencido",
          updatedAt: now,
        });
      }
    }

    const receberEmitidas = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Emitido"))
      .collect();
    const receberParciais = await ctx.db
      .query("contasReceber")
      .withIndex("by_status", (q) => q.eq("status", "Parcial"))
      .collect();

    for (const conta of [...receberEmitidas, ...receberParciais]) {
      if (conta.dataVencimento < now) {
        await ctx.db.patch("contasReceber", conta._id, {
          status: "Vencido",
          updatedAt: now,
        });
      }
    }
  },
});

const crons = cronJobs();

// 03:00 UTC = 00:00 em Brasília (UTC-3)
crons.daily(
  "marcar contas vencidas",
  { hourUTC: 3, minuteUTC: 0 },
  internal.crons.marcarContasVencidas,
  {}
);

export default crons;
