/**
 * Ponto: leitura do dia de uma pessoa (o papel de cada marcação) a partir das
 * marcações, do tratamento do RH, dos horários esquecidos informados e da
 * jornada. As regras ficam em `@rlpapp/shared/rh/pontoDay`; aqui, só o acesso
 * a dados.
 */

import {
  brtMinuteOfDay,
  classifyDay,
  DEFAULT_WORK_SCHEDULE,
  formatMinute,
  type ClassifiedDay,
  type DayItemInput,
  type PunchSlot,
  type WorkSchedule,
} from "@rlpapp/shared/rh/pontoDay";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

type Ctx = QueryCtx | MutationCtx;

// ---------------------------------------------------------------------------
// Jornada
// ---------------------------------------------------------------------------

// Cada mudança de jornada vale a partir de uma data (`clockScheduleChanges`):
// os dias anteriores continuam lidos pela jornada da época.

/** Última mudança de um escopo (pessoa ou empresa) que já vale na data. */
async function changeOn(
  ctx: Ctx,
  userId: Id<"users"> | undefined,
  date: string
): Promise<Doc<"clockScheduleChanges"> | null> {
  return await ctx.db
    .query("clockScheduleChanges")
    .withIndex("by_user_and_effective_from", (q) =>
      q.eq("userId", userId).lte("effectiveFrom", date)
    )
    .order("desc")
    .first();
}

/** Mudança mais recente de um escopo (a que vale de hoje em diante). */
async function latestChange(
  ctx: Ctx,
  userId: Id<"users"> | undefined
): Promise<Doc<"clockScheduleChanges"> | null> {
  return await ctx.db
    .query("clockScheduleChanges")
    .withIndex("by_user_and_effective_from", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
}

/**
 * Jornada da empresa na data. Antes da primeira configuração vale a primeira
 * jornada configurada (não havia outra); sem nenhuma, a padrão.
 */
export async function getCompanyScheduleOn(ctx: Ctx, date: string): Promise<WorkSchedule> {
  const change =
    (await changeOn(ctx, undefined, date)) ??
    (await ctx.db
      .query("clockScheduleChanges")
      .withIndex("by_user_and_effective_from", (q) => q.eq("userId", undefined))
      .first());
  return change?.schedule ?? { ...DEFAULT_WORK_SCHEDULE };
}

/** Jornada da empresa de hoje em diante (a editada nas Configurações). */
export async function getCurrentCompanySchedule(ctx: Ctx): Promise<WorkSchedule> {
  return (await latestChange(ctx, undefined))?.schedule ?? { ...DEFAULT_WORK_SCHEDULE };
}

/** Até quantas mudanças de jornada a lista da equipe lê de uma vez. */
const MAX_SCHEDULE_CHANGES_SCAN = 4000;

/**
 * Jornada própria atual de cada pessoa (as mudanças são raras: uma leitura
 * só). Com histórico grande demais, devolve `null` e o chamador lê por pessoa.
 */
export async function getCurrentUserSchedules(
  ctx: Ctx
): Promise<Map<Id<"users">, WorkSchedule | null> | null> {
  const rows = await ctx.db.query("clockScheduleChanges").take(MAX_SCHEDULE_CHANGES_SCAN + 1);
  if (rows.length > MAX_SCHEDULE_CHANGES_SCAN) return null;
  const latest = new Map<Id<"users">, Doc<"clockScheduleChanges">>();
  for (const row of rows) {
    if (!row.userId) continue;
    const current = latest.get(row.userId);
    if (!current || row.effectiveFrom > current.effectiveFrom) latest.set(row.userId, row);
  }
  return new Map([...latest].map(([userId, row]) => [userId, row.schedule ?? null]));
}

/** Jornada própria da pessoa de hoje em diante; `null` = a da empresa. */
export async function getCurrentUserSchedule(
  ctx: Ctx,
  userId: Id<"users">
): Promise<WorkSchedule | null> {
  return (await latestChange(ctx, userId))?.schedule ?? null;
}

/**
 * Grava uma mudança de jornada que vale a partir de `effectiveFrom` (hoje).
 * Duas mudanças no mesmo dia: a última substitui a anterior.
 */
export async function recordScheduleChange(
  ctx: MutationCtx,
  input: {
    userId?: Id<"users">;
    schedule: WorkSchedule | null;
    effectiveFrom: string;
    actorId: Id<"users">;
  }
): Promise<void> {
  const fields = {
    schedule: input.schedule ? { ...input.schedule } : undefined,
    updatedAt: Date.now(),
    updatedByUserId: input.actorId,
  };
  const sameDay = await ctx.db
    .query("clockScheduleChanges")
    .withIndex("by_user_and_effective_from", (q) =>
      q.eq("userId", input.userId).eq("effectiveFrom", input.effectiveFrom)
    )
    .first();
  if (sameDay) {
    await ctx.db.patch("clockScheduleChanges", sameDay._id, fields);
  } else {
    await ctx.db.insert("clockScheduleChanges", {
      userId: input.userId,
      effectiveFrom: input.effectiveFrom,
      ...fields,
    });
  }
}

/** Jornada de cada pessoa na data (a própria ou a da empresa), com cache por chamada. */
export function scheduleResolver(ctx: Ctx) {
  const company = new Map<string, Promise<WorkSchedule>>();
  const cache = new Map<string, Promise<WorkSchedule>>();
  return (userId: Id<"users">, date: string): Promise<WorkSchedule> => {
    const key = `${userId}|${date}`;
    let entry = cache.get(key);
    if (!entry) {
      entry = (async () => {
        const own = await changeOn(ctx, userId, date);
        if (own?.schedule) return own.schedule;
        let companyEntry = company.get(date);
        if (!companyEntry) {
          companyEntry = getCompanyScheduleOn(ctx, date);
          company.set(date, companyEntry);
        }
        return await companyEntry;
      })();
      cache.set(key, entry);
    }
    return entry;
  };
}

// ---------------------------------------------------------------------------
// Itens do dia
// ---------------------------------------------------------------------------

type EffectiveAdjustments = Map<Id<"clockPunches">, Doc<"clockPunchAdjustments">>;

/**
 * Tratamento que vale para cada marcação: o último dela (os anteriores ficam
 * no histórico). Lido por marcação, independente do tamanho do histórico.
 */
export async function effectiveAdjustments(
  ctx: Ctx,
  punches: Doc<"clockPunches">[]
): Promise<EffectiveAdjustments> {
  const effective: EffectiveAdjustments = new Map();
  for (const punch of punches) {
    const latest = await ctx.db
      .query("clockPunchAdjustments")
      .withIndex("by_punch", (q) => q.eq("punchId", punch._id))
      .order("desc")
      .first();
    if (latest) effective.set(punch._id, latest);
  }
  return effective;
}

/** Monta a entrada da leitura do dia a partir do que está no banco. */
export function buildDayItems(
  punches: Doc<"clockPunches">[],
  effective: EffectiveAdjustments,
  requests: Doc<"clockPunchRequests">[]
): DayItemInput[] {
  const items: DayItemInput[] = [];
  for (const punch of punches) {
    const adjustment = effective.get(punch._id);
    const base = { id: punch._id, minute: brtMinuteOfDay(punch.punchedAt), source: "punch" as const };
    if (adjustment?.action === "set_aside") {
      items.push({ ...base, role: "desconsiderada", basis: "rh" });
    } else if (adjustment?.action === "set_role" && adjustment.role) {
      items.push({ ...base, role: adjustment.role, basis: "rh" });
    } else if (adjustment?.action === "clear") {
      // O RH voltou a marcação à leitura automática (sem o que a pessoa informou).
      items.push(base);
    } else if (punch.declaredRole) {
      items.push({ ...base, role: punch.declaredRole, basis: "employee" });
    } else {
      items.push(base);
    }
  }
  for (const request of requests) {
    if (request.status !== "pending" && request.status !== "approved") continue;
    items.push({
      id: request._id,
      minute: request.minute,
      source: "request",
      role: request.role,
      basis: request.status,
    });
  }
  return items;
}

export async function listDayRequests(
  ctx: Ctx,
  userId: Id<"users">,
  date: string
): Promise<Doc<"clockPunchRequests">[]> {
  return await ctx.db
    .query("clockPunchRequests")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", date))
    .take(50);
}

export async function listDayAdjustments(
  ctx: Ctx,
  userId: Id<"users">,
  date: string
): Promise<Doc<"clockPunchAdjustments">[]> {
  return await ctx.db
    .query("clockPunchAdjustments")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", date))
    .take(500);
}

export type LoadedDay = {
  punches: Doc<"clockPunches">[];
  requests: Doc<"clockPunchRequests">[];
  /** Histórico do tratamento no dia (para mostrar). */
  adjustments: Doc<"clockPunchAdjustments">[];
  schedule: WorkSchedule;
  day: ClassifiedDay;
};

/**
 * Lê o dia de uma pessoa. `punches` (já carregadas, em ordem) evita reler
 * quando o chamador já as tem.
 */
export async function loadUserDay(
  ctx: Ctx,
  input: {
    userId: Id<"users">;
    date: string;
    open: boolean;
    punches: Doc<"clockPunches">[];
    schedule?: WorkSchedule;
  }
): Promise<LoadedDay> {
  const [requests, adjustments, effective, schedule] = await Promise.all([
    listDayRequests(ctx, input.userId, input.date),
    listDayAdjustments(ctx, input.userId, input.date),
    effectiveAdjustments(ctx, input.punches),
    input.schedule ?? scheduleResolver(ctx)(input.userId, input.date),
  ]);
  const day = classifyDay({
    items: buildDayItems(input.punches, effective, requests),
    schedule,
    open: input.open,
  });
  return { punches: input.punches, requests, adjustments, schedule, day };
}

/** O dia ainda está em andamento (é hoje ou depois). */
export function isOpenDate(date: string, today: string | null | undefined): boolean {
  return today !== null && today !== undefined && date >= today;
}

// ---------------------------------------------------------------------------
// Dia lido (o que o app e o painel mostram)
// ---------------------------------------------------------------------------

export type DayDetail = {
  date: string;
  open: boolean;
  /** Jornada que valia neste dia. */
  schedule: WorkSchedule;
  status: ClassifiedDay["status"];
  items: Array<{
    id: string;
    source: "punch" | "request";
    punchId: Id<"clockPunches"> | null;
    requestId: Id<"clockPunchRequests"> | null;
    minute: number;
    timeLabel: string;
    role: ClassifiedDay["items"][number]["role"];
    basis: ClassifiedDay["items"][number]["basis"];
    geofenceStatus: Doc<"clockPunches">["geofenceStatus"] | null;
    worksiteName: string | null;
    offline: boolean;
    hasPhoto: boolean;
  }>;
  /** Horários esquecidos deste dia que ficaram de fora ao marcar. */
  missedNotSent: number;
  issues: Array<{
    code: ClassifiedDay["issues"][number]["code"];
    severity: "action" | "info";
    slot: PunchSlot | null;
    itemId: string | null;
    message: string;
  }>;
};

/** Horários esquecidos que ficaram de fora e pertencem a `date` (dia da captura). */
export function missedNotSentOn(punches: Doc<"clockPunches">[], date: string): number {
  return punches.reduce(
    (sum, punch) => sum + ((punch.missedFor ?? punch.date) === date ? (punch.missedNotSent ?? 0) : 0),
    0
  );
}

/** `fromOtherDays`: horários deste dia que ficaram de fora em marcações do dia seguinte. */
export function toDayDetail(
  loaded: LoadedDay,
  date: string,
  open: boolean,
  fromOtherDays = 0
): DayDetail {
  const punches = new Map(loaded.punches.map((punch) => [punch._id as string, punch]));
  const requests = new Map(loaded.requests.map((request) => [request._id as string, request]));
  return {
    date,
    open,
    schedule: loaded.schedule,
    status: loaded.day.status,
    missedNotSent: missedNotSentOn(loaded.punches, date) + fromOtherDays,
    items: loaded.day.items.map((item) => {
      const punch = punches.get(item.id);
      const request = requests.get(item.id);
      return {
        id: item.id,
        source: item.source,
        punchId: punch?._id ?? null,
        requestId: request?._id ?? null,
        minute: item.minute,
        timeLabel: punch?.timeLabel ?? formatMinute(item.minute),
        role: item.role,
        basis: item.basis,
        geofenceStatus: punch?.geofenceStatus ?? null,
        worksiteName: punch?.projectName ?? null,
        offline: punch?.offline ?? false,
        hasPhoto: Boolean(punch?.photoStorageId),
      };
    }),
    issues: loaded.day.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      slot: issue.slot ?? null,
      itemId: issue.itemId ?? null,
      message: issue.message,
    })),
  };
}
