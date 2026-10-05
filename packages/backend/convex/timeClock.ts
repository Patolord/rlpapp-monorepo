/**
 * Ponto (RH): leitura do espelho RHID e vínculos com funcionários/obras.
 * A coleta em si fica em `rhidSync.ts`.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit";
import { hrMutation, hrQuery, requirePermission, requireUser } from "./lib/rbac";
import {
  aggregateManDays,
  assertDateKey,
  monthRange,
  type PunchKind,
} from "./lib/rh/rhid";
import {
  getPersonByRhidId,
  getSettings,
  getSyncState,
  getWorksiteByRhidId,
  isTrackedDepartment,
  listDaysInRange,
  listPeople,
  listPunchesForDate,
  listWorksites,
  patchSyncState,
  peopleById,
  replaceDayPunches,
  saveSettings,
  upsertPeople,
  upsertWorksites,
} from "./lib/rh/timeClockDb";
import { rhidLinkSource, rhidSyncStatus, timeClockPunchKind } from "./schema";

// ---------------------------------------------------------------------------
// Validadores compartilhados
// ---------------------------------------------------------------------------

const normalizedPunchValidator = v.object({
  rhidRecordId: v.number(),
  rhidPersonId: v.number(),
  personName: v.string(),
  date: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  photoUrl: v.optional(v.string()),
  rhidGeofenceId: v.optional(v.number()),
  geofenceName: v.optional(v.string()),
});

const normalizedPersonValidator = v.object({
  rhidPersonId: v.number(),
  name: v.string(),
  cpf: v.optional(v.string()),
  department: v.optional(v.string()),
});

const normalizedWorksiteValidator = v.object({
  rhidGeofenceId: v.number(),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radius: v.number(),
});

const employeeRefValidator = v.object({
  _id: v.id("employees"),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  code: v.union(v.string(), v.null()),
});

const personValidator = v.object({
  rhidPersonId: v.number(),
  name: v.string(),
  cpf: v.union(v.string(), v.null()),
  department: v.union(v.string(), v.null()),
  active: v.boolean(),
  tracked: v.boolean(),
  employee: v.union(employeeRefValidator, v.null()),
  linkSource: v.union(rhidLinkSource, v.null()),
  lastSeenAt: v.number(),
});

const worksiteValidator = v.object({
  rhidGeofenceId: v.number(),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radius: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  lastSeenAt: v.number(),
});

const settingsValidator = v.object({
  manDayCostCents: v.number(),
  trackedDepartments: v.array(v.string()),
});

const syncStateValidator = v.object({
  configured: v.boolean(),
  lastSyncStartedAt: v.union(v.number(), v.null()),
  lastSyncFinishedAt: v.union(v.number(), v.null()),
  lastSyncStatus: v.union(rhidSyncStatus, v.null()),
  lastSyncError: v.union(v.string(), v.null()),
  lastSyncFrom: v.union(v.string(), v.null()),
  lastSyncTo: v.union(v.string(), v.null()),
  lastSyncPunches: v.union(v.number(), v.null()),
  lastSyncPeople: v.union(v.number(), v.null()),
  lastSyncTrigger: v.union(v.literal("manual"), v.literal("cron"), v.null()),
});

const dayPersonValidator = v.object({
  rhidPersonId: v.number(),
  name: v.string(),
  department: v.union(v.string(), v.null()),
  employee: v.union(employeeRefValidator, v.null()),
  present: v.boolean(),
  firstPunchAt: v.union(v.number(), v.null()),
  lastPunchAt: v.union(v.number(), v.null()),
  lastKind: v.union(timeClockPunchKind, v.null()),
  punchCount: v.number(),
  rhidGeofenceId: v.union(v.number(), v.null()),
  worksiteName: v.union(v.string(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
});

const dayPunchValidator = v.object({
  _id: v.id("timeClockPunches"),
  rhidRecordId: v.number(),
  rhidPersonId: v.number(),
  personName: v.string(),
  punchedAt: v.number(),
  timeLabel: v.string(),
  sequence: v.number(),
  kind: timeClockPunchKind,
  latitude: v.union(v.number(), v.null()),
  longitude: v.union(v.number(), v.null()),
  photoUrl: v.union(v.string(), v.null()),
  rhidGeofenceId: v.union(v.number(), v.null()),
  geofenceName: v.union(v.string(), v.null()),
});

const dayWorksiteValidator = v.object({
  rhidGeofenceId: v.number(),
  name: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  radius: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  peopleCount: v.number(),
  punchCount: v.number(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function employeeRef(employee: Doc<"employees"> | null | undefined) {
  if (!employee) return null;
  return {
    _id: employee._id,
    name: employee.name,
    jobTitle: employee.jobTitle ?? null,
    code: employee.code ?? null,
  };
}

async function employeesByIdForPeople(
  ctx: QueryCtx,
  people: Iterable<Doc<"rhidPeople">>
): Promise<Map<Id<"employees">, Doc<"employees">>> {
  const map = new Map<Id<"employees">, Doc<"employees">>();
  for (const person of people) {
    if (!person.employeeId || map.has(person.employeeId)) continue;
    const employee = await ctx.db.get("employees", person.employeeId);
    if (employee) map.set(employee._id, employee);
  }
  return map;
}

async function projectNamesForWorksites(
  ctx: QueryCtx,
  worksites: Iterable<Doc<"rhidWorksites">>
): Promise<Map<Id<"projects">, string>> {
  const map = new Map<Id<"projects">, string>();
  for (const worksite of worksites) {
    if (!worksite.projectId || map.has(worksite.projectId)) continue;
    const project = await ctx.db.get("projects", worksite.projectId);
    if (project) map.set(project._id, project.name);
  }
  return map;
}

function isConfigured(): boolean {
  return Boolean(process.env.RHID_EMAIL && process.env.RHID_PASSWORD);
}

// ---------------------------------------------------------------------------
// Internas (usadas pela action de sincronização)
// ---------------------------------------------------------------------------

/** Lança se o chamador não puder disparar a sincronização. */
export const assertHrWriteAccess = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    requirePermission(user, "rh.write");
    return null;
  },
});

export const getSession = internalQuery({
  args: {},
  returns: v.object({
    accessToken: v.union(v.string(), v.null()),
    tokenObtainedAt: v.union(v.number(), v.null()),
    running: v.boolean(),
    lastSyncStartedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const state = await getSyncState(ctx);
    return {
      accessToken: state?.accessToken ?? null,
      tokenObtainedAt: state?.tokenObtainedAt ?? null,
      running: state?.lastSyncStatus === "running",
      lastSyncStartedAt: state?.lastSyncStartedAt ?? null,
    };
  },
});

export const storeToken = internalMutation({
  args: { accessToken: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchSyncState(ctx, {
      accessToken: args.accessToken ?? undefined,
      tokenObtainedAt: args.accessToken ? Date.now() : undefined,
    });
    return null;
  },
});

export const markSyncStarted = internalMutation({
  args: {
    from: v.string(),
    to: v.string(),
    trigger: v.union(v.literal("manual"), v.literal("cron")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchSyncState(ctx, {
      lastSyncStartedAt: Date.now(),
      lastSyncStatus: "running",
      lastSyncError: undefined,
      lastSyncFrom: args.from,
      lastSyncTo: args.to,
      lastSyncTrigger: args.trigger,
    });
    return null;
  },
});

export const markSyncFinished = internalMutation({
  args: {
    status: v.union(v.literal("success"), v.literal("error")),
    error: v.optional(v.string()),
    punches: v.optional(v.number()),
    people: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchSyncState(ctx, {
      lastSyncFinishedAt: Date.now(),
      lastSyncStatus: args.status,
      lastSyncError: args.error,
      lastSyncPunches: args.punches,
      lastSyncPeople: args.people,
    });
    return null;
  },
});

export const upsertPeopleBatch = internalMutation({
  args: {
    people: v.array(normalizedPersonValidator),
    syncedAt: v.number(),
    fromRoster: v.boolean(),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    deactivated: v.number(),
  }),
  handler: async (ctx, args) => {
    return await upsertPeople(ctx, args.people, {
      syncedAt: args.syncedAt,
      fromRoster: args.fromRoster,
    });
  },
});

export const upsertWorksitesBatch = internalMutation({
  args: {
    worksites: v.array(normalizedWorksiteValidator),
    syncedAt: v.number(),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    return await upsertWorksites(ctx, args.worksites, args.syncedAt);
  },
});

export const replaceDay = internalMutation({
  args: {
    date: v.string(),
    punches: v.array(normalizedPunchValidator),
    syncedAt: v.number(),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    deleted: v.number(),
    people: v.number(),
  }),
  handler: async (ctx, args) => {
    assertDateKey(args.date);
    return await replaceDayPunches(ctx, args.date, args.punches, args.syncedAt);
  },
});

// ---------------------------------------------------------------------------
// Públicas (RH)
// ---------------------------------------------------------------------------

export const getSyncStatus = hrQuery({
  args: {},
  returns: syncStateValidator,
  handler: async (ctx) => {
    const state = await getSyncState(ctx);
    return {
      configured: isConfigured(),
      lastSyncStartedAt: state?.lastSyncStartedAt ?? null,
      lastSyncFinishedAt: state?.lastSyncFinishedAt ?? null,
      lastSyncStatus: state?.lastSyncStatus ?? null,
      lastSyncError: state?.lastSyncError ?? null,
      lastSyncFrom: state?.lastSyncFrom ?? null,
      lastSyncTo: state?.lastSyncTo ?? null,
      lastSyncPunches: state?.lastSyncPunches ?? null,
      lastSyncPeople: state?.lastSyncPeople ?? null,
      lastSyncTrigger: state?.lastSyncTrigger ?? null,
    };
  },
});

export const getDay = hrQuery({
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
    const [settings, people, punches, worksites] = await Promise.all([
      getSettings(ctx),
      listPeople(ctx),
      listPunchesForDate(ctx, args.date),
      listWorksites(ctx),
    ]);
    const employees = await employeesByIdForPeople(ctx, people);
    const projectNames = await projectNamesForWorksites(ctx, worksites);

    const sortedPunches = [...punches].sort(
      (a, b) => a.punchedAt - b.punchedAt || a.sequence - b.sequence
    );

    type Presence = {
      first: Doc<"timeClockPunches">;
      last: Doc<"timeClockPunches">;
      count: number;
      worksite?: Doc<"timeClockPunches">;
      photo?: string;
    };
    const presence = new Map<number, Presence>();
    const byKind = { entrada: 0, almoco_saida: 0, almoco_retorno: 0, saida: 0 };
    const worksiteStats = new Map<number, { people: Set<number>; punches: number }>();

    for (const punch of sortedPunches) {
      byKind[punch.kind as PunchKind] += 1;
      const entry = presence.get(punch.rhidPersonId);
      if (!entry) {
        presence.set(punch.rhidPersonId, {
          first: punch,
          last: punch,
          count: 1,
          worksite: punch.rhidGeofenceId !== undefined ? punch : undefined,
          photo: punch.photoUrl,
        });
      } else {
        entry.last = punch;
        entry.count += 1;
        if (!entry.worksite && punch.rhidGeofenceId !== undefined) entry.worksite = punch;
        if (!entry.photo && punch.photoUrl) entry.photo = punch.photoUrl;
      }
      if (punch.rhidGeofenceId !== undefined) {
        const stats = worksiteStats.get(punch.rhidGeofenceId) ?? {
          people: new Set<number>(),
          punches: 0,
        };
        stats.people.add(punch.rhidPersonId);
        stats.punches += 1;
        worksiteStats.set(punch.rhidGeofenceId, stats);
      }
    }

    const roster = new Map<number, Doc<"rhidPeople">>();
    for (const person of people) {
      const tracked =
        person.active && isTrackedDepartment(settings.trackedDepartments, person.department);
      if (tracked || presence.has(person.rhidPersonId)) {
        roster.set(person.rhidPersonId, person);
      }
    }

    const dayPeople = [];
    for (const [rhidPersonId, entry] of presence) {
      const person = roster.get(rhidPersonId);
      dayPeople.push({
        rhidPersonId,
        name: person?.name ?? entry.first.personName,
        department: person?.department ?? null,
        employee: employeeRef(person?.employeeId ? employees.get(person.employeeId) : null),
        present: true,
        firstPunchAt: entry.first.punchedAt,
        lastPunchAt: entry.last.punchedAt,
        lastKind: entry.last.kind,
        punchCount: entry.count,
        rhidGeofenceId: entry.worksite?.rhidGeofenceId ?? null,
        worksiteName: entry.worksite?.geofenceName ?? null,
        photoUrl: entry.photo ?? null,
      });
    }
    for (const person of roster.values()) {
      if (presence.has(person.rhidPersonId)) continue;
      dayPeople.push({
        rhidPersonId: person.rhidPersonId,
        name: person.name,
        department: person.department ?? null,
        employee: employeeRef(person.employeeId ? employees.get(person.employeeId) : null),
        present: false,
        firstPunchAt: null,
        lastPunchAt: null,
        lastKind: null,
        punchCount: 0,
        rhidGeofenceId: null,
        worksiteName: null,
        photoUrl: null,
      });
    }
    dayPeople.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const dayWorksites = worksites
      .map((worksite) => {
        const stats = worksiteStats.get(worksite.rhidGeofenceId);
        return {
          rhidGeofenceId: worksite.rhidGeofenceId,
          name: worksite.name,
          latitude: worksite.latitude,
          longitude: worksite.longitude,
          radius: worksite.radius,
          projectId: worksite.projectId ?? null,
          projectName: worksite.projectId
            ? (projectNames.get(worksite.projectId) ?? null)
            : null,
          peopleCount: stats?.people.size ?? 0,
          punchCount: stats?.punches ?? 0,
        };
      })
      .sort(
        (a, b) => b.peopleCount - a.peopleCount || a.name.localeCompare(b.name, "pt-BR")
      );

    const present = presence.size;
    return {
      date: args.date,
      people: dayPeople,
      punches: sortedPunches.map((punch) => ({
        _id: punch._id,
        rhidRecordId: punch.rhidRecordId,
        rhidPersonId: punch.rhidPersonId,
        personName: punch.personName,
        punchedAt: punch.punchedAt,
        timeLabel: punch.timeLabel,
        sequence: punch.sequence,
        kind: punch.kind,
        latitude: punch.latitude ?? null,
        longitude: punch.longitude ?? null,
        photoUrl: punch.photoUrl ?? null,
        rhidGeofenceId: punch.rhidGeofenceId ?? null,
        geofenceName: punch.geofenceName ?? null,
      })),
      worksites: dayWorksites,
      summary: {
        total: dayPeople.length,
        present,
        absent: dayPeople.length - present,
        punches: sortedPunches.length,
        byKind,
      },
    };
  },
});

export const getMonthStats = hrQuery({
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
        rhidPersonId: v.number(),
        personName: v.string(),
        employee: v.union(employeeRefValidator, v.null()),
        totalDays: v.number(),
        worksites: v.array(
          v.object({
            rhidGeofenceId: v.union(v.number(), v.null()),
            worksiteName: v.union(v.string(), v.null()),
            days: v.number(),
          })
        ),
      })
    ),
    byWorksite: v.array(
      v.object({
        rhidGeofenceId: v.union(v.number(), v.null()),
        worksiteName: v.union(v.string(), v.null()),
        projectId: v.union(v.id("projects"), v.null()),
        projectName: v.union(v.string(), v.null()),
        totalManDays: v.number(),
        uniquePeople: v.number(),
        people: v.array(
          v.object({
            rhidPersonId: v.number(),
            personName: v.string(),
            days: v.number(),
          })
        ),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const range = monthRange(args.year, args.month);
    const [settings, days, people, worksites] = await Promise.all([
      getSettings(ctx),
      listDaysInRange(ctx, range.from, range.to),
      peopleById(ctx),
      listWorksites(ctx),
    ]);
    const employees = await employeesByIdForPeople(ctx, people.values());
    const projectNames = await projectNamesForWorksites(ctx, worksites);
    const worksiteById = new Map(worksites.map((w) => [w.rhidGeofenceId, w]));

    const aggregate = aggregateManDays(
      days.map((day) => ({
        date: day.date,
        rhidPersonId: day.rhidPersonId,
        personName: people.get(day.rhidPersonId)?.name ?? day.personName,
        rhidGeofenceId: day.rhidGeofenceId,
        worksiteName:
          day.rhidGeofenceId !== undefined
            ? (worksiteById.get(day.rhidGeofenceId)?.name ?? day.worksiteName)
            : day.worksiteName,
      }))
    );

    return {
      from: range.from,
      to: range.to,
      manDayCostCents: settings.manDayCostCents,
      totalManDays: aggregate.totalManDays,
      uniquePeople: aggregate.uniquePeople,
      uniqueWorksites: aggregate.uniqueWorksites,
      byDate: aggregate.byDate,
      byPerson: aggregate.byPerson.map((row) => {
        const person = people.get(row.rhidPersonId);
        return {
          rhidPersonId: row.rhidPersonId,
          personName: row.personName,
          employee: employeeRef(person?.employeeId ? employees.get(person.employeeId) : null),
          totalDays: row.totalDays,
          worksites: row.worksites.map((ws) => ({
            rhidGeofenceId: ws.rhidGeofenceId ?? null,
            worksiteName: ws.worksiteName ?? null,
            days: ws.days,
          })),
        };
      }),
      byWorksite: aggregate.byWorksite.map((row) => {
        const worksite =
          row.rhidGeofenceId !== undefined ? worksiteById.get(row.rhidGeofenceId) : undefined;
        return {
          rhidGeofenceId: row.rhidGeofenceId ?? null,
          worksiteName: row.worksiteName ?? null,
          projectId: worksite?.projectId ?? null,
          projectName: worksite?.projectId
            ? (projectNames.get(worksite.projectId) ?? null)
            : null,
          totalManDays: row.totalManDays,
          uniquePeople: row.uniquePeople,
          people: row.people,
        };
      }),
    };
  },
});

export const listRhidPeople = hrQuery({
  args: {},
  returns: v.array(personValidator),
  handler: async (ctx) => {
    const [settings, people] = await Promise.all([getSettings(ctx), listPeople(ctx)]);
    const employees = await employeesByIdForPeople(ctx, people);
    return people
      .map((person) => ({
        rhidPersonId: person.rhidPersonId,
        name: person.name,
        cpf: person.cpf ?? null,
        department: person.department ?? null,
        active: person.active,
        tracked:
          person.active &&
          isTrackedDepartment(settings.trackedDepartments, person.department),
        employee: employeeRef(person.employeeId ? employees.get(person.employeeId) : null),
        linkSource: person.linkSource ?? null,
        lastSeenAt: person.lastSeenAt,
      }))
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR")
      );
  },
});

export const linkPerson = hrMutation({
  args: {
    rhidPersonId: v.number(),
    employeeId: v.union(v.id("employees"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const person = await getPersonByRhidId(ctx, args.rhidPersonId);
    if (!person) throw new Error("Pessoa do RHID não encontrada");

    let employeeName: string | undefined;
    if (args.employeeId) {
      const employee = await ctx.db.get("employees", args.employeeId);
      if (!employee) throw new Error("Funcionário não encontrado");
      if (employee.archivedAt) {
        throw new Error("Funcionário arquivado — restaure antes de vincular");
      }
      employeeName = employee.name;
    }

    await ctx.db.patch("rhidPeople", person._id, {
      employeeId: args.employeeId ?? undefined,
      // Desvincular manualmente também é uma decisão manual: a sync não
      // volta a casar automaticamente.
      linkSource: "manual",
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: args.employeeId ? "link" : "unlink",
      tableName: "rhidPeople",
      recordId: person._id,
      entityLabel: person.name,
      details: employeeName
        ? `Vinculado ao funcionário ${employeeName}`
        : "Vínculo com funcionário removido",
      snapshotBefore: { employeeId: person.employeeId, linkSource: person.linkSource },
      snapshotAfter: { employeeId: args.employeeId, linkSource: "manual" },
    });
    return null;
  },
});

export const listRhidWorksites = hrQuery({
  args: {},
  returns: v.array(worksiteValidator),
  handler: async (ctx) => {
    const worksites = await listWorksites(ctx);
    const projectNames = await projectNamesForWorksites(ctx, worksites);
    return worksites
      .map((worksite) => ({
        rhidGeofenceId: worksite.rhidGeofenceId,
        name: worksite.name,
        latitude: worksite.latitude,
        longitude: worksite.longitude,
        radius: worksite.radius,
        projectId: worksite.projectId ?? null,
        projectName: worksite.projectId
          ? (projectNames.get(worksite.projectId) ?? null)
          : null,
        lastSeenAt: worksite.lastSeenAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
});

export const linkWorksite = hrMutation({
  args: {
    rhidGeofenceId: v.number(),
    projectId: v.union(v.id("projects"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const worksite = await getWorksiteByRhidId(ctx, args.rhidGeofenceId);
    if (!worksite) throw new Error("Obra do RHID não encontrada");
    let projectName: string | undefined;
    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project) throw new Error("Obra não encontrada");
      projectName = project.name;
    }
    await ctx.db.patch("rhidWorksites", worksite._id, {
      projectId: args.projectId ?? undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: args.projectId ? "link" : "unlink",
      tableName: "rhidWorksites",
      recordId: worksite._id,
      entityLabel: worksite.name,
      details: projectName ? `Vinculada à obra ${projectName}` : "Vínculo com obra removido",
      snapshotBefore: { projectId: worksite.projectId },
      snapshotAfter: { projectId: args.projectId },
    });
    return null;
  },
});

/** Obras do sistema para o seletor de vínculo (RH não acessa `projects.list`). */
export const listProjectOptions = hrQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      status: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").withIndex("by_name").take(1000);
    return projects
      .filter((project) => !project.archivedAt)
      .map((project) => ({
        _id: project._id,
        name: project.name,
        status: project.status ?? null,
      }));
  },
});

export const getTimeClockSettings = hrQuery({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => await getSettings(ctx),
});

export const updateTimeClockSettings = hrMutation({
  args: {
    manDayCostCents: v.optional(v.number()),
    trackedDepartments: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await getSettings(ctx);
    const next = { ...current };
    if (args.manDayCostCents !== undefined) {
      if (!Number.isFinite(args.manDayCostCents) || args.manDayCostCents < 0) {
        throw new Error("Custo do homem-dia inválido");
      }
      next.manDayCostCents = Math.round(args.manDayCostCents);
    }
    if (args.trackedDepartments !== undefined) {
      next.trackedDepartments = Array.from(
        new Set(args.trackedDepartments.map((item) => item.trim()).filter(Boolean))
      );
    }
    await saveSettings(ctx, next, ctx.user._id);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "timeClockSettings",
      recordId: "default",
      entityLabel: "Ponto (RHID)",
      snapshotBefore: current,
      snapshotAfter: next,
    });
    return null;
  },
});
