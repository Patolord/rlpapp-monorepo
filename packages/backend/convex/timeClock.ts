/**
 * Ponto (RH): painel de presença ("agora", dia e mês), tratamento das
 * marcações (horários esquecidos, papel e desconsiderar), cercas das obras,
 * quem bate ponto pelo app, jornadas e regras da marcação. A marcação em si
 * fica em `timeClockPunch.ts`; a lógica, em `model/hr/timeClockPresence.ts`,
 * `model/hr/timeClockReview.ts` e `model/hr/timeClockSettings.ts`.
 *
 * Cada pessoa do ponto é um usuário do app com a permissão `ponto.registrar`;
 * cada local é uma obra cadastrada com cerca (`projects.geofence`).
 */

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { pontoMutation, pontoQuery } from "./lib/rbac";
import { getSettings } from "./model/hr/timeClockDb";
import {
  authorizeTimeClockPunchPhoto,
  getTimeClockDay,
  getTimeClockLiveStatus,
  getTimeClockMonthStats,
} from "./model/hr/timeClockPresence";
import {
  adjustPunch as applyPunchAdjustment,
  getPersonDay as readPersonDay,
  includeMissedPunch,
  listPendingRequests,
  reviewMissedRequest,
} from "./model/hr/timeClockReview";
import {
  editTimeClockSettings,
  listTimeClockPeople,
  listTimeClockWorksites,
  setProjectTimeClockGeofence,
  setUserClocksIn,
  setUserWorkSchedule,
} from "./model/hr/timeClockSettings";
import {
  pendingRequestValidator,
  personDayValidator,
  timeClockDayValidator,
  timeClockLiveStatusValidator,
  timeClockMonthStatsValidator,
  timeClockSettingsValidator,
} from "./model/hr/timeClockValidators";
import { projectGeofence } from "./schema/engineering";
import { timeClockDeclarableRole, timeClockWorkSchedule } from "./schema/hr";

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------

/**
 * Presença do dia. `today` (a data de hoje no navegador) diz se o dia ainda
 * está em andamento: aí só conta como faltando o que já devia ter acontecido.
 */
export const getDay = pontoQuery({
  args: { date: v.string(), today: v.optional(v.string()) },
  returns: timeClockDayValidator,
  handler: async (ctx, args) => {
    return await getTimeClockDay(ctx, args.date, args.today);
  },
});

/**
 * "Agora": onde está cada pessoa e quem está em cada obra, a partir da última
 * marcação do dia. O cliente informa a data civil (Brasília) de hoje.
 */
export const getLiveStatus = pontoQuery({
  args: { date: v.string() },
  returns: timeClockLiveStatusValidator,
  handler: async (ctx, args) => {
    return await getTimeClockLiveStatus(ctx, args.date);
  },
});

export const getMonthStats = pontoQuery({
  args: { year: v.number(), month: v.number() },
  returns: timeClockMonthStatsValidator,
  handler: async (ctx, args) => {
    return await getTimeClockMonthStats(ctx, args);
  },
});

/**
 * Autoriza a foto de uma marcação para a rota HTTP `/time-clock/photo/:punchId`.
 * A permissão é conferida a cada pedido; o storage nunca expõe uma URL ao
 * cliente, então quem perde `rh.ponto.read` deixa de ver as fotos na hora.
 */
export const authorizePunchPhoto = internalQuery({
  args: { punchId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ok"), storageId: v.id("_storage") }),
    v.object({
      status: v.union(
        v.literal("unauthenticated"),
        v.literal("forbidden"),
        v.literal("not_found")
      ),
    })
  ),
  handler: async (ctx, args) => {
    return await authorizeTimeClockPunchPhoto(ctx, args.punchId);
  },
});

// ---------------------------------------------------------------------------
// Tratamento (horários esquecidos e papel das marcações)
// ---------------------------------------------------------------------------

/** Horários esquecidos informados pelas pessoas, esperando o RH. */
export const listPendingMissed = pontoQuery({
  args: {},
  returns: v.array(pendingRequestValidator),
  handler: async (ctx) => await listPendingRequests(ctx),
});

/** O dia de uma pessoa lido, com o histórico de tratamento. */
export const getPersonDay = pontoQuery({
  args: { userId: v.id("users"), date: v.string(), today: v.optional(v.string()) },
  returns: personDayValidator,
  handler: async (ctx, args) => await readPersonDay(ctx, args),
});

/** Aprova ou recusa (com motivo) um horário informado pela pessoa. */
export const reviewMissed = pontoMutation({
  args: {
    requestId: v.id("clockPunchRequests"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reviewMissedRequest(ctx, ctx.user, args);
    return null;
  },
});

/** Inclui um horário que faltou no dia de uma pessoa (com motivo). */
export const includeMissed = pontoMutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    role: timeClockDeclarableRole,
    /** Minutos desde 00:00 (Brasília). */
    minute: v.number(),
    reason: v.string(),
  },
  returns: v.id("clockPunchRequests"),
  handler: async (ctx, args) => await includeMissedPunch(ctx, ctx.user, args),
});

/**
 * Trata uma marcação: muda o papel, desconsidera ou volta à leitura
 * automática (sempre com motivo). A marcação registrada não muda.
 */
export const adjustPunch = pontoMutation({
  args: {
    punchId: v.id("clockPunches"),
    action: v.union(v.literal("set_role"), v.literal("set_aside"), v.literal("clear")),
    role: v.optional(timeClockDeclarableRole),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyPunchAdjustment(ctx, ctx.user, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Cercas das obras
// ---------------------------------------------------------------------------

/** Obras ativas e a cerca do ponto de cada uma (sem cerca: `geofence` nulo). */
export const listWorksites = pontoQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      name: v.string(),
      address: v.union(v.string(), v.null()),
      status: v.union(v.string(), v.null()),
      geofence: v.union(projectGeofence, v.null()),
    })
  ),
  handler: async (ctx) => {
    return await listTimeClockWorksites(ctx);
  },
});

/** Define (ou remove, com `geofence: null`) a cerca do ponto de uma obra. */
export const setProjectGeofence = pontoMutation({
  args: {
    projectId: v.id("projects"),
    geofence: v.union(projectGeofence, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setProjectTimeClockGeofence(ctx, ctx.user, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Quem bate ponto
// ---------------------------------------------------------------------------

/** Usuários ativos e se cada um bate ponto pelo app. */
export const listClockPeople = pontoQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      login: v.union(v.string(), v.null()),
      clocksIn: v.boolean(),
      schedule: v.union(timeClockWorkSchedule, v.null()),
    })
  ),
  handler: async (ctx) => {
    return await listTimeClockPeople(ctx);
  },
});

/**
 * Libera ou retira a marcação de ponto de um usuário. Mexe só na permissão
 * `ponto.registrar` dos ajustes individuais (os demais acessos do usuário são
 * da administração, em Configurações → Usuários).
 */
export const setClocksIn = pontoMutation({
  args: { userId: v.id("users"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setUserClocksIn(ctx, ctx.user, args);
    return null;
  },
});

/** Define (ou remove, com `schedule: null`) a jornada própria de uma pessoa. */
export const setUserSchedule = pontoMutation({
  args: { userId: v.id("users"), schedule: v.union(timeClockWorkSchedule, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setUserWorkSchedule(ctx, ctx.user, args);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export const getTimeClockSettings = pontoQuery({
  args: {},
  returns: timeClockSettingsValidator,
  handler: async (ctx) => await getSettings(ctx),
});

export const updateTimeClockSettings = pontoMutation({
  args: {
    manDayCostCents: v.optional(v.number()),
    photoRequired: v.optional(v.boolean()),
    locationRequired: v.optional(v.boolean()),
    duplicateWindowMinutes: v.optional(v.number()),
    /** Jornada padrão da empresa. */
    schedule: v.optional(timeClockWorkSchedule),
    // Lembretes por push ("HH:MM" em Brasília; `null` desliga).
    entryReminderTime: v.optional(v.union(v.string(), v.null())),
    exitReminderTime: v.optional(v.union(v.string(), v.null())),
    // Dias da semana dos lembretes (0 = domingo … 6 = sábado).
    reminderWeekdays: v.optional(v.array(v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await editTimeClockSettings(ctx, ctx.user, args);
    return null;
  },
});
