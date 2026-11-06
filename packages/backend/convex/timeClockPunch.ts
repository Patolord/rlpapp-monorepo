/**
 * Marcação de ponto pelo app RLP.
 *
 * Quem marca é o próprio usuário autenticado, desde que tenha a permissão
 * `ponto.registrar` (liberada pelo RH em Ponto → Configurações ou pela
 * administração em Configurações → Usuários). Não há vínculo com o cadastro de
 * funcionários. O servidor atribui o horário oficial, o NSR e o hash do
 * comprovante e classifica a posição contra as cercas das obras.
 */

import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, hasPermission, registrarPontoMutation } from "./lib/rbac";
import { assertDateKey, toBrtDateKey, toBrtTimeLabel, type PunchKind } from "./model/hr/timeClock";
import {
  getPunchByClientId,
  getSettings,
  listGeofencedProjects,
  listUserDayPunches,
  nextNsr,
  recomputeDaySummary,
} from "./model/hr/timeClockDb";
import {
  MAX_CLOCK_SKEW_MS,
  PHOTO_MAX_AGE_MS,
  buildPunchHash,
  classifyGeofence,
  isDuplicatePunch,
  isPunchPhotoType,
  nextSequence,
} from "./model/hr/timeClockPunch";
import { timeClockGeofenceStatus, timeClockPunchKind } from "./schema/hr";

/** Identificador do empregador que entra no hash do comprovante. */
const EMPLOYER_ID = "RLP ENGENHARIA";
/** Marcação offline pode chegar até 7 dias depois; o horário é o do aparelho. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerância para relógio do aparelho adiantado. */
const MAX_FUTURE_MS = 5 * 60 * 1000;

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
// Helpers
// ---------------------------------------------------------------------------

async function toPunchRow(ctx: QueryCtx, punch: Doc<"clockPunches">) {
  const photoUrl = punch.photoStorageId ? await ctx.storage.getUrl(punch.photoStorageId) : null;
  return {
    _id: punch._id,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus,
    worksiteName: punch.projectName ?? null,
    latitude: punch.latitude ?? null,
    longitude: punch.longitude ?? null,
    photoUrl,
    offline: punch.offline,
    nsr: punch.nsr,
    hash: punch.hash,
  };
}

function receiptFor(punch: Doc<"clockPunches">, duplicate: boolean) {
  return {
    punchId: punch._id,
    personName: punch.personName,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punch.sequence,
    kind: punch.kind as PunchKind,
    geofenceStatus: punch.geofenceStatus,
    worksiteName: punch.projectName ?? null,
    nsr: punch.nsr,
    hash: punch.hash,
    duplicate,
  };
}

function assertCoordinate(value: number, label: string, limit: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ConvexError(`${label} inválida`);
  }
}

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
  handler: async (ctx, args) => {
    assertDateKey(args.date);
    const allowed = hasPermission(ctx.user, "ponto.registrar");
    const settings = await getSettings(ctx);
    const rules = {
      photoRequired: settings.photoRequired,
      locationRequired: settings.locationRequired,
      duplicateWindowMinutes: settings.duplicateWindowMinutes,
    };
    if (!allowed) {
      return { allowed, personName: ctx.user.name, rules, worksites: [], punches: [] };
    }
    const worksites = (await listGeofencedProjects(ctx)).map((project) => ({
      projectId: project._id,
      name: project.name,
      latitude: project.latitude,
      longitude: project.longitude,
      radiusMeters: project.radiusMeters,
    }));
    const punches = await listUserDayPunches(ctx, ctx.user._id, args.date);
    const rows = [];
    for (const punch of punches) rows.push(await toPunchRow(ctx, punch));
    return { allowed, personName: ctx.user.name, rules, worksites, punches: rows };
  },
});

/** Histórico das marcações do usuário autenticado no período. */
export const myPunches = authedQuery({
  args: { from: v.string(), to: v.string() },
  returns: v.array(punchValidator),
  handler: async (ctx, args) => {
    assertDateKey(args.from, "Data inicial");
    assertDateKey(args.to, "Data final");
    if (args.from > args.to) throw new ConvexError("Período inválido");
    const userId = ctx.user._id;
    const punches = await ctx.db
      .query("clockPunches")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", userId).gte("date", args.from).lte("date", args.to)
      )
      .order("desc")
      .take(2000);
    const rows = [];
    for (const punch of punches.sort((a, b) => b.punchedAt - a.punchedAt)) {
      rows.push(await toPunchRow(ctx, punch));
    }
    return rows;
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
  },
  returns: receiptValidator,
  handler: async (ctx, args) => {
    const user = ctx.user;

    const clientPunchId = args.clientPunchId.trim();
    if (!clientPunchId || clientPunchId.length > 100) {
      throw new ConvexError("Identificador da marcação inválido");
    }

    const existing = await getPunchByClientId(ctx, clientPunchId);
    if (existing) {
      if (existing.userId !== user._id) {
        throw new ConvexError("Identificador da marcação já utilizado");
      }
      return receiptFor(existing, true);
    }

    const settings = await getSettings(ctx);
    const now = Date.now();
    const offline = args.offline ?? false;

    // Horário oficial: o do servidor; offline, vale o do aparelho (com limites).
    if (!Number.isFinite(args.capturedAt)) {
      throw new ConvexError("Horário da marcação inválido");
    }
    if (args.capturedAt > now + MAX_FUTURE_MS) {
      throw new ConvexError("Relógio do aparelho está adiantado. Ajuste a hora e tente novamente.");
    }
    if (offline && now - args.capturedAt > MAX_OFFLINE_AGE_MS) {
      throw new ConvexError("Marcação offline antiga demais (mais de 7 dias). Fale com o RH.");
    }
    if (!offline && Math.abs(now - args.capturedAt) > MAX_CLOCK_SKEW_MS) {
      throw new ConvexError("Relógio do aparelho fora de sincronia. Ajuste a hora e tente novamente.");
    }
    const punchedAt = offline ? Math.min(args.capturedAt, now) : now;

    // Localização
    const hasPosition = args.latitude !== undefined && args.longitude !== undefined;
    if (hasPosition) {
      assertCoordinate(args.latitude!, "Latitude", 90);
      assertCoordinate(args.longitude!, "Longitude", 180);
    }
    if (settings.locationRequired && !hasPosition) {
      throw new ConvexError(
        "Não foi possível obter sua localização. Permita o acesso à localização e tente novamente."
      );
    }

    // Foto
    if (settings.photoRequired && !args.photoStorageId) {
      throw new ConvexError("Tire uma foto para registrar o ponto.");
    }
    if (args.photoStorageId) {
      const file = await ctx.db.system.get("_storage", args.photoStorageId);
      if (!file) throw new ConvexError("Foto não encontrada. Tire uma nova foto.");
      // Tipo informado no upload e diferente de JPEG/PNG/WebP (ex.: SVG) é
      // recusado. Sem tipo, a rota de entrega confere o arquivo e não o serve.
      if (file.contentType && !isPunchPhotoType(file.contentType)) {
        throw new ConvexError("Formato de foto não suportado. Tire uma nova foto.");
      }
      // A idade da foto conta do instante mais antigo conhecido: o upload
      // (autoritativo, do servidor) ou a captura informada pelo aparelho.
      const photoTakenAt = Math.min(file._creationTime, args.photoCapturedAt ?? Infinity);
      if (!offline && now - photoTakenAt > PHOTO_MAX_AGE_MS) {
        throw new ConvexError("Foto expirada, tire uma nova foto para registrar o ponto.");
      }
    }

    const date = toBrtDateKey(punchedAt);
    const dayPunches = await listUserDayPunches(ctx, user._id, date);

    // Toque repetido
    const latest = dayPunches.reduce<number | null>(
      (max, punch) => (max === null || punch.punchedAt > max ? punch.punchedAt : max),
      null
    );
    if (!offline && isDuplicatePunch(latest, punchedAt, settings.duplicateWindowMinutes)) {
      throw new ConvexError(
        `Marcação repetida: aguarde ${settings.duplicateWindowMinutes} minuto(s) para registrar novamente.`
      );
    }

    // Posição no dia (marcação offline pode ser anterior às já gravadas)
    const earlier = dayPunches.filter((punch) => punch.punchedAt <= punchedAt).length;
    const { sequence, kind } = nextSequence(earlier);

    // Cerca
    const projects = await listGeofencedProjects(ctx);
    const match = classifyGeofence(
      hasPosition ? { latitude: args.latitude!, longitude: args.longitude! } : null,
      projects
    );

    // Comprovante
    const nsr = await nextNsr(ctx);
    const hash = buildPunchHash({
      nsr,
      employerId: EMPLOYER_ID,
      personId: user._id,
      punchedAt,
    });

    const punchId = await ctx.db.insert("clockPunches", {
      userId: user._id,
      personName: user.name,
      clientPunchId,
      date,
      punchedAt,
      timeLabel: toBrtTimeLabel(punchedAt),
      sequence,
      kind,
      latitude: hasPosition ? args.latitude : undefined,
      longitude: hasPosition ? args.longitude : undefined,
      accuracyMeters: args.accuracyMeters,
      photoStorageId: args.photoStorageId,
      projectId: match.worksite?._id,
      projectName: match.worksite?.name,
      geofenceStatus: match.status,
      capturedAt: args.capturedAt,
      offline,
      deviceModel: args.deviceModel?.slice(0, 80),
      appVersion: args.appVersion?.slice(0, 40),
      nsr,
      hash,
    });

    // Marcação offline inserida "no meio" do dia: renumera as posteriores.
    if (earlier < dayPunches.length) {
      let next = sequence + 1;
      for (const punch of dayPunches.filter((item) => item.punchedAt > punchedAt)) {
        const renumbered = nextSequence(next);
        if (punch.sequence !== renumbered.sequence || punch.kind !== renumbered.kind) {
          await ctx.db.patch("clockPunches", punch._id, renumbered);
        }
        next += 1;
      }
    }

    await recomputeDaySummary(ctx, user._id, date);

    const inserted = await ctx.db.get("clockPunches", punchId);
    if (!inserted) throw new ConvexError("Falha ao gravar a marcação");
    return receiptFor(inserted, false);
  },
});
