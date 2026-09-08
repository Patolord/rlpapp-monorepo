import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { hrQuery, hrMutation, adminMutation, requireUser, requirePermission, hasPermission } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { activeConnection, ensureConnection, assertAttendanceDate, queueDay, dispatchNext } from "./lib/attendanceQueue";
import { DEFAULT_ATTENDANCE_SETTINGS, MAX_DAY_PUNCHES, MAX_DIRECTORY, MAX_REPORT_ROWS, departmentIncluded, employeeKey } from "./lib/attendance";
import { getBusinessDate, addBusinessDays, businessDateRange } from "./lib/rhid";
import { attendanceCounts } from "./lib/attendanceAggregate";
import { attendanceCoverage, attendancePunchFields, attendanceRunStatus, attendanceSummaryFields } from "./attendanceSchema";

const nullId = (table: "employees" | "projects" | "attendanceConnections") => v.union(v.id(table), v.null());
const paginated = (page: ReturnType<typeof v.object>) => v.object({
  page: v.array(page),
  isDone: v.boolean(),
  continueCursor: v.string(),
  pageStatus: v.optional(v.union(v.string(), v.null())),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});
const settingsValidator = v.object({
  enabled: v.boolean(), companyId: v.number(), departmentNames: v.array(v.string()),
  dailyRateCents: v.number(), credentialsConfigured: v.boolean(),
});
const dayStateValidator = v.object({
  date: v.string(),
  status: v.union(v.literal("running"), v.literal("queued"), v.literal("failed"), v.literal("ready"), v.literal("missing")),
  coverage: v.union(attendanceCoverage, v.literal("missing")),
  lastSuccessAt: v.union(v.number(), v.null()), lastAttemptAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()), warnings: v.array(v.string()), provisional: v.boolean(),
});
const punchPublicFields = {
  sourceId: attendancePunchFields.sourceId, rhidEmployeeId: attendancePunchFields.rhidEmployeeId,
  sourceName: attendancePunchFields.sourceName, occurredAt: attendancePunchFields.occurredAt,
  sourceTimestamp: attendancePunchFields.sourceTimestamp, businessDate: attendancePunchFields.businessDate,
  latitude: attendancePunchFields.latitude, longitude: attendancePunchFields.longitude,
  geofenceSourceId: attendancePunchFields.geofenceSourceId, excluded: attendancePunchFields.excluded,
  approvalStatus: attendancePunchFields.approvalStatus, rawType: attendancePunchFields.rawType,
};
const punchPageValidator = v.object({
  _id: v.id("attendancePunches"), _creationTime: v.number(),
  connectionId: v.id("attendanceConnections"), runId: v.id("attendanceSyncRuns"), attempt: v.number(),
  ...punchPublicFields, hasPhoto: v.boolean(),
});
const summaryPageValidator = v.object({
  _id: v.id("attendanceDailySummaries"), _creationTime: v.number(),
  connectionId: v.id("attendanceConnections"), runId: v.id("attendanceSyncRuns"), attempt: v.number(), date: v.string(),
  ...attendanceSummaryFields,
});
const runPageValidator = v.object({
  _id: v.id("attendanceSyncRuns"), _creationTime: v.number(),
  connectionId: v.id("attendanceConnections"), dayId: v.id("attendanceDays"), date: v.string(), generation: v.number(),
  kind: v.union(v.literal("fetch"), v.literal("rebuild")), sourceRunId: v.optional(v.id("attendanceSyncRuns")),
  sourceAttempt: v.optional(v.number()), status: attendanceRunStatus, priority: v.number(), attempt: v.number(),
  createdAt: v.number(), startedAt: v.optional(v.number()), finishedAt: v.optional(v.number()),
  workId: v.optional(v.string()), error: v.optional(v.string()), mappingRevision: v.optional(v.number()),
  stagedPunches: v.optional(v.number()), stagedSummaries: v.optional(v.number()),
  coverage: v.optional(attendanceCoverage), warnings: v.array(v.string()),
});
const mappingRowValidator = v.object({
  sourceId: v.string(), sourceName: v.string(), employeeId: nullId("employees"), projectId: nullId("projects"),
  department: v.union(v.string(), v.null()), active: v.boolean(),
});
const employeeOptionValidator = v.object({ _id: v.id("employees"), name: v.string() });
const projectOptionValidator = v.object({ _id: v.id("projects"), name: v.string() });

const credentialsConfigured = () => Boolean(env.RHID_EMAIL && env.RHID_PASSWORD);
function publicSettings(connection: Doc<"attendanceConnections"> | null) {
  return {
    enabled: connection?.enabled ?? false, companyId: connection?.companyId ?? 1,
    departmentNames: connection?.departmentNames ?? DEFAULT_ATTENDANCE_SETTINGS.departmentNames,
    dailyRateCents: connection?.dailyRateCents ?? 15_000, credentialsConfigured: credentialsConfigured(),
  };
}
async function getDay(ctx: QueryCtx, connectionId: Id<"attendanceConnections">, date: string) {
  return ctx.db.query("attendanceDays").withIndex("by_connection_and_date", q => q.eq("connectionId", connectionId).eq("date", date)).unique();
}
async function dayState(ctx: QueryCtx, day: Doc<"attendanceDays"> | null, date: string, today?: string) {
  const pending = day ? await ctx.db.query("attendanceSyncRuns").withIndex("by_day_and_status", q => q.eq("dayId", day._id).eq("status", "running")).first() ?? await ctx.db.query("attendanceSyncRuns").withIndex("by_day_and_status", q => q.eq("dayId", day._id).eq("status", "queued")).first() : null;
  const status = pending?.status === "running" ? "running" as const : pending?.status === "queued" ? "queued" as const : day?.lastError ? "failed" as const : day?.publishedRunId ? "ready" as const : "missing" as const;
  return { date, status, coverage: day?.coverage ?? "missing" as const, lastSuccessAt: day?.lastSuccessAt ?? null, lastAttemptAt: day?.lastAttemptAt ?? null, error: day?.lastError ?? null, warnings: day?.warnings ?? [], provisional: date === today };
}
async function directory(ctx: QueryCtx, connectionId: Id<"attendanceConnections">) {
  const people = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_source", q => q.eq("connectionId", connectionId)).take(MAX_DIRECTORY + 1);
  const sites = await ctx.db.query("attendanceGeofences").withIndex("by_connection_and_source", q => q.eq("connectionId", connectionId)).take(MAX_DIRECTORY + 1);
  const employees = await Promise.all(people.slice(0, MAX_DIRECTORY).map(async row => ({ ...row, name: (row.employeeId ? await ctx.db.get("employees", row.employeeId) : null)?.name ?? row.sourceName })));
  const geofences = await Promise.all(sites.slice(0, MAX_DIRECTORY).map(async row => ({ ...row, name: (row.projectId ? await ctx.db.get("projects", row.projectId) : null)?.name ?? row.sourceName })));
  return { employees, geofences, truncated: people.length > MAX_DIRECTORY || sites.length > MAX_DIRECTORY };
}

export const getSettings = hrQuery({ args: {}, returns: settingsValidator.extend({
  connectionId: nullId("attendanceConnections"), canConfigureConnection: v.boolean(),
  unmatchedEmployees: v.number(), unmatchedGeofences: v.number(), truncated: v.boolean(),
  error: v.union(v.string(), v.null()),
}), handler: async ctx => {
  const connection = await activeConnection(ctx);
  const lists = connection ? await directory(ctx, connection._id) : null;
  return { ...publicSettings(connection), connectionId: connection?._id ?? null, canConfigureConnection: hasPermission(ctx.user, "admin.manage"), unmatchedEmployees: lists?.employees.filter(e => !e.employeeId).length ?? 0, unmatchedGeofences: lists?.geofences.filter(e => !e.projectId).length ?? 0, truncated: lists?.truncated ?? false, error: connection?.lastError ?? null };
} });

export const configure = adminMutation({
  args: { enabled: v.boolean(), companyId: v.number(), departmentNames: v.array(v.string()) },
  returns: v.id("attendanceConnections"),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.companyId) || args.companyId < 1) throw new Error("Informe uma empresa RHiD válida.");
    if (args.enabled && !credentialsConfigured()) throw new Error("Configure as credenciais RHiD no servidor antes de ativar.");
    const names = [...new Set(args.departmentNames.map(s => s.trim()).filter(Boolean))];
    if (names.length > 30 || names.some(s => s.length > 100)) throw new Error("Lista de departamentos inválida.");
    let connection = await ensureConnection(ctx);
    if (connection.companyId !== args.companyId) {
      await ctx.db.patch("attendanceConnections", connection._id, { active: false, enabled: false, token: undefined, updatedAt: Date.now() });
      const id = await ctx.db.insert("attendanceConnections", { ...DEFAULT_ATTENDANCE_SETTINGS, companyId: args.companyId, active: true, createdAt: Date.now(), updatedAt: Date.now(), mappingRevision: 0 });
      connection = (await ctx.db.get("attendanceConnections", id))!;
    }
    const filterChanged = JSON.stringify(names) !== JSON.stringify(connection.departmentNames);
    await ctx.db.patch("attendanceConnections", connection._id, { enabled: args.enabled, departmentNames: names, updatedAt: Date.now(), lastError: undefined, mappingRevision: connection.mappingRevision + (filterChanged ? 1 : 0), ...(!args.enabled ? { token: undefined } : {}) });
    await logAudit(ctx, ctx.user, { action: "attendance.configure", tableName: "attendanceConnections", recordId: connection._id, details: `Empresa ${args.companyId}; sincronização ${args.enabled ? "ativada" : "desativada"}` });
    if (filterChanged) await ctx.scheduler.runAfter(0, internal.attendanceStore.rebuildMappingPage, { connectionId: connection._id, cursor: null });
    const updated = (await ctx.db.get("attendanceConnections", connection._id))!;
    if (args.enabled) { await queueDay(ctx, updated, getBusinessDate(Date.now()), 0); await dispatchNext(ctx, updated._id); }
    return connection._id;
  },
});
export const setDailyRate = hrMutation({ args: { dailyRateCents: v.number() }, returns: v.null(), handler: async (ctx, args) => {
  if (!Number.isSafeInteger(args.dailyRateCents) || args.dailyRateCents < 0 || args.dailyRateCents > 100_000_000) throw new Error("Informe um valor diário válido em centavos.");
  const connection = await ensureConnection(ctx);
  await ctx.db.patch("attendanceConnections", connection._id, { dailyRateCents: args.dailyRateCents, updatedAt: Date.now() });
  await logAudit(ctx, ctx.user, { action: "attendance.rate", tableName: "attendanceConnections", recordId: connection._id, changes: [{ field: "dailyRateCents", previousValue: String(connection.dailyRateCents), newValue: String(args.dailyRateCents) }] });
  return null;
} });
export const requestSync = hrMutation({ args: { date: v.string() }, returns: v.object({ queued: v.boolean() }), handler: async (ctx, { date }) => {
  const connection = await activeConnection(ctx);
  if (!connection?.enabled || !credentialsConfigured()) throw new Error("A conexão RHiD precisa estar configurada e ativa.");
  const queued = await queueDay(ctx, connection, date, 0);
  await dispatchNext(ctx, connection._id);
  return { queued };
} });
export const requestBackfill = hrMutation({ args: { days: v.number() }, returns: v.object({ queued: v.number() }), handler: async (ctx, { days }) => {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Selecione entre 1 e 90 dias.");
  const connection = await activeConnection(ctx);
  if (!connection?.enabled || !credentialsConfigured()) throw new Error("A conexão RHiD precisa estar configurada e ativa.");
  const today = getBusinessDate(Date.now());
  let queued = 0;
  for (let i = 0; i < days; i++) if (await queueDay(ctx, connection, addBusinessDays(today, -i), i === 0 ? 0 : 3)) queued++;
  await dispatchNext(ctx, connection._id);
  await logAudit(ctx, ctx.user, { action: "attendance.backfill", tableName: "attendanceConnections", recordId: connection._id, details: `${days} dias; ${queued} janelas agendadas` });
  return { queued };
} });

export const getDashboard = hrQuery({ args: { date: v.string(), today: v.optional(v.string()) }, returns: v.object({
  settings: settingsValidator, day: dayStateValidator,
  totals: v.object({ employees: v.number(), punched: v.number(), noPunch: v.number(), punches: v.number() }),
  employees: v.array(v.object({
    key: v.string(), employeeId: nullId("employees"), rhidEmployeeIds: v.array(v.number()), name: v.string(),
    matched: v.boolean(), hasPunch: v.boolean(), firstPunchAt: v.union(v.number(), v.null()), lastPunchAt: v.union(v.number(), v.null()),
    worksiteId: nullId("projects"), worksiteName: v.union(v.string(), v.null()),
  })),
  punches: v.array(v.object({
    _id: v.id("attendancePunches"), sourceId: v.string(), employeeKey: v.string(), rhidEmployeeId: v.number(),
    employeeName: v.string(), timestamp: v.number(), kind: v.null(), latitude: v.union(v.number(), v.null()),
    longitude: v.union(v.number(), v.null()), projectId: nullId("projects"), projectName: v.union(v.string(), v.null()),
    geofenceSourceId: v.union(v.string(), v.null()), hasPhoto: v.boolean(),
  })),
  worksites: v.array(v.object({
    key: v.string(), projectId: nullId("projects"), name: v.string(), latitude: v.union(v.number(), v.null()),
    longitude: v.union(v.number(), v.null()), radius: v.union(v.number(), v.null()), employeeCount: v.number(),
  })),
  truncated: v.boolean(),
}), handler: async (ctx, args) => {
  assertAttendanceDate(args.date);
  const connection = await activeConnection(ctx);
  const day = connection ? await getDay(ctx, connection._id, args.date) : null;
  const state = await dayState(ctx, day, args.date, args.today);
  const lists = connection ? await directory(ctx, connection._id) : { employees: [], geofences: [], truncated: false };
  const raw = day?.publishedRunId && day.publishedAttempt !== undefined ? await ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", q => q.eq("runId", day.publishedRunId!).eq("attempt", day.publishedAttempt!)).take(MAX_DAY_PUNCHES + 1) : [];
  const people = new Map(lists.employees.map(e => [e.rhidEmployeeId, e]));
  const sites = new Map(lists.geofences.map(e => [e.sourceId, e]));
  const scope = connection?.departmentNames ?? DEFAULT_ATTENDANCE_SETTINGS.departmentNames;
  const punches = raw.slice(0, MAX_DAY_PUNCHES).filter(p => !p.excluded && departmentIncluded(people.get(p.rhidEmployeeId)?.department, scope)).sort((a, b) => a.occurredAt - b.occurredAt || a.sourceId.localeCompare(b.sourceId)).map(p => {
    const person = people.get(p.rhidEmployeeId), site = p.geofenceSourceId ? sites.get(p.geofenceSourceId) : undefined;
    return { _id: p._id, sourceId: p.sourceId, employeeKey: employeeKey(p.rhidEmployeeId, person?.employeeId), rhidEmployeeId: p.rhidEmployeeId, employeeName: person?.name ?? p.sourceName, timestamp: p.occurredAt, kind: null, latitude: p.latitude ?? null, longitude: p.longitude ?? null, projectId: site?.projectId ?? null, projectName: site?.name ?? null, geofenceSourceId: p.geofenceSourceId ?? null, hasPhoto: Boolean(p.photoUrl) };
  });
  const keys = new Set([...lists.employees.filter(p => p.active && departmentIncluded(p.department, scope)).map(p => employeeKey(p.rhidEmployeeId, p.employeeId)), ...punches.map(p => p.employeeKey)]);
  const employees = [...keys].map(key => {
    const person = lists.employees.find(p => employeeKey(p.rhidEmployeeId, p.employeeId) === key);
    const events = punches.filter(p => p.employeeKey === key), first = events[0], last = events[events.length - 1];
    return { key, employeeId: person?.employeeId ?? null, rhidEmployeeIds: person ? [person.rhidEmployeeId] : first ? [first.rhidEmployeeId] : [], name: person?.name ?? first?.employeeName ?? "Funcionário RHiD", matched: Boolean(person?.employeeId), hasPunch: events.length > 0, firstPunchAt: first?.timestamp ?? null, lastPunchAt: last?.timestamp ?? null, worksiteId: last?.projectId ?? null, worksiteName: last?.projectName ?? null };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const worksites = lists.geofences.map(site => ({ key: site.sourceId, projectId: site.projectId ?? null, name: site.name, latitude: site.latitude ?? null, longitude: site.longitude ?? null, radius: site.radius ?? null, employeeCount: new Set(punches.filter(p => p.geofenceSourceId === site.sourceId).map(p => p.employeeKey)).size }));
  const punched = employees.filter(p => p.hasPunch).length;
  return { settings: publicSettings(connection), day: state, totals: { employees: employees.length, punched, noPunch: employees.length - punched, punches: punches.length }, employees, punches, worksites, truncated: lists.truncated || raw.length > MAX_DAY_PUNCHES };
} });

export const listPunches = hrQuery({ args: { date: v.string(), paginationOpts: paginationOptsValidator }, returns: paginated(punchPageValidator), handler: async (ctx, args) => {
  assertAttendanceDate(args.date);
  const connection = await activeConnection(ctx), day = connection ? await getDay(ctx, connection._id, args.date) : null;
  if (!day?.publishedRunId || day.publishedAttempt === undefined) return { page: [], isDone: true, continueCursor: "" };
  const result = await ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", q => q.eq("runId", day.publishedRunId!).eq("attempt", day.publishedAttempt!)).paginate(args.paginationOpts);
  return { ...result, page: result.page.map(({ photoUrl, ...row }) => ({ ...row, hasPhoto: Boolean(photoUrl) })) };
} });

export const getReport = hrQuery({ args: { startDate: v.string(), endDate: v.string(), today: v.optional(v.string()) }, returns: v.object({
  totalManDays: v.number(), totalCostCents: v.number(), dailyRateCents: v.number(),
  employees: v.array(v.object({ key: v.string(), employeeId: nullId("employees"), name: v.string(), days: v.number() })),
  worksites: v.array(v.object({ key: v.string(), projectId: nullId("projects"), name: v.string(), days: v.number() })),
  days: v.array(dayStateValidator), truncated: v.boolean(),
}), handler: async (ctx, args) => {
  const dates = businessDateRange(args.startDate, args.endDate);
  if (dates.length > 90) throw new Error("Selecione no máximo 90 dias por relatório.");
  const connection = await activeConnection(ctx);
  const rows: Doc<"attendanceDailySummaries">[] = [];
  const days = [];
  let totalManDays = 0, truncated = false;
  for (const date of dates) {
    const day = connection ? await getDay(ctx, connection._id, date) : null;
    days.push(await dayState(ctx, day, date, args.today));
    if (day?.publishedRunId && day.publishedAttempt !== undefined) {
      totalManDays += await attendanceCounts.count(ctx, { namespace: `${day.publishedRunId}:${day.publishedAttempt}` });
      const remaining = MAX_REPORT_ROWS - rows.length;
      if (remaining <= 0) { truncated = true; continue; }
      const batch = await ctx.db.query("attendanceDailySummaries").withIndex("by_run_and_attempt_and_employee", q => q.eq("runId", day.publishedRunId!).eq("attempt", day.publishedAttempt!)).take(remaining + 1);
      rows.push(...batch.slice(0, remaining));
      if (batch.length > remaining) truncated = true;
    }
  }
  const people = new Map<string, { key: string; employeeId: Id<"employees"> | null; name: string; days: number }>();
  const sites = new Map<string, { key: string; projectId: Id<"projects"> | null; name: string; days: number }>();
  for (const row of rows) {
    const person = people.get(row.employeeKey) ?? { key: row.employeeKey, employeeId: row.employeeId ?? null, name: row.employeeName, days: 0 }; person.days++; people.set(row.employeeKey, person);
    const key = row.projectId ?? (row.geofenceSourceId ? `rhid:${row.geofenceSourceId}` : "unknown");
    const site = sites.get(key) ?? { key, projectId: row.projectId ?? null, name: row.worksiteName ?? "Sem obra", days: 0 }; site.days++; sites.set(key, site);
  }
  const dailyRateCents = connection?.dailyRateCents ?? 15_000;
  return { totalManDays, totalCostCents: totalManDays * dailyRateCents, dailyRateCents, employees: [...people.values()].sort((a, b) => b.days - a.days), worksites: [...sites.values()].sort((a, b) => b.days - a.days), days, truncated };
} });

export const listReportDays = hrQuery({ args: { date: v.string(), paginationOpts: paginationOptsValidator }, returns: paginated(summaryPageValidator), handler: async (ctx, args) => {
  assertAttendanceDate(args.date);
  const connection = await activeConnection(ctx), day = connection ? await getDay(ctx, connection._id, args.date) : null;
  if (!day?.publishedRunId || day.publishedAttempt === undefined) return { page: [], isDone: true, continueCursor: "" };
  return ctx.db.query("attendanceDailySummaries").withIndex("by_run_and_attempt_and_employee", q => q.eq("runId", day.publishedRunId!).eq("attempt", day.publishedAttempt!)).paginate(args.paginationOpts);
} });
export const listRuns = hrQuery({ args: { paginationOpts: paginationOptsValidator }, returns: paginated(runPageValidator), handler: async (ctx, args) => {
  const connection = await activeConnection(ctx);
  if (!connection) return { page: [], isDone: true, continueCursor: "" };
  return ctx.db.query("attendanceSyncRuns").withIndex("by_connection_and_createdAt", q => q.eq("connectionId", connection._id)).order("desc").paginate(args.paginationOpts);
} });
export const listMappings = hrQuery({ args: { kind: v.union(v.literal("employees"), v.literal("geofences")), paginationOpts: paginationOptsValidator }, returns: paginated(mappingRowValidator), handler: async (ctx, args) => {
  const connection = await activeConnection(ctx);
  if (!connection) return { page: [], isDone: true, continueCursor: "" };
  if (args.kind === "employees") {
    const result = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_source", q => q.eq("connectionId", connection._id)).paginate(args.paginationOpts);
    return { ...result, page: result.page.map(row => ({ sourceId: row.sourceId, sourceName: row.sourceName, employeeId: row.employeeId ?? null, projectId: null, department: row.department ?? null, active: row.active })) };
  }
  const result = await ctx.db.query("attendanceGeofences").withIndex("by_connection_and_source", q => q.eq("connectionId", connection._id)).paginate(args.paginationOpts);
  return { ...result, page: result.page.map(row => ({ sourceId: row.sourceId, sourceName: row.sourceName, employeeId: null, projectId: row.projectId ?? null, department: null, active: !row.excluded })) };
} });

async function changedMapping(ctx: MutationCtx, connection: Doc<"attendanceConnections">) {
  await ctx.db.patch("attendanceConnections", connection._id, { mappingRevision: connection.mappingRevision + 1, updatedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.attendanceStore.rebuildMappingPage, { connectionId: connection._id, cursor: null });
}
export const linkEmployee = hrMutation({ args: { sourceId: v.string(), employeeId: v.union(v.id("employees"), v.null()) }, returns: v.null(), handler: async (ctx, args) => {
  const connection = await activeConnection(ctx);
  if (!connection) throw new Error("Configure a conexão primeiro.");
  const source = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_source", q => q.eq("connectionId", connection._id).eq("sourceId", args.sourceId)).unique();
  if (!source) throw new Error("Funcionário RHiD não encontrado.");
  if (args.employeeId) {
    const person = await ctx.db.get("employees", args.employeeId);
    if (!person || person.archivedAt) throw new Error("Funcionário indisponível.");
    const existing = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_employee", q => q.eq("connectionId", connection._id).eq("employeeId", args.employeeId!)).first();
    if (existing && existing._id !== source._id) throw new Error("Este funcionário já está vinculado a outra identidade RHiD.");
  }
  await ctx.db.patch("attendanceEmployees", source._id, { employeeId: args.employeeId ?? undefined, updatedAt: Date.now() });
  await changedMapping(ctx, connection);
  await logAudit(ctx, ctx.user, { action: "attendance.linkEmployee", tableName: "attendanceEmployees", recordId: source._id, changes: [{ field: "employeeId", previousValue: source.employeeId, newValue: args.employeeId ?? undefined }] });
  return null;
} });
export const linkGeofence = hrMutation({ args: { sourceId: v.string(), projectId: v.union(v.id("projects"), v.null()) }, returns: v.null(), handler: async (ctx, args) => {
  const connection = await activeConnection(ctx);
  if (!connection) throw new Error("Configure a conexão primeiro.");
  const source = await ctx.db.query("attendanceGeofences").withIndex("by_connection_and_source", q => q.eq("connectionId", connection._id).eq("sourceId", args.sourceId)).unique();
  if (!source) throw new Error("Local RHiD não encontrado.");
  if (args.projectId && !await ctx.db.get("projects", args.projectId)) throw new Error("Obra não encontrada.");
  await ctx.db.patch("attendanceGeofences", source._id, { projectId: args.projectId ?? undefined, updatedAt: Date.now() });
  await changedMapping(ctx, connection);
  await logAudit(ctx, ctx.user, { action: "attendance.linkGeofence", tableName: "attendanceGeofences", recordId: source._id, changes: [{ field: "projectId", previousValue: source.projectId, newValue: args.projectId ?? undefined }] });
  return null;
} });
export const employeeOptions = hrQuery({ args: { search: v.optional(v.string()) }, returns: v.array(employeeOptionValidator), handler: async (ctx, args) => {
  const rows = await ctx.db.query("employees").withIndex("by_name_normalized").take(MAX_DIRECTORY);
  return rows.filter(row => !row.archivedAt && row.name.toLowerCase().includes((args.search ?? "").toLowerCase())).map(row => ({ _id: row._id, name: row.name }));
} });
export const projectOptions = hrQuery({ args: { search: v.optional(v.string()) }, returns: v.array(projectOptionValidator), handler: async (ctx, args) => {
  const rows = await ctx.db.query("projects").withIndex("by_name").take(MAX_DIRECTORY);
  return rows.filter(row => row.name.toLowerCase().includes((args.search ?? "").toLowerCase())).map(row => ({ _id: row._id, name: row.name }));
} });
export const photoSource = internalQuery({ args: { punchId: v.id("attendancePunches") }, returns: v.union(v.string(), v.null()), handler: async (ctx, { punchId }): Promise<string | null> => {
  requirePermission(await requireUser(ctx), "rh.read");
  const punch = await ctx.db.get("attendancePunches", punchId);
  if (!punch || punch.excluded) return null;
  const connection = await activeConnection(ctx);
  if (connection?._id !== punch.connectionId) return null;
  const day = await getDay(ctx, punch.connectionId, punch.businessDate);
  if (day?.publishedRunId !== punch.runId || day.publishedAttempt !== punch.attempt) return null;
  return punch.photoUrl ?? null;
} });
