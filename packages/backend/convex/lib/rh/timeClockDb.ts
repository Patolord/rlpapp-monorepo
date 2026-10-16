/**
 * Acesso a dados do módulo de ponto (espelho RHID). Funções puras de banco,
 * usadas pelas queries/mutations em `convex/timeClock.ts` e pela action de
 * sincronização em `convex/rhidSync.ts`.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { normalizeText } from "../compras/procurement";
import {
  normalizePersonName,
  summarizeDays,
  type NormalizedPerson,
  type NormalizedPunch,
  type NormalizedWorksite,
} from "./rhid";

type Ctx = QueryCtx | MutationCtx;

export const DEFAULT_MAN_DAY_COST_CENTS = 15_000;

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export async function getSyncState(ctx: Ctx): Promise<Doc<"rhidSyncState"> | null> {
  return await ctx.db
    .query("rhidSyncState")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
}

export async function patchSyncState(
  ctx: MutationCtx,
  patch: Partial<Omit<Doc<"rhidSyncState">, "_id" | "_creationTime" | "key">>
): Promise<void> {
  const existing = await getSyncState(ctx);
  if (existing) {
    await ctx.db.patch("rhidSyncState", existing._id, patch);
  } else {
    await ctx.db.insert("rhidSyncState", { key: "default", ...patch });
  }
}

export type TimeClockSettings = {
  manDayCostCents: number;
  trackedDepartments: string[];
};

export async function getSettings(ctx: Ctx): Promise<TimeClockSettings> {
  const doc = await ctx.db
    .query("timeClockSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  return {
    manDayCostCents: doc?.manDayCostCents ?? DEFAULT_MAN_DAY_COST_CENTS,
    trackedDepartments: doc?.trackedDepartments ?? [],
  };
}

export async function saveSettings(
  ctx: MutationCtx,
  settings: TimeClockSettings,
  userId: Id<"users">
): Promise<void> {
  const doc = await ctx.db
    .query("timeClockSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
  const payload = {
    manDayCostCents: settings.manDayCostCents,
    trackedDepartments: settings.trackedDepartments,
    updatedAt: Date.now(),
    updatedByUserId: userId,
  };
  if (doc) {
    await ctx.db.patch("timeClockSettings", doc._id, payload);
  } else {
    await ctx.db.insert("timeClockSettings", { key: "default", ...payload });
  }
}

/** Departamento entra na presença quando a lista está vazia ou o contém. */
export function isTrackedDepartment(
  trackedDepartments: string[],
  department: string | undefined
): boolean {
  if (trackedDepartments.length === 0) return true;
  if (!department) return false;
  const target = normalizeText(department);
  return trackedDepartments.some((item) => normalizeText(item) === target);
}

// ---------------------------------------------------------------------------
// Pessoas (cadastro RHID) e vínculo com funcionários
// ---------------------------------------------------------------------------

export async function getPersonByRhidId(
  ctx: Ctx,
  rhidPersonId: number
): Promise<Doc<"rhidPeople"> | null> {
  return await ctx.db
    .query("rhidPeople")
    .withIndex("by_rhid_person_id", (q) => q.eq("rhidPersonId", rhidPersonId))
    .unique();
}

/** Todas as pessoas conhecidas do RHID (cadastro pequeno: dezenas/centenas). */
export async function listPeople(ctx: Ctx): Promise<Doc<"rhidPeople">[]> {
  return await ctx.db.query("rhidPeople").take(2000);
}

export async function peopleById(
  ctx: Ctx
): Promise<Map<number, Doc<"rhidPeople">>> {
  const people = await listPeople(ctx);
  return new Map(people.map((person) => [person.rhidPersonId, person]));
}

/** Tenta casar uma pessoa do RHID com um funcionário ativo por CPF, depois por nome. */
export async function findMatchingEmployee(
  ctx: Ctx,
  person: { cpf?: string; name: string }
): Promise<Doc<"employees"> | null> {
  if (person.cpf) {
    const cpf = person.cpf;
    const byCpf = await ctx.db
      .query("employees")
      .withIndex("by_cpf_normalized", (q) => q.eq("cpfNormalized", cpf))
      .take(5);
    const match = byCpf.find((row) => !row.archivedAt);
    if (match) return match;
  }
  const nameNormalized = normalizePersonName(person.name);
  if (!nameNormalized) return null;
  const byName = await ctx.db
    .query("employees")
    .withIndex("by_name_normalized", (q) => q.eq("nameNormalized", nameNormalized))
    .take(5);
  const candidates = byName.filter((row) => !row.archivedAt);
  return candidates.length === 1 ? candidates[0]! : null;
}

export type UpsertPeopleResult = { inserted: number; updated: number; deactivated: number };

/**
 * Grava o cadastro vindo do RHID. Com `fromRoster`, quem não aparece na lista
 * é marcado como inativo. Vínculos manuais nunca são sobrescritos; vínculos
 * automáticos são recalculados (CPF, depois nome exato).
 */
export async function upsertPeople(
  ctx: MutationCtx,
  people: NormalizedPerson[],
  options: { syncedAt: number; fromRoster: boolean }
): Promise<UpsertPeopleResult> {
  const result: UpsertPeopleResult = { inserted: 0, updated: 0, deactivated: 0 };
  const seen = new Set<number>();

  for (const person of people) {
    seen.add(person.rhidPersonId);
    const existing = await getPersonByRhidId(ctx, person.rhidPersonId);
    const cpf = person.cpf ?? existing?.cpf;
    const department = person.department ?? existing?.department;

    let employeeId = existing?.employeeId;
    let linkSource = existing?.linkSource;
    if (linkSource !== "manual") {
      const match = await findMatchingEmployee(ctx, { cpf, name: person.name });
      employeeId = match?._id;
      linkSource = match ? "auto" : undefined;
    }

    if (existing) {
      await ctx.db.patch("rhidPeople", existing._id, {
        name: person.name,
        nameNormalized: normalizePersonName(person.name),
        cpf,
        department,
        active: options.fromRoster ? true : existing.active,
        employeeId,
        linkSource,
        lastSeenAt: options.syncedAt,
        updatedAt: options.syncedAt,
      });
      result.updated += 1;
    } else {
      await ctx.db.insert("rhidPeople", {
        rhidPersonId: person.rhidPersonId,
        name: person.name,
        nameNormalized: normalizePersonName(person.name),
        cpf,
        department,
        active: options.fromRoster,
        employeeId,
        linkSource,
        firstSeenAt: options.syncedAt,
        lastSeenAt: options.syncedAt,
        updatedAt: options.syncedAt,
      });
      result.inserted += 1;
    }
  }

  if (options.fromRoster) {
    const active = await ctx.db
      .query("rhidPeople")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(2000);
    for (const person of active) {
      if (seen.has(person.rhidPersonId)) continue;
      await ctx.db.patch("rhidPeople", person._id, {
        active: false,
        updatedAt: options.syncedAt,
      });
      result.deactivated += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Obras (cercas) e vínculo com projetos
// ---------------------------------------------------------------------------

export async function getWorksiteByRhidId(
  ctx: Ctx,
  rhidGeofenceId: number
): Promise<Doc<"rhidWorksites"> | null> {
  return await ctx.db
    .query("rhidWorksites")
    .withIndex("by_rhid_geofence_id", (q) => q.eq("rhidGeofenceId", rhidGeofenceId))
    .unique();
}

export async function listWorksites(ctx: Ctx): Promise<Doc<"rhidWorksites">[]> {
  return await ctx.db.query("rhidWorksites").take(1000);
}

export async function upsertWorksites(
  ctx: MutationCtx,
  worksites: NormalizedWorksite[],
  syncedAt: number
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (const worksite of worksites) {
    const existing = await getWorksiteByRhidId(ctx, worksite.rhidGeofenceId);
    if (existing) {
      await ctx.db.patch("rhidWorksites", existing._id, {
        name: worksite.name,
        latitude: worksite.latitude,
        longitude: worksite.longitude,
        radius: worksite.radius,
        lastSeenAt: syncedAt,
        updatedAt: syncedAt,
      });
      updated += 1;
    } else {
      await ctx.db.insert("rhidWorksites", {
        ...worksite,
        lastSeenAt: syncedAt,
        updatedAt: syncedAt,
      });
      inserted += 1;
    }
  }
  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Marcações e resumo diário
// ---------------------------------------------------------------------------

export async function listPunchesForDate(
  ctx: Ctx,
  date: string
): Promise<Doc<"timeClockPunches">[]> {
  return await ctx.db
    .query("timeClockPunches")
    .withIndex("by_date", (q) => q.eq("date", date))
    .take(5000);
}

export async function listDaysInRange(
  ctx: Ctx,
  from: string,
  to: string
): Promise<Doc<"timeClockDays">[]> {
  return await ctx.db
    .query("timeClockDays")
    .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
    .take(20_000);
}

export type UpsertDayResult = {
  inserted: number;
  updated: number;
  deleted: number;
  people: number;
};

/**
 * Faz do Convex um espelho fiel do RHID para um dia: insere/atualiza as
 * marcações recebidas, remove as que sumiram do RHID e recalcula o resumo
 * diário por pessoa — tudo na mesma transação.
 */
export async function replaceDayPunches(
  ctx: MutationCtx,
  date: string,
  punches: NormalizedPunch[],
  syncedAt: number
): Promise<UpsertDayResult> {
  const result: UpsertDayResult = { inserted: 0, updated: 0, deleted: 0, people: 0 };
  const incoming = punches.filter((punch) => punch.date === date);
  const incomingIds = new Set(incoming.map((punch) => punch.rhidRecordId));

  const current = await listPunchesForDate(ctx, date);
  const currentById = new Map(current.map((punch) => [punch.rhidRecordId, punch]));

  for (const punch of current) {
    if (!incomingIds.has(punch.rhidRecordId)) {
      await ctx.db.delete("timeClockPunches", punch._id);
      result.deleted += 1;
    }
  }

  for (const punch of incoming) {
    const existing = currentById.get(punch.rhidRecordId);
    const payload = {
      rhidRecordId: punch.rhidRecordId,
      rhidPersonId: punch.rhidPersonId,
      personName: punch.personName,
      date: punch.date,
      punchedAt: punch.punchedAt,
      timeLabel: punch.timeLabel,
      sequence: punch.sequence,
      kind: punch.kind,
      latitude: punch.latitude,
      longitude: punch.longitude,
      photoUrl: punch.photoUrl,
      rhidGeofenceId: punch.rhidGeofenceId,
      geofenceName: punch.geofenceName,
      syncedAt,
    };
    if (existing) {
      await ctx.db.replace("timeClockPunches", existing._id, payload);
      result.updated += 1;
    } else {
      await ctx.db.insert("timeClockPunches", payload);
      result.inserted += 1;
    }
  }

  // Resumo diário: substitui o conjunto do dia pelo recalculado.
  const summaries = summarizeDays(incoming);
  const summaryByPerson = new Map(summaries.map((item) => [item.rhidPersonId, item]));
  const existingDays = await ctx.db
    .query("timeClockDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .take(5000);
  const existingByPerson = new Map(existingDays.map((day) => [day.rhidPersonId, day]));

  for (const day of existingDays) {
    if (!summaryByPerson.has(day.rhidPersonId)) {
      await ctx.db.delete("timeClockDays", day._id);
    }
  }
  for (const summary of summaries) {
    const payload = { ...summary, syncedAt };
    const existing = existingByPerson.get(summary.rhidPersonId);
    if (existing) {
      await ctx.db.replace("timeClockDays", existing._id, payload);
    } else {
      await ctx.db.insert("timeClockDays", payload);
    }
  }
  result.people = summaries.length;
  return result;
}
