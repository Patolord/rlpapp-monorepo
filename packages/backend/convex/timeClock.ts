/**
 * Ponto (RH): painel de presença ("agora", dia e mês), cercas das obras, quem
 * bate ponto pelo app e regras da marcação. A marcação em si fica em
 * `timeClockPunch.ts`.
 *
 * Cada pessoa do ponto é um usuário do app com a permissão `ponto.registrar`;
 * cada local é uma obra cadastrada com cerca (`projects.geofence`).
 */

import { ConvexError, v } from "convex/values";
import { normalizePermissionOverrides, resolveRoles } from "@rlpapp/shared/auth/permissions";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit";
import { hasPermission, pontoMutation, pontoQuery } from "./lib/rbac";
import {
  aggregateManDays,
  assertDateKey,
  derivePosition,
  monthRange,
  type LiveStatus,
  type PunchKind,
} from "./lib/rh/timeClock";
import {
  getSettings,
  listClockUsers,
  listDaysInRange,
  listGeofencedProjects,
  listPunchesForDate,
  saveSettings,
  type GeofencedProject,
} from "./lib/rh/timeClockDb";
import {
  MAX_GEOFENCE_RADIUS_METERS,
  MIN_GEOFENCE_RADIUS_METERS,
} from "./lib/rh/timeClockPunch";
import { projectGeofence, timeClockGeofenceStatus, timeClockPunchKind } from "./schema";

// ---------------------------------------------------------------------------
// Validadores
// ---------------------------------------------------------------------------

const settingsValidator = v.object({
  manDayCostCents: v.number(),
  photoRequired: v.boolean(),
  locationRequired: v.boolean(),
  duplicateWindowMinutes: v.number(),
});

const liveStatusValidator = v.union(
  v.literal("on_site"),
  v.literal("lunch"),
  v.literal("left"),
  v.literal("absent")
);

const dayPersonValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  login: v.union(v.string(), v.null()),
  present: v.boolean(),
  firstPunchAt: v.union(v.number(), v.null()),
  lastPunchAt: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchKind, v.null()),
  punchCount: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  photoPunchId: v.union(v.id("clockPunches"), v.null()),
});

const dayPunchValidator = v.object({
  _id: v.id("clockPunches"),
  userId: v.id("users"),
  personName: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  hasPhoto: v.boolean(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  geofenceStatus: timeClockGeofenceStatus,
  offline: v.boolean(),
});

const dayWorksiteValidator = v.object({
  projectId: v.id("projects"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
  peopleCount: v.number(),
  punchCount: v.number(),
});

const livePersonValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  login: v.union(v.string(), v.null()),
  status: liveStatusValidator,
  /** Instante da última marcação (desde quando está nessa situação). */
  since: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchKind, v.null()),
  lastTimeLabel: v.union(v.string(), v.null()),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  locationExact: v.boolean(),
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  photoPunchId: v.union(v.id("clockPunches"), v.null()),
  punches: v.array(
    v.object({
      timeLabel: v.string(),
      kind: timeClockPunchKind,
      projectName: v.union(v.string(), v.null()),
    })
  ),
});

const liveWorksiteValidator = v.object({
  projectId: v.id("projects"),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radiusMeters: v.number(),
  onSite: v.number(),
  lunch: v.number(),
  left: v.number(),
  people: v.array(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      status: liveStatusValidator,
      since: v.union(v.number(), v.null()),
      locationExact: v.boolean(),
    })
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loginOf(user: Doc<"users"> | null | undefined): string | null {
  return user?.username ?? user?.email ?? null;
}

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

export const getDay = pontoQuery({
  args: { date: v.string() },
  returns: v.object({
    date: v.string(),
    people: v.array(dayPersonValidator),
    punches: v.array(dayPunchValidator),
    worksites: v.array(dayWorksiteValidator),
    summary: v.object({
      total: v.number(),
      present: v.number(),
      absent: v.number(),
      punches: v.number(),
      byKind: v.object({
        entrada: v.number(),
        almoco_saida: v.number(),
        almoco_retorno: v.number(),
        saida: v.number(),
      }),
    }),
  }),
  handler: async (ctx, args) => {
    assertDateKey(args.date);
    const [punches, projects] = await Promise.all([
      listPunchesForDate(ctx, args.date),
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
      date: args.date,
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
  },
});

/**
 * "Agora": onde está cada pessoa e quem está em cada obra, a partir da última
 * marcação do dia. O cliente informa a data civil (Brasília) de hoje.
 */
export const getLiveStatus = pontoQuery({
  args: { date: v.string() },
  returns: v.object({
    date: v.string(),
    people: v.array(livePersonValidator),
    worksites: v.array(liveWorksiteValidator),
    summary: v.object({
      total: v.number(),
      onSite: v.number(),
      lunch: v.number(),
      left: v.number(),
      absent: v.number(),
      outsideFence: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    assertDateKey(args.date);
    const [punches, projects] = await Promise.all([
      listPunchesForDate(ctx, args.date),
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

    return { date: args.date, people, worksites, summary };
  },
});

export const getMonthStats = pontoQuery({
  args: { year: v.number(), month: v.number() },
  returns: v.object({
    from: v.string(),
    to: v.string(),
    manDayCostCents: v.number(),
    totalManDays: v.number(),
    uniquePeople: v.number(),
    uniqueWorksites: v.number(),
    byDate: v.array(v.object({ date: v.string(), presentCount: v.number() })),
    byPerson: v.array(
      v.object({
        userId: v.id("users"),
        personName: v.string(),
        totalDays: v.number(),
        worksites: v.array(
          v.object({
            projectId: v.union(v.id("projects"), v.null()),
            projectName: v.union(v.string(), v.null()),
            days: v.number(),
          })
        ),
      })
    ),
    byWorksite: v.array(
      v.object({
        projectId: v.union(v.id("projects"), v.null()),
        projectName: v.union(v.string(), v.null()),
        totalManDays: v.number(),
        uniquePeople: v.number(),
        people: v.array(
          v.object({ userId: v.id("users"), personName: v.string(), days: v.number() })
        ),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const range = monthRange(args.year, args.month);
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
  },
});

/** URL da foto de uma marcação (sob demanda, ao abrir a foto no painel). */
export const getPunchPhotoUrl = pontoQuery({
  args: { punchId: v.id("clockPunches") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const punch = await ctx.db.get("clockPunches", args.punchId);
    if (!punch?.photoStorageId) return null;
    return await ctx.storage.getUrl(punch.photoStorageId);
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
    const projects = await ctx.db.query("projects").withIndex("by_name").take(1000);
    return projects
      .filter((project) => !project.archivedAt)
      .map((project) => ({
        projectId: project._id,
        name: project.name,
        address: project.address ?? null,
        status: project.status ?? null,
        geofence: project.geofence ?? null,
      }));
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
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new ConvexError("Obra não encontrada");
    if (project.archivedAt) throw new ConvexError("Obra arquivada");
    let geofence: Doc<"projects">["geofence"];
    if (args.geofence) {
      const { latitude, longitude, radiusMeters } = args.geofence;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
        throw new ConvexError("Latitude inválida");
      }
      if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
        throw new ConvexError("Longitude inválida");
      }
      if (
        !Number.isFinite(radiusMeters) ||
        radiusMeters < MIN_GEOFENCE_RADIUS_METERS ||
        radiusMeters > MAX_GEOFENCE_RADIUS_METERS
      ) {
        throw new ConvexError(
          `Raio inválido (de ${MIN_GEOFENCE_RADIUS_METERS} a ${MAX_GEOFENCE_RADIUS_METERS} m)`
        );
      }
      geofence = { latitude, longitude, radiusMeters: Math.round(radiusMeters) };
    }
    await ctx.db.patch("projects", project._id, { geofence });
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "projects",
      recordId: project._id,
      entityLabel: project.name,
      details: geofence ? "Cerca do ponto definida" : "Cerca do ponto removida",
      snapshotBefore: { geofence: project.geofence },
      snapshotAfter: { geofence },
    });
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
    const users = await ctx.db
      .query("users")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .take(2000);
    return users
      .filter((user) => !resolveRoles(user).includes("client"))
      .map((user) => ({
        userId: user._id,
        name: user.name,
        login: loginOf(user),
        clocksIn: hasPermission(user, "ponto.registrar"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new ConvexError("Usuário não encontrado");
    if (!user.isActive && args.enabled) throw new ConvexError("Usuário inativo");
    const before = hasPermission(user, "ponto.registrar");
    if (before === args.enabled) return null;

    const grants = (user.permissionGrants ?? []).filter((item) => item !== "ponto.registrar");
    const denials = (user.permissionDenials ?? []).filter((item) => item !== "ponto.registrar");
    if (args.enabled) grants.push("ponto.registrar");
    else denials.push("ponto.registrar");
    await ctx.db.patch(
      "users",
      user._id,
      normalizePermissionOverrides(resolveRoles(user), grants, denials)
    );
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "users",
      recordId: user._id,
      entityLabel: user.name,
      details: args.enabled ? "Marcação de ponto liberada" : "Marcação de ponto retirada",
      snapshotBefore: {
        permissionGrants: user.permissionGrants,
        permissionDenials: user.permissionDenials,
      },
      snapshotAfter: { clocksIn: args.enabled },
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export const getTimeClockSettings = pontoQuery({
  args: {},
  returns: settingsValidator,
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
    const current = await getSettings(ctx);
    const next = { ...current };
    if (args.manDayCostCents !== undefined) {
      if (!Number.isFinite(args.manDayCostCents) || args.manDayCostCents < 0) {
        throw new ConvexError("Custo do homem-dia inválido");
      }
      next.manDayCostCents = Math.round(args.manDayCostCents);
    }
    if (args.photoRequired !== undefined) next.photoRequired = args.photoRequired;
    if (args.locationRequired !== undefined) next.locationRequired = args.locationRequired;
    if (args.duplicateWindowMinutes !== undefined) {
      if (
        !Number.isFinite(args.duplicateWindowMinutes) ||
        args.duplicateWindowMinutes < 0 ||
        args.duplicateWindowMinutes > 60
      ) {
        throw new ConvexError("Janela de marcação repetida inválida (0 a 60 min)");
      }
      next.duplicateWindowMinutes = args.duplicateWindowMinutes;
    }
    await saveSettings(ctx, next, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "clockSettings",
      recordId: "default",
      entityLabel: "Ponto",
      snapshotBefore: current,
      snapshotAfter: next,
    });
    return null;
  },
});
