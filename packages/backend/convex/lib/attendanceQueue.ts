import { Workpool } from "@convex-dev/workpool";
import { components, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_ATTENDANCE_SETTINGS } from "./attendance";
import { getBusinessDate, isBusinessDate } from "./rhid";

export const attendancePool = new Workpool(components.attendanceWorkpool, {
  maxParallelism: 1, retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
});
export function assertAttendanceDate(date: string): void {
  if (!isBusinessDate(date)) throw new Error("Data inválida. Use AAAA-MM-DD.");
}
export async function activeConnection(ctx: Pick<QueryCtx, "db">) {
  return ctx.db.query("attendanceConnections").withIndex("by_active", (q) => q.eq("active", true)).unique();
}
export async function ensureConnection(ctx: MutationCtx) {
  const existing = await activeConnection(ctx);
  if (existing) return existing;
  const now = Date.now();
  const id = await ctx.db.insert("attendanceConnections", { ...DEFAULT_ATTENDANCE_SETTINGS, active: true, createdAt: now, updatedAt: now, mappingRevision: 0 });
  return (await ctx.db.get("attendanceConnections", id))!;
}
export async function queueDay(ctx: MutationCtx, connection: Doc<"attendanceConnections">, date: string, priority: number, rebuild = false): Promise<boolean> {
  assertAttendanceDate(date);
  if (date > getBusinessDate(Date.now())) throw new Error("Não é possível sincronizar uma data futura.");
  let day = await ctx.db.query("attendanceDays").withIndex("by_connection_and_date", (q) => q.eq("connectionId", connection._id).eq("date", date)).unique();
  if (!day) {
    const id = await ctx.db.insert("attendanceDays", { connectionId: connection._id, date, generation: 0, warnings: [] });
    day = (await ctx.db.get("attendanceDays", id))!;
  }
  for (const status of ["queued", "running"] as const) {
    const pending = await ctx.db.query("attendanceSyncRuns").withIndex("by_day_and_status", (q) => q.eq("dayId", day._id).eq("status", status)).first();
    if (pending) {
      if (status === "queued" && priority < pending.priority) await ctx.db.patch("attendanceSyncRuns", pending._id, { priority });
      return false;
    }
  }
  const generation = day.generation + 1;
  await ctx.db.patch("attendanceDays", day._id, { generation });
  await ctx.db.insert("attendanceSyncRuns", {
    connectionId: connection._id, dayId: day._id, date, generation, priority, attempt: 0, status: "queued",
    kind: rebuild && day.publishedRunId ? "rebuild" : "fetch", sourceRunId: day.publishedRunId,
    sourceAttempt: day.publishedAttempt, createdAt: Date.now(), warnings: [],
  });
  return true;
}
export async function dispatchNext(ctx: MutationCtx, connectionId: Id<"attendanceConnections">): Promise<void> {
  const connection = await ctx.db.get("attendanceConnections", connectionId);
  if (!connection?.active || connection.activeRunId) return;
  // Only one action is enqueued at a time. Today's priority can overtake a 90-day backlog.
  const candidates = await ctx.db.query("attendanceSyncRuns").withIndex("by_connection_and_status_and_priority", (q) => q.eq("connectionId", connectionId).eq("status", "queued")).take(100);
  const run = candidates.find((item) => connection.enabled || item.kind === "rebuild");
  if (!run) return;
  const workId = await attendancePool.enqueueAction(ctx, internal.attendanceSync.syncDay, { runId: run._id }, {
    onComplete: internal.attendanceStore.onComplete, context: { runId: run._id },
  });
  await ctx.db.patch("attendanceSyncRuns", run._id, { status: "running", workId, startedAt: Date.now() });
  await ctx.db.patch("attendanceConnections", connectionId, { activeRunId: run._id });
  await ctx.db.patch("attendanceDays", run.dayId, { lastAttemptAt: Date.now(), lastError: undefined });
}
