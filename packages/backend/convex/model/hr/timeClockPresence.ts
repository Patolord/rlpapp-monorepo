/**
 * Ponto (RH): painel de presença ("agora", dia e mês) e autorização das fotos
 * das marcações. Usado por `convex/timeClock.ts`; o acesso a dados fica em
 * `timeClockDb.ts` e as regras puras, em `timeClock.ts`.
 */

import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { getUserByIdentity } from "../../lib/auth";
import { hasPermission } from "../../lib/rbac";
import {
  aggregateManDays,
  assertDateKey,
  derivePosition,
  monthRange,
  type LiveStatus,
  type PunchKind,
} from "./timeClock";
import {
  getSettings,
  listClockUsers,
  listDaysInRange,
  listGeofencedProjects,
  listPunchesForDate,
  loginOf,
  type GeofencedProject,
} from "./timeClockDb";
import type {
  timeClockDayValidator,
  timeClockLiveStatusValidator,
  timeClockMonthStatsValidator,
} from "./timeClockValidators";

export type TimeClockDay = Infer<typeof timeClockDayValidator>;
export type TimeClockLiveStatus = Infer<typeof timeClockLiveStatusValidator>;
export type TimeClockMonthStats = Infer<typeof timeClockMonthStatsValidator>;

export type TimeClockMonthInput = { year: number; month: number };

export type PunchPhotoAuthorization =
  | { status: "ok"; storageId: Id<"_storage"> }
  | { status: "unauthenticated" | "forbidden" | "not_found" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Quem aparece no dia: usuários que batem ponto (ausentes inclusive) e
 * qualquer um com marcação na data (ex.: permissão retirada depois).
 */
async function dayRoster(
  ctx: QueryCtx,
  punches: Doc<"clockPunches">[]
): Promise<Map<Id<"users">, { name: string; login: string | null }>> {
  const roster = new Map<Id<"users">, { name: string; login: string | null }>();
  for (const user of await listClockUsers(ctx)) {
    roster.set(user._id, { name: user.name, login: loginOf(user) });
  }
  for (const punch of punches) {
    if (roster.has(punch.userId)) continue;
    const user = await ctx.db.get("users", punch.userId);
    roster.set(punch.userId, { name: user?.name ?? punch.personName, login: loginOf(user) });
  }
  return roster;
}

/** Nome atual da obra (as marcações guardam o nome do momento). */
function projectNameResolver(projects: GeofencedProject[]) {
  const names = new Map(projects.map((project) => [project._id, project.name]));
  return (projectId: Id<"projects"> | undefined, fallback: string | undefined) =>
    projectId ? (names.get(projectId) ?? fallback ?? null) : null;
}

function groupByUser(punches: Doc<"clockPunches">[]) {
  const map = new Map<Id<"users">, Doc<"clockPunches">[]>();
  for (const punch of punches) {
    const list = map.get(punch.userId) ?? [];
    list.push(punch);
    map.set(punch.userId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.punchedAt - b.punchedAt);
  return map;
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------

export async function getTimeClockDay(
  ctx: QueryCtx,
  date: string
): Promise<TimeClockDay> {
  assertDateKey(date);
  const [punches, projects] = await Promise.all([
    listPunchesForDate(ctx, date),
    listGeofencedProjects(ctx),
  ]);
  const roster = await dayRoster(ctx, punches);
  const projectName = projectNameResolver(projects);
  const byUser = groupByUser(punches);
  const sortedPunches = [...punches].sort(
    (a, b) => a.punchedAt - b.punchedAt || a.sequence - b.sequence
  );

  const byKind = { entrada: 0, almoco_saida: 0, almoco_retorno: 0, saida: 0 };
  const projectStats = new Map<Id<"projects">, { people: Set<Id<"users">>; punches: number }>();
  for (const punch of sortedPunches) {
    byKind[punch.kind as PunchKind] += 1;
    if (punch.projectId && punch.geofenceStatus === "inside") {
      const stats = projectStats.get(punch.projectId) ?? { people: new Set(), punches: 0 };
      stats.people.add(punch.userId);
      stats.punches += 1;
      projectStats.set(punch.projectId, stats);
    }
  }

  const people = Array.from(roster.entries()).map(([userId, person]) => {
    const own = byUser.get(userId) ?? [];
    const first = own[0];
    const last = own[own.length - 1];
    const onSite = own.find((punch) => punch.geofenceStatus === "inside" && punch.projectId);
    const photo = own.find((punch) => punch.photoStorageId);
    return {
      userId,
      name: person.name,
      login: person.login,
      present: own.length > 0,
      firstPunchAt: first?.punchedAt ?? null,
      lastPunchAt: last?.punchedAt ?? null,
      lastKind: last?.kind ?? null,
      punchCount: own.length,
      projectId: onSite?.projectId ?? null,
      projectName: onSite ? projectName(onSite.projectId, onSite.projectName) : null,
      photoPunchId: photo?._id ?? null,
    };
  });
  people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const worksites = projects
    .map((project) => {
      const stats = projectStats.get(project._id);
      return {
        projectId: project._id,
        name: project.name,
        latitude: project.latitude,
        longitude: project.longitude,
        radiusMeters: project.radiusMeters,
        peopleCount: stats?.people.size ?? 0,
        punchCount: stats?.punches ?? 0,
      };
    })
    .sort((a, b) => b.peopleCount - a.peopleCount || a.name.localeCompare(b.name, "pt-BR"));

  const present = people.filter((person) => person.present).length;
  return {
    date,
    people,
    punches: sortedPunches.map((punch) => ({
      _id: punch._id,
      userId: punch.userId,
      personName: roster.get(punch.userId)?.name ?? punch.personName,
      punchedAt: punch.punchedAt,
      timeLabel: punch.timeLabel,
      sequence: punch.sequence,
      kind: punch.kind,
      latitude: punch.latitude ?? null,
      longitude: punch.longitude ?? null,
      hasPhoto: Boolean(punch.photoStorageId),
      projectId: punch.projectId ?? null,
      projectName: projectName(punch.projectId, punch.projectName),
      geofenceStatus: punch.geofenceStatus,
      offline: punch.offline,
    })),
    worksites,
    summary: {
      total: people.length,
      present,
      absent: people.length - present,
      punches: sortedPunches.length,
      byKind,
    },
  };
}

/**
 * "Agora": onde está cada pessoa e quem está em cada obra, a partir da última
 * marcação do dia. O cliente informa a data civil (Brasília) de hoje.
 */
export async function getTimeClockLiveStatus(
  ctx: QueryCtx,
  date: string
): Promise<TimeClockLiveStatus> {
  assertDateKey(date);
  const [punches, projects] = await Promise.all([
    listPunchesForDate(ctx, date),
    listGeofencedProjects(ctx),
  ]);
  const roster = await dayRoster(ctx, punches);
  const projectName = projectNameResolver(projects);
  const byUser = groupByUser(punches);

  const summary = { total: 0, onSite: 0, lunch: 0, left: 0, absent: 0, outsideFence: 0 };
  type BoardPerson = {
    userId: Id<"users">;
    name: string;
    status: LiveStatus;
    since: number | null;
    locationExact: boolean;
  };
  const boards = new Map<Id<"projects">, BoardPerson[]>();

  const people = Array.from(roster.entries()).map(([userId, person]) => {
    const own = byUser.get(userId) ?? [];
    const position = derivePosition(own);
    const last = position.last;
    const photo = [...own].reverse().find((punch) => punch.photoStorageId);

    summary.total += 1;
    if (position.status === "on_site") summary.onSite += 1;
    else if (position.status === "lunch") summary.lunch += 1;
    else if (position.status === "left") summary.left += 1;
    else summary.absent += 1;
    if (position.status !== "absent" && !position.locationExact) summary.outsideFence += 1;

    if (position.projectId && position.status !== "absent") {
      const list = boards.get(position.projectId) ?? [];
      list.push({
        userId,
        name: person.name,
        status: position.status,
        since: last?.punchedAt ?? null,
        locationExact: position.locationExact,
      });
      boards.set(position.projectId, list);
    }

    return {
      userId,
      name: person.name,
      login: person.login,
      status: position.status,
      since: last?.punchedAt ?? null,
      lastKind: last?.kind ?? null,
      lastTimeLabel: last?.timeLabel ?? null,
      projectId: position.projectId ?? null,
      projectName: projectName(position.projectId, position.projectName),
      locationExact: position.locationExact,
      latitude: last?.latitude ?? null,
      longitude: last?.longitude ?? null,
      photoPunchId: photo?._id ?? null,
      punches: own.map((punch) => ({
        timeLabel: punch.timeLabel,
        kind: punch.kind,
        projectName: projectName(punch.projectId, punch.projectName),
      })),
    };
  });
  people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const statusRank = { on_site: 0, lunch: 1, left: 2, absent: 3 } as const;
  const worksites = projects
    .map((project) => {
      const list = (boards.get(project._id) ?? []).sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name, "pt-BR")
      );
      return {
        projectId: project._id,
        name: project.name,
        latitude: project.latitude,
        longitude: project.longitude,
        radiusMeters: project.radiusMeters,
        onSite: list.filter((person) => person.status === "on_site").length,
        lunch: list.filter((person) => person.status === "lunch").length,
        left: list.filter((person) => person.status === "left").length,
        people: list,
      };
    })
    .sort(
      (a, b) => b.onSite - a.onSite || b.lunch - a.lunch || a.name.localeCompare(b.name, "pt-BR")
    );

  return { date, people, worksites, summary };
}

export async function getTimeClockMonthStats(
  ctx: QueryCtx,
  input: TimeClockMonthInput
): Promise<TimeClockMonthStats> {
  const range = monthRange(input.year, input.month);
  const [settings, days] = await Promise.all([
    getSettings(ctx),
    listDaysInRange(ctx, range.from, range.to),
  ]);

  // Nomes atuais de pessoas e obras (os resumos guardam os do momento).
  const userNames = new Map<Id<"users">, string>();
  const projectNames = new Map<Id<"projects">, string>();
  for (const day of days) {
    if (!userNames.has(day.userId)) {
      const user = await ctx.db.get("users", day.userId);
      userNames.set(day.userId, user?.name ?? day.personName);
    }
    if (day.projectId && !projectNames.has(day.projectId)) {
      const project = await ctx.db.get("projects", day.projectId);
      projectNames.set(day.projectId, project?.name ?? day.projectName ?? "Obra removida");
    }
  }

  const aggregate = aggregateManDays(
    days.map((day) => ({
      date: day.date,
      userId: day.userId,
      personName: userNames.get(day.userId) ?? day.personName,
      projectId: day.projectId,
      projectName: day.projectId ? projectNames.get(day.projectId) : undefined,
    }))
  );

  return {
    from: range.from,
    to: range.to,
    manDayCostCents: settings.manDayCostCents,
    totalManDays: aggregate.totalManDays,
    uniquePeople: aggregate.uniquePeople,
    uniqueWorksites: aggregate.uniqueProjects,
    byDate: aggregate.byDate,
    byPerson: aggregate.byPerson.map((row) => ({
      userId: row.userId,
      personName: row.personName,
      totalDays: row.totalDays,
      worksites: row.projects.map((item) => ({
        projectId: item.projectId ?? null,
        projectName: item.projectName ?? null,
        days: item.days,
      })),
    })),
    byWorksite: aggregate.byProject.map((row) => ({
      projectId: row.projectId ?? null,
      projectName: row.projectName ?? null,
      totalManDays: row.totalManDays,
      uniquePeople: row.uniquePeople,
      people: row.people,
    })),
  };
}

/**
 * Autoriza a foto de uma marcação para a rota HTTP `/time-clock/photo/:punchId`.
 * A permissão é conferida a cada pedido; o storage nunca expõe uma URL ao
 * cliente, então quem perde `rh.ponto.read` deixa de ver as fotos na hora.
 */
export async function authorizeTimeClockPunchPhoto(
  ctx: QueryCtx,
  rawPunchId: string
): Promise<PunchPhotoAuthorization> {
  if (!(await ctx.auth.getUserIdentity())) return { status: "unauthenticated" as const };
  const user = await getUserByIdentity(ctx);
  if (!user) return { status: "unauthenticated" as const };
  if (!user.isActive || !hasPermission(user, "rh.ponto.read")) {
    return { status: "forbidden" as const };
  }
  const punchId = ctx.db.normalizeId("clockPunches", rawPunchId);
  const punch = punchId ? await ctx.db.get("clockPunches", punchId) : null;
  if (!punch?.photoStorageId) return { status: "not_found" as const };
  return { status: "ok" as const, storageId: punch.photoStorageId };
}
