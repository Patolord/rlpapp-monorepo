/**
 * Marcação de ponto pelo app RLP (`convex/timeClockPunch.ts`): registro da
 * marcação, tela de marcação e histórico da própria pessoa.
 *
 * A marcação grava só o instante, o local e a foto. O que ela é (entrada,
 * almoço, saída...) vem da leitura do dia (`timeClockDay.ts`); quando o app
 * perguntou algo, a resposta vai junto (`declaredRole`) e os horários
 * esquecidos viram pedidos para o RH (`timeClockReview.ts`).
 */

import {
  brtMinuteOfDay,
  type ClassifiedItem,
  type DeclarableRole,
  type PunchSlot,
} from "@rlpapp/shared/rh/pontoDay";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { assertDateKey, toBrtDateKey, toBrtTimeLabel } from "./timeClock";
import {
  getPunchByClientId,
  getSettings,
  listGeofencedProjects,
  listUserDayPunches,
  nextNsr,
  recomputeDaySummary,
} from "./timeClockDb";
import { isOpenDate, loadUserDay, scheduleResolver, toDayDetail } from "./timeClockDay";
import {
  buildPunchHash,
  classifyGeofence,
  isDuplicatePunch,
  isPunchPhotoType,
  MAX_CLOCK_SKEW_MS,
  PHOTO_MAX_AGE_MS,
} from "./timeClockPunch";
import { clearTimeClockReminders } from "./timeClockReminders";
import { upsertMissedRequest } from "./timeClockReview";

/** Identificador do empregador que entra no hash do comprovante. */
const EMPLOYER_ID = "RLP ENGENHARIA";
/** Marcação offline pode chegar até 7 dias depois; o horário é o do aparelho. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerância para relógio do aparelho adiantado. */
const MAX_FUTURE_MS = 5 * 60 * 1000;
/** Horários esquecidos que podem ir junto com uma marcação. */
const MAX_MISSED_PER_PUNCH = 4;

async function toPunchRow(
  ctx: QueryCtx,
  punch: Doc<"clockPunches">,
  sequence: number,
  item: ClassifiedItem | undefined
) {
  const photoUrl = punch.photoStorageId ? await ctx.storage.getUrl(punch.photoStorageId) : null;
  return {
    _id: punch._id,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence,
    kind: item?.role ?? "entrada",
    basis: item?.basis ?? "auto",
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

/** Marcações do dia com o papel de cada uma na leitura do dia. */
async function punchRowsForDay(
  ctx: QueryCtx,
  loaded: Awaited<ReturnType<typeof loadUserDay>>
) {
  const items = new Map(loaded.day.items.map((item) => [item.id, item]));
  const rows = [];
  for (const [index, punch] of loaded.punches.entries()) {
    rows.push(await toPunchRow(ctx, punch, index, items.get(punch._id)));
  }
  return rows;
}

function assertCoordinate(value: number, label: string, limit: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    throw new ConvexError(`${label} inválida`);
  }
}

/**
 * Tudo que a tela de marcação precisa: se o usuário bate ponto, regras,
 * jornada, cercas das obras, as marcações do dia (com o papel de cada uma) e
 * os horários esquecidos já informados. A data é a de hoje no aparelho.
 */
export async function getPunchContext(ctx: QueryCtx, user: Doc<"users">, date: string) {
  assertDateKey(date);
  const allowed = hasPermission(user, "ponto.registrar");
  const settings = await getSettings(ctx);
  const rules = {
    photoRequired: settings.photoRequired,
    locationRequired: settings.locationRequired,
    duplicateWindowMinutes: settings.duplicateWindowMinutes,
  };
  const schedule = await scheduleResolver(ctx)(user._id);
  if (!allowed) {
    return {
      allowed,
      personName: user.name,
      rules,
      schedule,
      worksites: [],
      punches: [],
      requests: [],
    };
  }
  const worksites = (await listGeofencedProjects(ctx)).map((project) => ({
    projectId: project._id,
    name: project.name,
    latitude: project.latitude,
    longitude: project.longitude,
    radiusMeters: project.radiusMeters,
  }));
  const loaded = await loadUserDay(ctx, {
    userId: user._id,
    date,
    open: true,
    punches: await listUserDayPunches(ctx, user._id, date),
    schedule,
  });
  const items = new Map(loaded.day.items.map((item) => [item.id, item]));
  const requests = loaded.requests
    .filter((request) => request.status === "pending" || request.status === "approved")
    .map((request) => ({
      _id: request._id,
      role: items.get(request._id)?.role ?? request.role,
      minute: request.minute,
      status: request.status,
    }));
  return {
    allowed,
    personName: user.name,
    rules,
    schedule,
    worksites,
    punches: await punchRowsForDay(ctx, loaded),
    requests,
  };
}

async function listUserRange(ctx: QueryCtx, userId: Id<"users">, from: string, to: string) {
  assertDateKey(from, "Data inicial");
  assertDateKey(to, "Data final");
  if (from > to) throw new ConvexError("Período inválido");
  const punches = await ctx.db
    .query("clockPunches")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).gte("date", from).lte("date", to))
    .take(2000);
  const byDate = new Map<string, Doc<"clockPunches">[]>();
  for (const punch of punches) byDate.set(punch.date, [...(byDate.get(punch.date) ?? []), punch]);
  // Dias só com horário informado (sem marcação) também aparecem.
  const requests = await ctx.db
    .query("clockPunchRequests")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).gte("date", from).lte("date", to))
    .take(500);
  for (const request of requests) if (!byDate.has(request.date)) byDate.set(request.date, []);
  for (const list of byDate.values()) list.sort((a, b) => a.punchedAt - b.punchedAt);
  return byDate;
}

/** Histórico das marcações do usuário no período (mais recentes primeiro). */
export async function listMyPunches(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { from: string; to: string; today?: string }
) {
  const byDate = await listUserRange(ctx, user._id, input.from, input.to);
  const schedule = scheduleResolver(ctx);
  const rows = [];
  for (const [date, punches] of byDate) {
    const loaded = await loadUserDay(ctx, {
      userId: user._id,
      date,
      open: isOpenDate(date, input.today ?? input.to),
      punches,
      schedule: await schedule(user._id),
    });
    rows.push(...(await punchRowsForDay(ctx, loaded)));
  }
  return rows.sort((a, b) => b.punchedAt - a.punchedAt);
}

/** Dias do usuário no período, lidos (papéis e pendências), mais recentes primeiro. */
export async function listMyDays(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { from: string; to: string; today: string }
) {
  assertDateKey(input.today, "Data de hoje");
  const byDate = await listUserRange(ctx, user._id, input.from, input.to);
  const schedule = await scheduleResolver(ctx)(user._id);
  const days = [];
  for (const [date, punches] of byDate) {
    const open = isOpenDate(date, input.today);
    const loaded = await loadUserDay(ctx, { userId: user._id, date, open, punches, schedule });
    days.push(toDayDetail(loaded, date, open));
  }
  return { schedule, days: days.sort((a, b) => (a.date < b.date ? 1 : -1)) };
}

export type RegisterPunchInput = {
  clientPunchId: string;
  /** Relógio do aparelho no toque em "Registrar ponto". */
  capturedAt: number;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  photoStorageId?: Id<"_storage">;
  /** Quando a foto foi tirada (expira em 5 min). */
  photoCapturedAt?: number;
  /** Marcação feita sem internet e enviada depois. */
  offline?: boolean;
  deviceModel?: string;
  appVersion?: string;
  /** O que a pessoa respondeu quando o app perguntou. */
  declaredRole?: DeclarableRole;
  /** Horários esquecidos informados junto (vão para o RH). */
  missed?: Array<{ role: PunchSlot; minute: number }>;
};

/**
 * Registra uma marcação. Idempotente por `clientPunchId`: reenvios da fila
 * offline devolvem o comprovante já emitido. Nunca reescreve marcações
 * anteriores: o papel de cada uma é a leitura do dia.
 */
export async function registerPunch(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: RegisterPunchInput
) {
  const clientPunchId = input.clientPunchId.trim();
  if (!clientPunchId || clientPunchId.length > 100) {
    throw new ConvexError("Identificador da marcação inválido");
  }

  const existing = await getPunchByClientId(ctx, clientPunchId);
  if (existing) {
    if (existing.userId !== user._id) {
      throw new ConvexError("Identificador da marcação já utilizado");
    }
    return await receiptFor(ctx, existing, true);
  }

  const settings = await getSettings(ctx);
  const now = Date.now();
  const offline = input.offline ?? false;

  // Horário oficial: o do servidor; offline, vale o do aparelho (com limites).
  if (!Number.isFinite(input.capturedAt)) {
    throw new ConvexError("Horário da marcação inválido");
  }
  if (input.capturedAt > now + MAX_FUTURE_MS) {
    throw new ConvexError("Relógio do aparelho está adiantado. Ajuste a hora e tente novamente.");
  }
  if (offline && now - input.capturedAt > MAX_OFFLINE_AGE_MS) {
    throw new ConvexError("Marcação offline antiga demais (mais de 7 dias). Fale com o RH.");
  }
  if (!offline && Math.abs(now - input.capturedAt) > MAX_CLOCK_SKEW_MS) {
    throw new ConvexError("Relógio do aparelho fora de sincronia. Ajuste a hora e tente novamente.");
  }
  const punchedAt = offline ? Math.min(input.capturedAt, now) : now;
  const punchMinute = brtMinuteOfDay(punchedAt);

  // Horários esquecidos: antes desta marcação, no mesmo dia.
  const missed = input.missed ?? [];
  if (missed.length > MAX_MISSED_PER_PUNCH) {
    throw new ConvexError("Horários esquecidos demais numa marcação");
  }
  for (const item of missed) {
    if (!Number.isInteger(item.minute) || item.minute < 0 || item.minute >= punchMinute) {
      throw new ConvexError("O horário esquecido precisa ser antes desta marcação");
    }
  }

  // Localização
  const hasPosition = input.latitude !== undefined && input.longitude !== undefined;
  if (hasPosition) {
    assertCoordinate(input.latitude!, "Latitude", 90);
    assertCoordinate(input.longitude!, "Longitude", 180);
  }
  if (settings.locationRequired && !hasPosition) {
    throw new ConvexError(
      "Não foi possível obter sua localização. Permita o acesso à localização e tente novamente."
    );
  }

  // Foto
  if (settings.photoRequired && !input.photoStorageId) {
    throw new ConvexError("Tire uma foto para registrar o ponto.");
  }
  if (input.photoStorageId) {
    const file = await ctx.db.system.get("_storage", input.photoStorageId);
    if (!file) throw new ConvexError("Foto não encontrada. Tire uma nova foto.");
    // Tipo informado no upload e diferente de JPEG/PNG/WebP (ex.: SVG) é
    // recusado. Sem tipo, a rota de entrega confere o arquivo e não o serve.
    if (file.contentType && !isPunchPhotoType(file.contentType)) {
      throw new ConvexError("Formato de foto não suportado. Tire uma nova foto.");
    }
    // A idade da foto conta do instante mais antigo conhecido: o upload
    // (autoritativo, do servidor) ou a captura informada pelo aparelho.
    const photoTakenAt = Math.min(file._creationTime, input.photoCapturedAt ?? Infinity);
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

  // Cerca
  const projects = await listGeofencedProjects(ctx);
  const match = classifyGeofence(
    hasPosition ? { latitude: input.latitude!, longitude: input.longitude! } : null,
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
    declaredRole: input.declaredRole,
    latitude: hasPosition ? input.latitude : undefined,
    longitude: hasPosition ? input.longitude : undefined,
    accuracyMeters: input.accuracyMeters,
    photoStorageId: input.photoStorageId,
    projectId: match.worksite?._id,
    projectName: match.worksite?.name,
    geofenceStatus: match.status,
    capturedAt: input.capturedAt,
    offline,
    deviceModel: input.deviceModel?.slice(0, 80),
    appVersion: input.appVersion?.slice(0, 40),
    nsr,
    hash,
  });

  for (const item of missed) {
    await upsertMissedRequest(ctx, user, {
      date,
      role: item.role,
      minute: item.minute,
      origin: "app_prompt",
      clientPunchId,
    });
  }

  await recomputeDaySummary(ctx, user._id, date);
  await clearTimeClockReminders(ctx, user._id);

  const inserted = await ctx.db.get("clockPunches", punchId);
  if (!inserted) throw new ConvexError("Falha ao gravar a marcação");
  return await receiptFor(ctx, inserted, false);
}

/** Comprovante, com o papel da marcação na leitura atual do dia. */
async function receiptFor(ctx: QueryCtx, punch: Doc<"clockPunches">, duplicate: boolean) {
  const punches = await listUserDayPunches(ctx, punch.userId, punch.date);
  const loaded = await loadUserDay(ctx, {
    userId: punch.userId,
    date: punch.date,
    open: isOpenDate(punch.date, toBrtDateKey(Date.now())),
    punches,
  });
  const item = loaded.day.items.find((candidate) => candidate.id === punch._id);
  return {
    punchId: punch._id,
    personName: punch.personName,
    date: punch.date,
    punchedAt: punch.punchedAt,
    timeLabel: punch.timeLabel,
    sequence: punches.findIndex((candidate) => candidate._id === punch._id),
    kind: item?.role ?? "entrada",
    geofenceStatus: punch.geofenceStatus,
    worksiteName: punch.projectName ?? null,
    nsr: punch.nsr,
    hash: punch.hash,
    duplicate,
  };
}
