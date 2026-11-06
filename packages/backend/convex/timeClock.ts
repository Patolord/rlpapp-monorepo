/**
 * Ponto (RH): painel de presença ("agora", dia e mês), cercas das obras, quem
 * bate ponto pelo app e regras da marcação. A marcação em si fica em
 * `timeClockPunch.ts`; a lógica, em `model/hr/timeClockPresence.ts` e
 * `model/hr/timeClockSettings.ts`.
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
  editTimeClockSettings,
  listTimeClockPeople,
  listTimeClockWorksites,
  setProjectTimeClockGeofence,
  setUserClocksIn,
} from "./model/hr/timeClockSettings";
import {
  timeClockDayValidator,
  timeClockLiveStatusValidator,
  timeClockMonthStatsValidator,
  timeClockSettingsValidator,
} from "./model/hr/timeClockValidators";
import { projectGeofence } from "./schema/engineering";

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------

export const getDay = pontoQuery({
  args: { date: v.string() },
  returns: timeClockDayValidator,
  handler: async (ctx, args) => {
    return await getTimeClockDay(ctx, args.date);
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await editTimeClockSettings(ctx, ctx.user, args);
    return null;
  },
});
