/**
 * Marcação de ponto pelo app RLP.
 *
 * Quem marca é o próprio usuário autenticado, desde que tenha a permissão
 * `ponto.registrar` (liberada pelo RH em Ponto → Configurações ou pela
 * administração em Configurações → Usuários). Não há vínculo com o cadastro de
 * funcionários. O servidor atribui o horário oficial, o NSR e o hash do
 * comprovante e classifica a posição contra as cercas das obras. O que cada
 * marcação é (entrada, almoço, saída) vem da leitura do dia; o app manda junto
 * o que a pessoa respondeu e os horários que ela esqueceu de marcar.
 */

import { v } from "convex/values";
import { authedQuery, registrarPontoMutation } from "./lib/rbac";
import {
  getPunchContext,
  listMyDays,
  listMyPunches,
  registerPunch,
} from "./model/hr/timeClockRegister";
import { cancelMyRequest, requestMissedPunch } from "./model/hr/timeClockReview";
import { dayDetailValidator } from "./model/hr/timeClockValidators";
import {
  timeClockDeclarableRole,
  timeClockGeofenceStatus,
  timeClockPunchKind,
  timeClockPunchRole,
  timeClockRequestStatus,
  timeClockRoleBasis,
  timeClockWorkSchedule,
} from "./schema/hr";

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

const rulesValidator = v.object({
  photoRequired: v.boolean(),
  locationRequired: v.boolean(),
  duplicateWindowMinutes: v.number(),
});

const worksiteValidator = v.object({
  projectId: v.id("projects"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
});

const punchValidator = v.object({
  _id: v.id("clockPunches"),
  date: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  /** Papel na leitura do dia. */
  kind: timeClockPunchRole,
  basis: timeClockRoleBasis,
  geofenceStatus: timeClockGeofenceStatus,
  worksiteName: v.union(v.string(), v.null()),
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  offline: v.boolean(),
  nsr: v.number(),
  hash: v.string(),
});

const receiptValidator = v.object({
  punchId: v.id("clockPunches"),
  personName: v.string(),
  date: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  /** Papel na leitura do dia. */
  kind: timeClockPunchRole,
  geofenceStatus: timeClockGeofenceStatus,
  worksiteName: v.union(v.string(), v.null()),
  nsr: v.number(),
  hash: v.string(),
  /** `true` quando o `clientPunchId` já existia (reenvio da fila offline). */
  duplicate: v.boolean(),
  /** Horários esquecidos enviados junto que não conferiam e ficaram de fora. */
  missedNotSent: v.number(),
});

// ---------------------------------------------------------------------------
// API pública (qualquer usuário autenticado e ativo)
// ---------------------------------------------------------------------------

/**
 * Tudo que a tela de marcação precisa: se o usuário bate ponto, regras, cercas
 * das obras e as marcações do dia.
 */
export const getContext = authedQuery({
  args: { date: v.string() },
  returns: v.object({
    /** Dia do contexto ("YYYY-MM-DD"), para o app não misturar um cache antigo. */
    date: v.string(),
    allowed: v.boolean(),
    personName: v.string(),
    rules: rulesValidator,
    /** Jornada da pessoa (a própria ou a da empresa). */
    schedule: timeClockWorkSchedule,
    worksites: v.array(worksiteValidator),
    punches: v.array(punchValidator),
    /** Horários esquecidos já informados hoje (pendentes ou aprovados). */
    requests: v.array(
      v.object({
        _id: v.id("clockPunchRequests"),
        role: timeClockPunchRole,
        minute: v.number(),
        status: timeClockRequestStatus,
      })
    ),
  }),
  handler: async (ctx, args) => await getPunchContext(ctx, ctx.user, args.date),
});

/** Histórico das marcações do usuário autenticado no período. */
export const myPunches = authedQuery({
  args: { from: v.string(), to: v.string(), today: v.optional(v.string()) },
  returns: v.array(punchValidator),
  handler: async (ctx, args) => await listMyPunches(ctx, ctx.user, args),
});

/**
 * Dias do usuário autenticado no período, lidos: o papel de cada marcação, os
 * horários informados e o que falta. `today` é a data de hoje no aparelho.
 */
export const myDays = authedQuery({
  args: { from: v.string(), to: v.string(), today: v.string() },
  returns: v.object({ schedule: timeClockWorkSchedule, days: v.array(dayDetailValidator) }),
  handler: async (ctx, args) => await listMyDays(ctx, ctx.user, args),
});

/**
 * Informa um horário que a pessoa esqueceu de marcar. Vai para o RH aprovar;
 * até lá aparece como pendente. Um pedido pendente da mesma posição é
 * atualizado.
 */
export const requestMissed = registrarPontoMutation({
  args: {
    date: v.string(),
    role: timeClockPunchKind,
    /** Minutos desde 00:00 (Brasília). */
    minute: v.number(),
    note: v.optional(v.string()),
  },
  returns: v.id("clockPunchRequests"),
  handler: async (ctx, args) => await requestMissedPunch(ctx, ctx.user, args),
});

/** Desiste de um horário informado que o RH ainda não analisou. */
export const cancelRequest = registrarPontoMutation({
  args: { requestId: v.id("clockPunchRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cancelMyRequest(ctx, ctx.user, args.requestId);
    return null;
  },
});

/** URL de upload da foto da marcação (Convex Storage). */
export const generatePhotoUploadUrl = registrarPontoMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/**
 * Registra uma marcação. Idempotente por `clientPunchId`: reenvios da fila
 * offline devolvem o comprovante já emitido.
 */
export const register = registrarPontoMutation({
  args: {
    clientPunchId: v.string(),
    /** Relógio do aparelho no toque em "Registrar ponto". */
    capturedAt: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    accuracyMeters: v.optional(v.number()),
    photoStorageId: v.optional(v.id("_storage")),
    /** Quando a foto foi tirada (expira em 5 min). */
    photoCapturedAt: v.optional(v.number()),
    /** Marcação feita sem internet e enviada depois. */
    offline: v.optional(v.boolean()),
    deviceModel: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    /** O que a pessoa respondeu quando o app perguntou (ex.: "saio e volto"). */
    declaredRole: v.optional(timeClockDeclarableRole),
    /** Horários esquecidos informados junto (minutos desde 00:00, Brasília). */
    missed: v.optional(v.array(v.object({ role: timeClockPunchKind, minute: v.number() }))),
  },
  returns: receiptValidator,
  handler: async (ctx, args) => await registerPunch(ctx, ctx.user, args),
});
