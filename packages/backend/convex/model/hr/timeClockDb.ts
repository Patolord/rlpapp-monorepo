/**
 * Acesso a dados do módulo de ponto, usado pelo painel do RH
 * (`timeClockPresence.ts` e `timeClockSettings.ts`, por trás de
 * `convex/timeClock.ts`) e por `convex/timeClockPunch.ts` (marcação pelo app).
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { summarizeDay } from "./timeClock";

type Ctx = QueryCtx | MutationCtx;

export const DEFAULT_MAN_DAY_COST_CENTS = 15_000;
/** Janela padrão para ignorar toques repetidos ("Batida repetida (min)"). */
export const DEFAULT_DUPLICATE_WINDOW_MINUTES = 1;

/** Limite de leitura por dia/período (bem acima do tamanho da equipe). */
const MAX_PUNCHES_PER_DAY = 4000;
const MAX_DAYS_PER_RANGE = 20_000;

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export type TimeClockSettings = {
  manDayCostCents: number;
  photoRequired: boolean;
  locationRequired: boolean;
  duplicateWindowMinutes: number;
};

export const DEFAULT_SETTINGS: TimeClockSettings = {
  manDayCostCents: DEFAULT_MAN_DAY_COST_CENTS,
  photoRequired: false,
  locationRequired: true,
  duplicateWindowMinutes: DEFAULT_DUPLICATE_WINDOW_MINUTES,
};

async function getSettingsDoc(ctx: Ctx): Promise<Doc<"clockSettings"> | null> {
  return await ctx.db
    .query("clockSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
}

export async function getSettings(ctx: Ctx): Promise<TimeClockSettings> {
  const doc = await getSettingsDoc(ctx);
  if (!doc) return { ...DEFAULT_SETTINGS };
  return {
    manDayCostCents: doc.manDayCostCents,
    photoRequired: doc.photoRequired,
    locationRequired: doc.locationRequired,
    duplicateWindowMinutes: doc.duplicateWindowMinutes,
  };
}

export async function saveSettings(
  ctx: MutationCtx,
  settings: TimeClockSettings,
  userId: Id<"users"> | undefined
): Promise<void> {
  const doc = await getSettingsDoc(ctx);
  const payload = { ...settings, updatedAt: Date.now(), updatedByUserId: userId };
  if (doc) {
    await ctx.db.patch("clockSettings", doc._id, payload);
  } else {
    await ctx.db.insert("clockSettings", { key: "default", ...payload });
  }
}

// ---------------------------------------------------------------------------
// Obras com cerca
// ---------------------------------------------------------------------------

export type GeofencedProject = {
  _id: Id<"projects">;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** Obras ativas (não arquivadas) com cerca do ponto definida. */
export async function listGeofencedProjects(ctx: Ctx): Promise<GeofencedProject[]> {
  const projects = await ctx.db.query("projects").withIndex("by_name").take(1000);
  const result: GeofencedProject[] = [];
  for (const project of projects) {
    if (project.archivedAt || !project.geofence) continue;
    result.push({
      _id: project._id,
      name: project.name,
      latitude: project.geofence.latitude,
      longitude: project.geofence.longitude,
      radiusMeters: project.geofence.radiusMeters,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Quem bate ponto
// ---------------------------------------------------------------------------

/** Usuários ativos com a permissão de bater ponto pelo app. */
export async function listClockUsers(ctx: Ctx): Promise<Doc<"users">[]> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .take(2000);
  return users
    .filter((user) => hasPermission(user, "ponto.registrar"))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Login exibido no painel: usuário (app) ou, na falta, e-mail. */
export function loginOf(user: Doc<"users"> | null | undefined): string | null {
  return user?.username ?? user?.email ?? null;
}

// ---------------------------------------------------------------------------
// Marcações
// ---------------------------------------------------------------------------

export async function listPunchesForDate(
  ctx: Ctx,
  date: string
): Promise<Doc<"clockPunches">[]> {
  return await ctx.db
    .query("clockPunches")
    .withIndex("by_date", (q) => q.eq("date", date))
    .take(MAX_PUNCHES_PER_DAY);
}

/** Marcações do usuário no dia, em ordem cronológica. */
export async function listUserDayPunches(
  ctx: Ctx,
  userId: Id<"users">,
  date: string
): Promise<Doc<"clockPunches">[]> {
  const punches = await ctx.db
    .query("clockPunches")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", date))
    .take(200);
  return punches.sort((a, b) => a.punchedAt - b.punchedAt || a._creationTime - b._creationTime);
}

export async function getPunchByClientId(
  ctx: Ctx,
  clientPunchId: string
): Promise<Doc<"clockPunches"> | null> {
  return await ctx.db
    .query("clockPunches")
    .withIndex("by_client_punch_id", (q) => q.eq("clientPunchId", clientPunchId))
    .first();
}

export async function nextNsr(ctx: MutationCtx): Promise<number> {
  const counter = await ctx.db
    .query("timeClockCounters")
    .withIndex("by_key", (q) => q.eq("key", "nsr"))
    .unique();
  const value = (counter?.value ?? 0) + 1;
  if (counter) {
    await ctx.db.patch("timeClockCounters", counter._id, { value });
  } else {
    await ctx.db.insert("timeClockCounters", { key: "nsr", value });
  }
  return value;
}

// ---------------------------------------------------------------------------
// Resumo diário
// ---------------------------------------------------------------------------

/**
 * Recalcula o resumo diário do usuário a partir das marcações do dia. Sem
 * marcações, remove o resumo.
 */
export async function recomputeDaySummary(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: string
): Promise<void> {
  const punches = await listUserDayPunches(ctx, userId, date);
  const existing = await ctx.db
    .query("clockDays")
    .withIndex("by_user_and_date", (q) => q.eq("userId", userId).eq("date", date))
    .first();
  const summary = summarizeDay(punches);
  if (!summary) {
    if (existing) await ctx.db.delete("clockDays", existing._id);
    return;
  }
  const last = punches[punches.length - 1]!;
  const payload = {
    date,
    userId,
    personName: last.personName,
    ...summary,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.replace("clockDays", existing._id, payload);
  } else {
    await ctx.db.insert("clockDays", payload);
  }
}

export async function listDaysInRange(
  ctx: Ctx,
  from: string,
  to: string
): Promise<Doc<"clockDays">[]> {
  return await ctx.db
    .query("clockDays")
    .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
    .take(MAX_DAYS_PER_RANGE);
}
