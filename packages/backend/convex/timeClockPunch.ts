/**
 * Marcação de ponto pelo app RLP.
 *
 * Quem marca é o próprio usuário autenticado, desde que tenha a permissão
 * `ponto.registrar` (liberada pelo RH em Ponto → Configurações ou pela
 * administração em Configurações → Usuários). Não há vínculo com o cadastro de
 * funcionários. O servidor atribui o horário oficial, o NSR e o hash do
 * comprovante e classifica a posição contra as cercas das obras.
 */

import { v } from "convex/values";
import { authedQuery, registrarPontoMutation } from "./lib/rbac";
import { getPunchContext, listMyPunches, registerPunch } from "./model/hr/timeClockPunch";
import { timeClockGeofenceStatus, timeClockPunchKind } from "./schema/hr";

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
  kind: timeClockPunchKind,
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
  kind: timeClockPunchKind,
  geofenceStatus: timeClockGeofenceStatus,
  worksiteName: v.union(v.string(), v.null()),
  nsr: v.number(),
  hash: v.string(),
  /** `true` quando o `clientPunchId` já existia (reenvio da fila offline). */
  duplicate: v.boolean(),
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
    allowed: v.boolean(),
    personName: v.string(),
    rules: rulesValidator,
    worksites: v.array(worksiteValidator),
    punches: v.array(punchValidator),
  }),
  handler: async (ctx, args) => await getPunchContext(ctx, ctx.user, args.date),
});

/** Histórico das marcações do usuário autenticado no período. */
export const myPunches = authedQuery({
  args: { from: v.string(), to: v.string() },
  returns: v.array(punchValidator),
  handler: async (ctx, args) =>
    await listMyPunches(ctx, ctx.user, { from: args.from, to: args.to }),
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
  },
  returns: receiptValidator,
  handler: async (ctx, args) => await registerPunch(ctx, ctx.user, args),
});
