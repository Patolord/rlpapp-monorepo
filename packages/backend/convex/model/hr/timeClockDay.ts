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

export async function getCompanySchedule(ctx: Ctx): Promise<WorkSchedule> {
  const settings = await ctx.db
    .query("clockSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  return settings?.schedule ?? { ...DEFAULT_WORK_SCHEDULE };
}

export async function getUserScheduleOverride(
  ctx: Ctx,
  userId: Id<"users">
): Promise<Doc<"clockUserSchedules"> | null> {
  return await ctx.db
    .query("clockUserSchedules")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** Jornada de cada pessoa (a própria ou a da empresa), com cache por chamada. */
export function scheduleResolver(ctx: Ctx) {
  let company: Promise<WorkSchedule> | null = null;
  const cache = new Map<Id<"users">, Promise<WorkSchedule>>();
  return (userId: Id<"users">): Promise<WorkSchedule> => {
    let entry = cache.get(userId);
    if (!entry) {
      entry = (async () => {
        const own = await getUserScheduleOverride(ctx, userId);
        if (own) return own.schedule;
        company ??= getCompanySchedule(ctx);
        return await company;
      })();
      cache.set(userId, entry);
    }
    return entry;
  };
}

// ---------------------------------------------------------------------------
// Itens do dia
// ---------------------------------------------------------------------------

/** Último tratamento de cada marcação (os anteriores ficam no histórico). */
export function latestAdjustments(
  adjustments: Doc<"clockPunchAdjustments">[]
): Map<Id<"clockPunches">, Doc<"clockPunchAdjustments">> {
  const latest = new Map<Id<"clockPunches">, Doc<"clockPunchAdjustments">>();
  for (const adjustment of [...adjustments].sort((a, b) => a._creationTime - b._creationTime)) {
    latest.set(adjustment.punchId, adjustment);
  }
  return latest;
}

/** Monta a entrada da leitura do dia a partir do que está no banco. */
export function buildDayItems(
  punches: Doc<"clockPunches">[],
  adjustments: Doc<"clockPunchAdjustments">[],
  requests: Doc<"clockPunchRequests">[]
): DayItemInput[] {
  const latest = latestAdjustments(adjustments);
  const items: DayItemInput[] = [];
  for (const punch of punches) {
    const adjustment = latest.get(punch._id);
    const base = { id: punch._id, minute: brtMinuteOfDay(punch.punchedAt), source: "punch" as const };
    if (adjustment?.action === "set_aside") {
      items.push({ ...base, role: "desconsiderada", basis: "rh" });
    } else if (adjustment?.action === "set_role" && adjustment.role) {
      items.push({ ...base, role: adjustment.role, basis: "rh" });
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
  const [requests, adjustments, schedule] = await Promise.all([
    listDayRequests(ctx, input.userId, input.date),
    listDayAdjustments(ctx, input.userId, input.date),
    input.schedule ?? scheduleResolver(ctx)(input.userId),
  ]);
  const day = classifyDay({
    items: buildDayItems(input.punches, adjustments, requests),
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
  issues: Array<{
    code: ClassifiedDay["issues"][number]["code"];
    severity: "action" | "info";
    slot: PunchSlot | null;
    itemId: string | null;
    message: string;
  }>;
};

export function toDayDetail(loaded: LoadedDay, date: string, open: boolean): DayDetail {
  const punches = new Map(loaded.punches.map((punch) => [punch._id as string, punch]));
  const requests = new Map(loaded.requests.map((request) => [request._id as string, request]));
  return {
    date,
    open,
    status: loaded.day.status,
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
