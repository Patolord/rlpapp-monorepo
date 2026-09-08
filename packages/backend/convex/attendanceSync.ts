import { NonRetryableError } from "@convex-dev/workpool";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchRhidDay, RhidError, type RhidPunch } from "./lib/rhid";
import { BATCH_SIZE, MAX_DAY_PUNCHES, assertSourceContinuity, buildAttendanceSummaries, type EmployeeMapping, type GeofenceMapping } from "./lib/attendance";
import type { Doc } from "./_generated/dataModel";

export const syncDay = internalAction({
  args: { runId: v.id("attendanceSyncRuns") },
  handler: async (ctx, args): Promise<null> => {
    const started: { run: Doc<"attendanceSyncRuns">; connection: Doc<"attendanceConnections"> } | null = await ctx.runMutation(internal.attendanceStore.startAttempt, args);
    if (!started) return null;
    const { run, connection } = started;
    try {
      let punches: RhidPunch[] = [];
      let coverage: "unverified" | "partial" = "unverified";
      let warnings: string[] = ["Fonte web RHiD: completude não certificada pelo fornecedor."];
      const previous: RhidPunch[] = [];
      if (run.sourceRunId && run.sourceAttempt !== undefined) {
        let cursor: string | null = null;
        for (;;) {
          const page: { page: Doc<"attendancePunches">[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal.attendanceStore.sourcePage, { runId: run.sourceRunId, attempt: run.sourceAttempt, paginationOpts: { cursor, numItems: 100 } });
          previous.push(...page.page.map(({ sourceId, rhidEmployeeId, sourceName, occurredAt, sourceTimestamp, businessDate, latitude, longitude, geofenceSourceId, excluded, approvalStatus, rawType, photoUrl }) => ({ sourceId, rhidEmployeeId, sourceName, occurredAt, sourceTimestamp, businessDate, latitude, longitude, geofenceSourceId, excluded, approvalStatus, rawType, photoUrl })));
          if (previous.length > MAX_DAY_PUNCHES) throw new NonRetryableError("Dia excede o limite de marcações.");
          if (page.isDone) break;
          cursor = page.continueCursor;
        }
      }
      if (run.kind === "rebuild") {
        punches = previous;
      } else {
        if (!env.RHID_EMAIL || !env.RHID_PASSWORD) throw new NonRetryableError("Credenciais RHiD não configuradas no servidor.");
        const result = await fetchRhidDay({ email: env.RHID_EMAIL, password: env.RHID_PASSWORD, domain: env.RHID_DOMAIN, companyId: connection.companyId, date: run.date, token: connection.token });
        if (result.coverage === "partial") {
          await ctx.runMutation(internal.attendanceStore.recordFailure, { runId: run._id, message: "Resposta parcial do RHiD; os dados anteriores foram preservados.", coverage: "partial" });
          throw new NonRetryableError("Resposta parcial do RHiD; publicação interrompida.");
        }
        punches = result.punches;
        coverage = result.coverage;
        warnings = result.warnings;
        if (punches.length > MAX_DAY_PUNCHES) throw new NonRetryableError("Dia excede o limite de marcações.");
        try { assertSourceContinuity(previous, punches); } catch {
          await ctx.runMutation(internal.attendanceStore.recordFailure, { runId: run._id, message: "O RHiD omitiu marcações já publicadas. Histórico preservado; cobertura parcial.", coverage: "partial" });
          throw new NonRetryableError("A resposta RHiD omitiu marcações já publicadas.");
        }
        await ctx.runMutation(internal.attendanceStore.saveToken, { connectionId: connection._id, token: result.token });
        for (let i = 0; i < result.employees.length; i += BATCH_SIZE) await ctx.runMutation(internal.attendanceStore.stageDirectory, { connectionId: connection._id, employees: result.employees.slice(i, i + BATCH_SIZE), geofences: [] });
        for (let i = 0; i < result.geofences.length; i += BATCH_SIZE) await ctx.runMutation(internal.attendanceStore.stageDirectory, { connectionId: connection._id, employees: [], geofences: result.geofences.slice(i, i + BATCH_SIZE) });
      }
      const mapped: { employees: EmployeeMapping[]; geofences: GeofenceMapping[] } = await ctx.runQuery(internal.attendanceStore.mappings, { connectionId: connection._id });
      const summaries = buildAttendanceSummaries(punches, mapped.employees, mapped.geofences, connection.departmentNames);
      for (let i = 0; i < punches.length; i += BATCH_SIZE) await ctx.runMutation(internal.attendanceStore.stagePunches, { runId: run._id, attempt: run.attempt, punches: punches.slice(i, i + BATCH_SIZE) });
      for (let i = 0; i < summaries.length; i += BATCH_SIZE) await ctx.runMutation(internal.attendanceStore.stageSummaries, { runId: run._id, attempt: run.attempt, summaries: summaries.slice(i, i + BATCH_SIZE) });
      const published: boolean = await ctx.runMutation(internal.attendanceStore.publish, { runId: run._id, attempt: run.attempt, expectedPunches: punches.length, expectedSummaries: summaries.length, coverage, warnings });
      if (!published) await ctx.runMutation(internal.attendanceStore.recordFailure, { runId: run._id, message: "Publicação substituída por uma revisão mais recente ou conexão pausada." });
      return null;
    } catch (error) {
      if (error instanceof RhidError) {
        if (error.kind === "authentication") await ctx.runMutation(internal.attendanceStore.pauseAuthentication, { connectionId: connection._id });
        if (error.kind !== "transient") throw new NonRetryableError("Resposta RHiD recusada; revise o estado da conexão.");
        throw new Error("Serviço RHiD temporariamente indisponível.");
      }
      // Do not propagate request URLs, response bodies, tokens, or credentials to workpool logs.
      if (error instanceof NonRetryableError) throw error;
      throw new Error("Não foi possível concluir a importação RHiD.");
    }
  },
});
