import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { vOnCompleteValidator } from "@convex-dev/workpool";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { attendanceCoverage, attendancePunchFields, attendanceSummaryFields } from "./attendanceSchema";
import { attendanceCounts } from "./lib/attendanceAggregate";
import { activeConnection, dispatchNext, queueDay } from "./lib/attendanceQueue";
import { MAX_DAY_PUNCHES, MAX_DIRECTORY, type EmployeeMapping, type GeofenceMapping } from "./lib/attendance";
import { addBusinessDays, getBusinessDate } from "./lib/rhid";

export const startAttempt = internalMutation({
  args: { runId: v.id("attendanceSyncRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get("attendanceSyncRuns", runId);
    if (!run || run.status !== "running") return null;
    const connection = await ctx.db.get("attendanceConnections", run.connectionId);
    if (!connection?.active || (!connection.enabled && run.kind === "fetch")) return null;
    const attempt = run.attempt + 1;
    await ctx.db.patch("attendanceSyncRuns", runId, { attempt, mappingRevision: connection.mappingRevision, stagedPunches: 0, stagedSummaries: 0 });
    return { run: { ...run, attempt }, connection };
  },
});
export const saveToken = internalMutation({
  args: { connectionId: v.id("attendanceConnections"), token: v.string() },
  handler: async (ctx, args) => { await ctx.db.patch("attendanceConnections", args.connectionId, { token: args.token }); },
});
export const pauseAuthentication = internalMutation({
  args: { connectionId: v.id("attendanceConnections") },
  handler: async (ctx, args) => {
    await ctx.db.patch("attendanceConnections", args.connectionId, { enabled: false, token: undefined, lastError: "Autenticação RHiD recusada. Revise as credenciais e reative a conexão." });
  },
});
export const recordFailure = internalMutation({
  args: { runId: v.id("attendanceSyncRuns"), message: v.string(), coverage: v.optional(attendanceCoverage) },
  handler: async (ctx, args) => {
    await ctx.db.patch("attendanceSyncRuns", args.runId, { error: args.message.slice(0, 240), ...(args.coverage ? { coverage: args.coverage } : {}) });
  },
});
export const stageDirectory = internalMutation({
  args: {
    connectionId: v.id("attendanceConnections"),
    employees: v.array(v.object({ sourceId: v.string(), rhidEmployeeId: v.number(), sourceName: v.string(), department: v.optional(v.string()), active: v.boolean() })),
    geofences: v.array(v.object({ sourceId: v.string(), sourceName: v.string(), latitude: v.optional(v.number()), longitude: v.optional(v.number()), radius: v.optional(v.number()), excluded: v.boolean() })),
  },
  handler: async (ctx, args) => {
    if (args.employees.length + args.geofences.length > 200) throw new Error("Lote de cadastro muito grande.");
    for (const row of args.employees) {
      const existing = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_source", (q) => q.eq("connectionId", args.connectionId).eq("sourceId", row.sourceId)).unique();
      const value = { ...row, updatedAt: Date.now() };
      if (existing) await ctx.db.patch("attendanceEmployees", existing._id, value);
      else await ctx.db.insert("attendanceEmployees", { connectionId: args.connectionId, ...value });
    }
    for (const row of args.geofences) {
      const existing = await ctx.db.query("attendanceGeofences").withIndex("by_connection_and_source", (q) => q.eq("connectionId", args.connectionId).eq("sourceId", row.sourceId)).unique();
      const value = { ...row, updatedAt: Date.now() };
      if (existing) await ctx.db.patch("attendanceGeofences", existing._id, value);
      else await ctx.db.insert("attendanceGeofences", { connectionId: args.connectionId, ...value });
    }
  },
});
export const mappings = internalQuery({
  args: { connectionId: v.id("attendanceConnections") },
  handler: async (ctx, args): Promise<{ employees: EmployeeMapping[]; geofences: GeofenceMapping[] }> => {
    const employees = await ctx.db.query("attendanceEmployees").withIndex("by_connection_and_source", (q) => q.eq("connectionId", args.connectionId)).take(MAX_DIRECTORY + 1);
    const geofences = await ctx.db.query("attendanceGeofences").withIndex("by_connection_and_source", (q) => q.eq("connectionId", args.connectionId)).take(MAX_DIRECTORY + 1);
    if (employees.length > MAX_DIRECTORY || geofences.length > MAX_DIRECTORY) throw new Error("Cadastro excede o limite de sincronização; ajuste os lotes antes de continuar.");
    const people: EmployeeMapping[] = [];
    for (const row of employees) {
      const employee = row.employeeId ? await ctx.db.get("employees", row.employeeId) : null;
      people.push({ ...row, employeeName: employee?.name });
    }
    const sites: GeofenceMapping[] = [];
    for (const row of geofences) {
      const project = row.projectId ? await ctx.db.get("projects", row.projectId) : null;
      sites.push({ ...row, projectName: project?.name });
    }
    return { employees: people, geofences: sites };
  },
});
export const sourcePage = internalQuery({
  args: { runId: v.id("attendanceSyncRuns"), attempt: v.number(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", (q) => q.eq("runId", args.runId).eq("attempt", args.attempt)).paginate(args.paginationOpts),
});
export const stagePunches = internalMutation({
  args: { runId: v.id("attendanceSyncRuns"), attempt: v.number(), punches: v.array(v.object(attendancePunchFields)) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("attendanceSyncRuns", args.runId);
    if (!run || run.status !== "running" || run.attempt !== args.attempt) throw new Error("Tentativa de sincronização substituída.");
    if (args.punches.length > 100) throw new Error("Lote de marcações muito grande.");
    let inserted = 0;
    for (const row of args.punches) {
      if (row.businessDate !== run.date || !Number.isFinite(row.occurredAt)) throw new Error("Marcação fora da janela de importação.");
      const existing = await ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", (q) => q.eq("runId", args.runId).eq("attempt", args.attempt).eq("sourceId", row.sourceId)).unique();
      if (existing) throw new Error("Identificador de marcação repetido na resposta.");
      await ctx.db.insert("attendancePunches", { connectionId: run.connectionId, runId: run._id, attempt: args.attempt, ...row });
      inserted++;
    }
    const total = (run.stagedPunches ?? 0) + inserted;
    if (total > MAX_DAY_PUNCHES) throw new Error("Dia excede o limite de marcações; publicação interrompida.");
    await ctx.db.patch("attendanceSyncRuns", run._id, { stagedPunches: total });
  },
});
export const stageSummaries = internalMutation({
  args: { runId: v.id("attendanceSyncRuns"), attempt: v.number(), summaries: v.array(v.object(attendanceSummaryFields)) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("attendanceSyncRuns", args.runId);
    if (!run || run.status !== "running" || run.attempt !== args.attempt) throw new Error("Tentativa de sincronização substituída.");
    if (args.summaries.length > 100) throw new Error("Lote de resumos muito grande.");
    for (const row of args.summaries) {
      const existing = await ctx.db.query("attendanceDailySummaries").withIndex("by_run_and_attempt_and_employee", (q) => q.eq("runId", run._id).eq("attempt", args.attempt).eq("employeeKey", row.employeeKey)).unique();
      if (existing) throw new Error("Resumo diário repetido.");
      const id = await ctx.db.insert("attendanceDailySummaries", { connectionId: run.connectionId, runId: run._id, attempt: args.attempt, date: run.date, ...row });
      await attendanceCounts.insert(ctx, (await ctx.db.get("attendanceDailySummaries", id))!);
    }
    await ctx.db.patch("attendanceSyncRuns", run._id, { stagedSummaries: (run.stagedSummaries ?? 0) + args.summaries.length });
  },
});
export const publish = internalMutation({
  args: { runId: v.id("attendanceSyncRuns"), attempt: v.number(), expectedPunches: v.number(), expectedSummaries: v.number(), coverage: attendanceCoverage, warnings: v.array(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("attendanceSyncRuns", args.runId);
    if (!run || run.status !== "running" || run.attempt !== args.attempt) return false;
    const connection = await ctx.db.get("attendanceConnections", run.connectionId);
    const day = await ctx.db.get("attendanceDays", run.dayId);
    if (!connection?.active || (!connection.enabled && run.kind === "fetch") || !day || day.generation !== run.generation || connection.mappingRevision !== run.mappingRevision) return false;
    if (run.stagedPunches !== args.expectedPunches || run.stagedSummaries !== args.expectedSummaries) throw new Error("A janela de importação está incompleta.");
    if (args.coverage === "partial") throw new Error("Resposta parcial do RHiD; os dados publicados foram preservados.");
    const count = await attendanceCounts.count(ctx, { namespace: `${run._id}:${args.attempt}` });
    if (count !== args.expectedSummaries) throw new Error("Contagem dos resumos não confere com a importação.");
    const now = Date.now();
    await ctx.db.patch("attendanceDays", day._id, { publishedRunId: run._id, publishedAttempt: args.attempt, coverage: args.coverage, warnings: args.warnings.slice(0, 20), lastSuccessAt: now, lastError: undefined });
    await ctx.db.patch("attendanceSyncRuns", run._id, { status: "succeeded", finishedAt: now, coverage: args.coverage, warnings: args.warnings.slice(0, 20) });
    await ctx.db.patch("attendanceConnections", connection._id, { lastError: undefined });
    if (day.publishedRunId && day.publishedRunId !== run._id) await ctx.scheduler.runAfter(0, internal.attendanceStore.cleanupRun, { runId: day.publishedRunId });
    return true;
  },
});
export const dispatch = internalMutation({ args: { connectionId: v.id("attendanceConnections") }, handler: dispatchNextWrapper });
async function dispatchNextWrapper(ctx: Parameters<typeof dispatchNext>[0], args: { connectionId: Parameters<typeof dispatchNext>[1] }) { await dispatchNext(ctx, args.connectionId); }

export const onComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("attendanceSyncRuns") })),
  handler: async (ctx, { context, result }) => {
    const run = await ctx.db.get("attendanceSyncRuns", context.runId);
    if (!run) return;
    const connection = await ctx.db.get("attendanceConnections", run.connectionId);
    const changed = connection && run.mappingRevision !== undefined && connection.mappingRevision !== run.mappingRevision;
    if (run.status !== "succeeded") {
      const message = changed ? "Vínculos alterados durante a importação; reprocessamento agendado." : result.kind === "canceled" ? "Sincronização cancelada." : run.error ?? "Não foi possível atualizar o RHiD. Os dados anteriores foram preservados.";
      await ctx.db.patch("attendanceSyncRuns", run._id, { status: result.kind === "canceled" ? "canceled" : "failed", error: message, finishedAt: Date.now() });
      await ctx.db.patch("attendanceDays", run.dayId, { lastError: connection?.lastError ?? message });
    }
    if (connection?.activeRunId === run._id) await ctx.db.patch("attendanceConnections", connection._id, { activeRunId: undefined });
    await ctx.scheduler.runAfter(0, internal.attendanceStore.cleanupRun, { runId: run._id });
    if (connection?.active) {
      if (changed) await queueDay(ctx, connection, run.date, 0, true);
      await ctx.scheduler.runAfter(0, internal.attendanceStore.dispatch, { connectionId: connection._id });
    }
  },
});
/** Bounded cleanup keeps the published revision and prevents five-minute snapshots accumulating. */
export const cleanupRun = internalMutation({
  args: { runId: v.id("attendanceSyncRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("attendanceSyncRuns", args.runId);
    if (!run || run.status === "queued" || run.status === "running") return;
    const day = await ctx.db.get("attendanceDays", run.dayId);
    const keep = day?.publishedRunId === run._id ? day.publishedAttempt : undefined;
    const punches = keep === undefined
      ? await ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", (q) => q.eq("runId", run._id)).take(50)
      : await ctx.db.query("attendancePunches").withIndex("by_run_and_attempt_and_source", (q) => q.eq("runId", run._id).lt("attempt", keep)).take(50);
    const summaries = keep === undefined
      ? await ctx.db.query("attendanceDailySummaries").withIndex("by_run_and_attempt_and_employee", (q) => q.eq("runId", run._id)).take(50)
      : await ctx.db.query("attendanceDailySummaries").withIndex("by_run_and_attempt_and_employee", (q) => q.eq("runId", run._id).lt("attempt", keep)).take(50);
    for (const row of punches) await ctx.db.delete("attendancePunches", row._id);
    for (const row of summaries) {
      await attendanceCounts.delete(ctx, row);
      await ctx.db.delete("attendanceDailySummaries", row._id);
    }
    if (punches.length === 50 || summaries.length === 50) await ctx.scheduler.runAfter(0, internal.attendanceStore.cleanupRun, args);
  },
});
export const rebuildMappingPage = internalMutation({
  args: { connectionId: v.id("attendanceConnections"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get("attendanceConnections", args.connectionId);
    if (!connection?.active) return;
    const page = await ctx.db.query("attendanceDays").withIndex("by_connection_and_date", (q) => q.eq("connectionId", connection._id)).paginate({ cursor: args.cursor, numItems: 25 });
    for (const day of page.page) if (day.publishedRunId) await queueDay(ctx, connection, day.date, 1, true);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.attendanceStore.rebuildMappingPage, { connectionId: connection._id, cursor: page.continueCursor });
    await dispatchNext(ctx, connection._id);
  },
});
export const tick = internalMutation({
  args: {}, handler: async (ctx) => {
    const connection = await activeConnection(ctx);
    if (!connection?.enabled) return;
    await queueDay(ctx, connection, getBusinessDate(Date.now()), 0);
    await dispatchNext(ctx, connection._id);
  },
});
export const reconcile = internalMutation({
  args: {}, handler: async (ctx) => {
    const connection = await activeConnection(ctx);
    if (!connection?.enabled) return;
    const today = getBusinessDate(Date.now());
    for (let i = 0; i <= 7; i++) await queueDay(ctx, connection, addBusinessDays(today, -i), i === 0 ? 0 : 2);
    await dispatchNext(ctx, connection._id);
  },
});
