import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  engineeringOrPurchasingQuery,
  takeoffAgentMutation,
  takeoffAppQuery,
  takeoffConfigMutation,
} from "./lib/rbac";
import {
  authorizeTakeoffAgentTurn,
  authorizeTurnResultValidator,
  finishTakeoffAgentRun,
  getTakeoffAgentClientStatus,
  getTakeoffAgentDashboard,
  recordCallArgsValidator,
  recordTakeoffAgentCall,
  reportTakeoffAgentReviewStats,
  saveTakeoffAgentSettings,
  startTakeoffAgentRun,
  takeoffAgentClientStatusValidator,
  takeoffAgentDashboardValidator,
  takeoffAgentSettingsValidator,
} from "./model/procurement/takeoffAgent";
import { takeoffAgentEffort } from "./schema/procurement";

/**
 * Agente de IA integrado do RLP Takeoff: configurações da empresa, orçamentos
 * mensais, ciclo de vida das execuções e painel de uso (App Takeoff → IA).
 */

/** Estado da IA para o usuário atual do app desktop (permissão, modelo e saldo do mês). */
export const getStatus = takeoffAppQuery({
  args: {
    /** Timestamp em ms (evita ler relógio na query; usado só para escolher o mês BRT). */
    now: v.number(),
  },
  returns: takeoffAgentClientStatusValidator,
  handler: async (ctx, { now }) =>
    await getTakeoffAgentClientStatus(ctx, ctx.user, now),
});

/** Inicia uma execução do agente integrado e devolve a política em vigor. */
export const startRun = takeoffAgentMutation({
  args: {
    takeoffExternalId: v.optional(v.string()),
    takeoffName: v.optional(v.string()),
  },
  returns: v.object({
    runId: v.id("takeoffAgentRuns"),
    model: v.string(),
    effort: takeoffAgentEffort,
    maxTurnsPerRun: v.number(),
    maxTokensPerTurn: v.number(),
    promptVersion: v.string(),
    instructionsExtra: v.optional(v.string()),
  }),
  handler: async (ctx, args) => await startTakeoffAgentRun(ctx, ctx.user, args),
});

/** Marca o encerramento de uma execução (concluída, parada pelo usuário ou erro). */
export const finishRun = takeoffAgentMutation({
  args: {
    runId: v.id("takeoffAgentRuns"),
    status: v.union(
      v.literal("completed"),
      v.literal("aborted"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await finishTakeoffAgentRun(ctx, ctx.user, args);
    return null;
  },
});

/** Registra o resultado da revisão humana das sugestões desta execução. */
export const reportReviewStats = takeoffAgentMutation({
  args: {
    runId: v.id("takeoffAgentRuns"),
    pending: v.number(),
    accepted: v.number(),
    edited: v.number(),
    rejected: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reportTakeoffAgentReviewStats(ctx, ctx.user, args);
    return null;
  },
});

/** Configurações e uso mensal da IA integrada para o dashboard (App Takeoff → IA). */
export const getDashboard = engineeringOrPurchasingQuery({
  args: {
    /** Mês em Brasília ("AAAA-MM"); ausente usa o mês de `now`. */
    month: v.optional(v.string()),
    now: v.number(),
  },
  returns: takeoffAgentDashboardValidator,
  handler: async (ctx, { month, now }) =>
    await getTakeoffAgentDashboard(ctx, month, now),
});

/** Salva as configurações da IA integrada (vale imediatamente no proxy). */
export const saveSettings = takeoffConfigMutation({
  args: takeoffAgentSettingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await saveTakeoffAgentSettings(ctx, ctx.user, args);
    return null;
  },
});

/** Uso interno do proxy HTTP: valida permissão/orçamento e reserva um turno em andamento. */
export const authorizeTurn = internalMutation({
  args: {
    runId: v.optional(v.string()),
    takeoffExternalId: v.optional(v.string()),
    takeoffName: v.optional(v.string()),
  },
  returns: authorizeTurnResultValidator,
  handler: async (ctx, args) => await authorizeTakeoffAgentTurn(ctx, args),
});

/** Uso interno do proxy HTTP: grava a linha do ledger e libera o turno em andamento. */
export const recordCall = internalMutation({
  args: recordCallArgsValidator.fields,
  returns: v.number(),
  handler: async (ctx, args) => await recordTakeoffAgentCall(ctx, args),
});
