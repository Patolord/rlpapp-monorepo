import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import aggregate from "@convex-dev/aggregate/test";
import workpool from "@convex-dev/workpool/test";
import { setup, withUser } from "../tests/helpers";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { attendanceCounts } from "./lib/attendanceAggregate";
import { DEFAULT_ATTENDANCE_SETTINGS, assertSourceContinuity, buildAttendanceSummaries, punchKind } from "./lib/attendance";
import { activeConnection, ensureConnection, queueDay, dispatchNext } from "./lib/attendanceQueue";
import type { RhidPunch } from "./lib/rhid";

function testBackend() {
  const t = setup();
  aggregate.register(t, "attendanceCounts");
  workpool.register(t, "attendanceWorkpool");
  return t;
}
type Backend = ReturnType<typeof testBackend>;
const date = "2026-09-08";
const basePunch: RhidPunch = { sourceId: "12-7", rhidEmployeeId: 12, sourceName: "Pessoa", occurredAt: Date.parse("2026-09-08T11:00:00Z"), sourceTimestamp: "2026-09-08T08:00:00-03:00", businessDate: date, excluded: false };
async function seededRun(t: Backend, generation = 1, dayId?: Id<"attendanceDays">) {
  return t.run(async (ctx) => {
    let connection = await ensureConnection(ctx);
    await ctx.db.patch("attendanceConnections", connection._id, { enabled: true });
    connection = (await ctx.db.get("attendanceConnections", connection._id))!;
    const id = dayId ?? await ctx.db.insert("attendanceDays", { connectionId: connection._id, date, generation, warnings: [] });
    if (dayId) await ctx.db.patch("attendanceDays", dayId, { generation });
    const runId = await ctx.db.insert("attendanceSyncRuns", { connectionId: connection._id, dayId: id, date, generation, kind: "fetch", status: "running", priority: 0, attempt: 0, createdAt: Date.now(), warnings: [] });
    return { runId, dayId: id, connectionId: connection._id };
  });
}
async function stageOne(t: Backend, runId: Id<"attendanceSyncRuns">, punch: RhidPunch = basePunch) {
  const start = await t.mutation(internal.attendanceStore.startAttempt, { runId });
  const attempt = start!.run.attempt;
  await t.mutation(internal.attendanceStore.stagePunches, { runId, attempt, punches: [punch] });
  await t.mutation(internal.attendanceStore.stageSummaries, { runId, attempt, summaries: buildAttendanceSummaries([punch], [], [], []) });
  return attempt;
}
async function publishOne(t: Backend, runId: Id<"attendanceSyncRuns">, attempt: number) {
  return t.mutation(internal.attendanceStore.publish, { runId, attempt, expectedPunches: 1, expectedSummaries: 1, coverage: "unverified", warnings: ["Completude não certificada."] });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T15:00:00Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("attendance publication", () => {
  test("staged punches and counts do not become public before the day pointer commits", async () => {
    const t = testBackend();
    const { runId, dayId } = await seededRun(t);
    const attempt = await stageOne(t, runId);
    expect(await t.run(async (ctx) => (await ctx.db.get("attendanceDays", dayId))!.publishedRunId)).toBeNull();
    expect(await publishOne(t, runId, attempt)).toBe(true);
    expect(await t.run(async (ctx) => (await ctx.db.get("attendanceDays", dayId))!.publishedRunId)).toBe(runId);
    expect(await t.run((ctx) => attendanceCounts.count(ctx, { namespace: `${runId}:${attempt}` }))).toBe(1);
    expect(await t.run((ctx) => attendanceCounts.sum(ctx, { namespace: `${runId}:${attempt}` }))).toBe(1);
  });
  test("partial, incomplete, and stale attempts preserve the previously published day", async () => {
    const t = testBackend();
    const first = await seededRun(t);
    await publishOne(t, first.runId, await stageOne(t, first.runId));
    const second = await seededRun(t, 2, first.dayId);
    const attempt = await stageOne(t, second.runId);
    await expect(t.mutation(internal.attendanceStore.publish, { runId: second.runId, attempt, expectedPunches: 1, expectedSummaries: 1, coverage: "partial", warnings: [] })).rejects.toThrow(/parcial/i);
    await expect(t.mutation(internal.attendanceStore.publish, { runId: second.runId, attempt, expectedPunches: 2, expectedSummaries: 1, coverage: "unverified", warnings: [] })).rejects.toThrow(/incompleta/i);
    await t.run((ctx) => ctx.db.patch("attendanceConnections", second.connectionId, { mappingRevision: 1 }));
    expect(await publishOne(t, second.runId, attempt)).toBe(false);
    expect(await t.run(async (ctx) => (await ctx.db.get("attendanceDays", first.dayId))!.publishedRunId)).toBe(first.runId);
  });
  test("retry stages a new namespace; cleanup removes abandoned counts and preserves published photos", async () => {
    const t = testBackend();
    const { runId } = await seededRun(t);
    const firstAttempt = await stageOne(t, runId);
    const secondAttempt = await stageOne(t, runId, { ...basePunch, photoUrl: "https://rhid.com.br/photo/12" });
    expect(await publishOne(t, runId, firstAttempt)).toBe(false);
    expect(await publishOne(t, runId, secondAttempt)).toBe(true);
    await t.mutation(internal.attendanceStore.cleanupRun, { runId });
    expect(await t.run((ctx) => attendanceCounts.count(ctx, { namespace: `${runId}:${firstAttempt}` }))).toBe(0);
    expect(await t.run((ctx) => attendanceCounts.count(ctx, { namespace: `${runId}:${secondAttempt}` }))).toBe(1);
    const rows = await t.run((ctx) => ctx.db.query("attendancePunches").take(10));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.photoUrl).toContain("/photo/12");
  });
  test("duplicates and foreign dates fail the whole staging batch", async () => {
    const t = testBackend();
    const { runId } = await seededRun(t);
    const start = await t.mutation(internal.attendanceStore.startAttempt, { runId });
    const attempt = start!.run.attempt;
    await expect(t.mutation(internal.attendanceStore.stagePunches, { runId, attempt, punches: [basePunch, basePunch] })).rejects.toThrow(/repetido/i);
    expect(await t.run((ctx) => ctx.db.query("attendancePunches").take(10))).toHaveLength(0);
    await expect(t.mutation(internal.attendanceStore.stagePunches, { runId, attempt, punches: [{ ...basePunch, businessDate: "2026-09-07" }] })).rejects.toThrow(/janela/i);
  });
});

describe("attendance identity and cost rules", () => {
  test("two source identities linked to one employee count once and use earliest worksite", () => {
    const employeeId = "employee-id" as Id<"employees">;
    const projectId = "project-id" as Id<"projects">;
    const result = buildAttendanceSummaries([
      { ...basePunch, sourceId: "9", rhidEmployeeId: 99, occurredAt: basePunch.occurredAt + 1000, geofenceSourceId: "second" },
      { ...basePunch, geofenceSourceId: "first" },
    ], [{ rhidEmployeeId: 12, employeeId, employeeName: "Cadastro oficial", sourceName: "A", active: true }, { rhidEmployeeId: 99, employeeId, sourceName: "B", active: false }], [{ sourceId: "first", sourceName: "Origem", projectId, projectName: "Obra", excluded: false }], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ employeeName: "Cadastro oficial", projectId, worksiteName: "Obra", punchCount: 2, firstPunchAt: basePunch.occurredAt, lastPunchAt: basePunch.occurredAt + 1000 });
    expect(result[0]?.rhidEmployeeIds.sort()).toEqual([12, 99]);
  });
  test("unmatched earliest worksite stays unallocated and excluded punches never count", () => {
    const result = buildAttendanceSummaries([basePunch, { ...basePunch, sourceId: "later", occurredAt: basePunch.occurredAt + 1000, geofenceSourceId: "mapped" }, { ...basePunch, sourceId: "excluded", rhidEmployeeId: 88, excluded: true }], [], [{ sourceId: "mapped", sourceName: "Obra", projectId: "p" as Id<"projects">, excluded: false }], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.projectId).toBeUndefined();
    expect(result[0]?.punchCount).toBe(2);
    expect(punchKind(0)).toBe("unknown");
    expect(punchKind(3)).toBe("unknown");
  });
  test("feed shrinkage fails unless source supplied the prior event explicitly", () => {
    expect(() => assertSourceContinuity([basePunch], [])).toThrow(/omitiu/i);
    const excluded = { ...basePunch, excluded: true };
    expect(() => assertSourceContinuity([basePunch], [excluded])).not.toThrow();
  });
});

describe("attendance queue", () => {
  test("disabled defaults enqueue no work; requests coalesce and today precedes backfill", async () => {
    const t = testBackend();
    const result = await t.run(async (ctx) => {
      const connection = await ensureConnection(ctx);
      expect(connection.enabled).toBe(false);
      await queueDay(ctx, connection, "2026-08-01", 3);
      await queueDay(ctx, connection, date, 0);
      const duplicate = await queueDay(ctx, connection, date, 0);
      await dispatchNext(ctx, connection._id);
      expect((await activeConnection(ctx))?.activeRunId).toBeUndefined();
      await ctx.db.patch("attendanceConnections", connection._id, { enabled: true });
      await dispatchNext(ctx, connection._id);
      const active = await activeConnection(ctx);
      const run = await ctx.db.get("attendanceSyncRuns", active!.activeRunId!);
      return { duplicate, date: run!.date, queued: await ctx.db.query("attendanceSyncRuns").take(10) };
    });
    expect(result.duplicate).toBe(false);
    expect(result.date).toBe(date);
    expect(result.queued).toHaveLength(2);
  });
});

async function publishedDay(
  t: Backend,
  punches: RhidPunch[] = [basePunch],
  people: Array<{ sourceId: string; rhidEmployeeId: number; sourceName: string; department?: string; active: boolean; employeeId?: Id<"employees">; employeeName?: string }> = [
    { sourceId: "12", rhidEmployeeId: 12, sourceName: "Pessoa", department: "Obra", active: true },
  ],
  sites: Array<{ sourceId: string; sourceName: string; excluded: boolean; projectId?: Id<"projects">; projectName?: string }> = [],
) {
  const { runId, connectionId } = await seededRun(t);
  await t.run(async (ctx) => {
    for (const row of people) {
      await ctx.db.insert("attendanceEmployees", {
        connectionId, sourceId: row.sourceId, rhidEmployeeId: row.rhidEmployeeId, sourceName: row.sourceName,
        department: row.department, active: row.active, employeeId: row.employeeId, updatedAt: Date.now(),
      });
    }
    for (const row of sites) {
      await ctx.db.insert("attendanceGeofences", {
        connectionId, sourceId: row.sourceId, sourceName: row.sourceName, excluded: row.excluded,
        projectId: row.projectId, updatedAt: Date.now(),
      });
    }
  });
  const summaries = buildAttendanceSummaries(punches, people, sites, DEFAULT_ATTENDANCE_SETTINGS.departmentNames);
  const start = await t.mutation(internal.attendanceStore.startAttempt, { runId });
  const attempt = start!.run.attempt;
  if (punches.length) await t.mutation(internal.attendanceStore.stagePunches, { runId, attempt, punches });
  if (summaries.length) await t.mutation(internal.attendanceStore.stageSummaries, { runId, attempt, summaries });
  expect(await t.mutation(internal.attendanceStore.publish, {
    runId, attempt, expectedPunches: punches.length, expectedSummaries: summaries.length,
    coverage: "unverified", warnings: ["Completude não certificada."],
  })).toBe(true);
  return { runId, connectionId, attempt };
}

describe("attendance access and public records", () => {
  test("RH, admin and director read ponto; anonymous, inactive and other departments cannot", async () => {
    const t = testBackend();
    await publishedDay(t);
    const hr = await withUser(t, { clerkId: "hr-ponto", role: "operator", department: "rh" });
    const admin = await withUser(t, { clerkId: "admin-ponto", role: "admin" });
    const director = await withUser(t, { clerkId: "dir-ponto", role: "director" });
    const engineer = await withUser(t, { clerkId: "eng-ponto", role: "engenheiro", department: "engenharia" });
    const other = await withUser(t, { clerkId: "compras-ponto", role: "operator", department: "compras" });
    const inactive = await withUser(t, { clerkId: "inactive-ponto", role: "operator", department: "rh", isActive: false });
    for (const client of [hr, admin, director]) {
      const dashboard = await client.query(api.attendance.getDashboard, { date, today: date });
      expect(dashboard.totals.punched).toBe(1);
      expect(dashboard.employees[0]?.hasPunch).toBe(true);
      expect(JSON.stringify(dashboard)).not.toMatch(/baseSalary|pixKey|accessToken|RHID_/);
    }
    await expect(t.query(api.attendance.getDashboard, { date })).rejects.toThrow(/Not authenticated/);
    await expect(engineer.query(api.attendance.getDashboard, { date })).rejects.toThrow(/recursos humanos/i);
    await expect(other.query(api.attendance.getDashboard, { date })).rejects.toThrow(/recursos humanos/i);
    await expect(inactive.query(api.attendance.getDashboard, { date })).rejects.toThrow(/desativado/i);
    await expect(hr.mutation(api.attendance.configure, { enabled: false, companyId: 1, departmentNames: ["Obra"] })).rejects.toThrow(/Insufficient permissions/);
    await expect(engineer.mutation(api.attendance.requestSync, { date })).rejects.toThrow(/recursos humanos/i);
  });

  test("dashboard and reports keep unmatched people, Sem obra and the selected daily rate", async () => {
    const t = testBackend();
    const hr = await withUser(t, { clerkId: "hr-report", role: "operator", department: "rh" });
    const employeeId = await hr.mutation(api.employees.create, { name: "Cadastro oficial", baseSalaryCents: 987_654, pixKey: "pix-secreta" });
    const projectId = await t.run(async (ctx) => ctx.db.insert("projects", { name: "Obra Norte", floors: [], createdAt: Date.now() }));
    const first = { ...basePunch, geofenceSourceId: "gate-1" };
    const later = { ...basePunch, sourceId: "12-8", occurredAt: basePunch.occurredAt + 60_000, geofenceSourceId: "gate-2" };
    const unmatched = { ...basePunch, sourceId: "77-1", rhidEmployeeId: 77, sourceName: "Avulso RHiD" };
    const excluded = { ...basePunch, sourceId: "12-x", excluded: true };
    await publishedDay(t, [first, later, unmatched, excluded], [
      { sourceId: "12", rhidEmployeeId: 12, sourceName: "Pessoa", department: "Obra", active: true, employeeId, employeeName: "Cadastro oficial" },
      { sourceId: "77", rhidEmployeeId: 77, sourceName: "Avulso RHiD", department: "Obra", active: true },
    ], [
      { sourceId: "gate-1", sourceName: "Canteiro", excluded: false, projectId, projectName: "Obra Norte" },
      { sourceId: "gate-2", sourceName: "Apoio", excluded: false },
    ]);
    const dashboard = await hr.query(api.attendance.getDashboard, { date, today: date });
    expect(JSON.stringify(dashboard)).not.toMatch(/987654|pix-secreta|baseSalary/);
    expect(dashboard.employees.map((row) => row.name).sort()).toEqual(["Avulso RHiD", "Cadastro oficial"]);
    expect(dashboard.totals.punched).toBe(2);
    expect(dashboard.punches).toHaveLength(3);
    const report = await hr.query(api.attendance.getReport, { startDate: date, endDate: date, today: date });
    expect(report.totalManDays).toBe(2);
    expect(report.totalCostCents).toBe(30_000);
    expect(report.employees.find((row) => row.name === "Cadastro oficial")?.days).toBe(1);
    expect(report.worksites.find((row) => row.name === "Obra Norte")?.days).toBe(1);
    expect(report.worksites.find((row) => row.name === "Sem obra")?.days).toBe(1);
    await hr.mutation(api.attendance.setDailyRate, { dailyRateCents: 20_000 });
    const repriced = await hr.query(api.attendance.getReport, { startDate: date, endDate: date, today: date });
    expect(repriced.totalCostCents).toBe(40_000);
    expect(repriced.dailyRateCents).toBe(20_000);
  });

  test("mapping changes queue a rebuild, reject duplicate employee links, and preserve published days after auth pause", async () => {
    const t = testBackend();
    const hr = await withUser(t, { clerkId: "hr-map", role: "operator", department: "rh" });
    const admin = await withUser(t, { clerkId: "admin-map", role: "admin" });
    const { connectionId, runId } = await publishedDay(t, [basePunch], [
      { sourceId: "12", rhidEmployeeId: 12, sourceName: "Pessoa", department: "Obra", active: true },
      { sourceId: "77", rhidEmployeeId: 77, sourceName: "Outra", department: "Obra", active: true },
    ]);
    const employeeId = await hr.mutation(api.employees.create, { name: "Vinculado" });
    await hr.mutation(api.attendance.linkEmployee, { sourceId: "12", employeeId });
    await expect(hr.mutation(api.attendance.linkEmployee, { sourceId: "77", employeeId })).rejects.toThrow(/já está vinculado/i);
    await t.mutation(internal.attendanceStore.rebuildMappingPage, { connectionId, cursor: null });
    const rebuild = await t.run(async (ctx) => (await ctx.db.query("attendanceSyncRuns").collect()).find((row) => row.kind === "rebuild"));
    expect(rebuild?.sourceRunId).toBe(runId);
    await t.mutation(internal.attendanceStore.pauseAuthentication, { connectionId });
    const dashboard = await hr.query(api.attendance.getDashboard, { date, today: date });
    expect(dashboard.totals.punches).toBe(1);
    expect(dashboard.employees.some((row) => row.hasPunch)).toBe(true);
    expect(dashboard.settings.enabled).toBe(false);
    await expect(hr.mutation(api.attendance.requestSync, { date })).rejects.toThrow(/configurada e ativa/i);
    const first = await t.run((ctx) => activeConnection(ctx));
    await admin.mutation(api.attendance.configure, { enabled: false, companyId: 2, departmentNames: ["Obra"] });
    const second = await t.run((ctx) => activeConnection(ctx));
    expect(second?._id).not.toBe(first?._id);
    expect(second?.companyId).toBe(2);
    expect((await t.run((ctx) => ctx.db.get("attendanceConnections", first!._id)))?.active).toBe(false);
  });
});
