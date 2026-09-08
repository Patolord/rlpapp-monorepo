import { defineTable } from "convex/server";
import { v } from "convex/values";

export const attendanceCoverage = v.union(v.literal("unverified"), v.literal("partial"));
export const attendanceRunStatus = v.union(v.literal("queued"), v.literal("running"), v.literal("succeeded"), v.literal("failed"), v.literal("canceled"));
export const attendancePunchFields = {
  sourceId: v.string(), rhidEmployeeId: v.number(), sourceName: v.string(),
  occurredAt: v.number(), sourceTimestamp: v.string(), businessDate: v.string(),
  latitude: v.optional(v.number()), longitude: v.optional(v.number()),
  geofenceSourceId: v.optional(v.string()), excluded: v.boolean(),
  approvalStatus: v.optional(v.number()), rawType: v.optional(v.number()), photoUrl: v.optional(v.string()),
};
export const attendanceSummaryFields = {
  employeeKey: v.string(), employeeId: v.optional(v.id("employees")), employeeName: v.string(),
  rhidEmployeeIds: v.array(v.number()), firstPunchAt: v.number(), lastPunchAt: v.number(), punchCount: v.number(),
  geofenceSourceId: v.optional(v.string()), projectId: v.optional(v.id("projects")), worksiteName: v.optional(v.string()),
};

export const attendanceTables = {
  attendanceConnections: defineTable({
    active: v.boolean(), enabled: v.boolean(), companyId: v.number(), departmentNames: v.array(v.string()),
    dailyRateCents: v.number(), createdAt: v.number(), updatedAt: v.number(),
    token: v.optional(v.string()), activeRunId: v.optional(v.id("attendanceSyncRuns")),
    lastError: v.optional(v.string()), mappingRevision: v.number(),
  }).index("by_active", ["active"]),
  attendanceDays: defineTable({
    connectionId: v.id("attendanceConnections"), date: v.string(), generation: v.number(),
    publishedRunId: v.optional(v.id("attendanceSyncRuns")), publishedAttempt: v.optional(v.number()),
    coverage: v.optional(attendanceCoverage), lastSuccessAt: v.optional(v.number()), lastAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()), warnings: v.array(v.string()),
  }).index("by_connection_and_date", ["connectionId", "date"]),
  attendanceSyncRuns: defineTable({
    connectionId: v.id("attendanceConnections"), dayId: v.id("attendanceDays"), date: v.string(), generation: v.number(),
    kind: v.union(v.literal("fetch"), v.literal("rebuild")), sourceRunId: v.optional(v.id("attendanceSyncRuns")),
    sourceAttempt: v.optional(v.number()), status: attendanceRunStatus, priority: v.number(), attempt: v.number(),
    createdAt: v.number(), startedAt: v.optional(v.number()), finishedAt: v.optional(v.number()),
    workId: v.optional(v.string()), error: v.optional(v.string()), mappingRevision: v.optional(v.number()),
    stagedPunches: v.optional(v.number()), stagedSummaries: v.optional(v.number()),
    coverage: v.optional(attendanceCoverage), warnings: v.array(v.string()),
  }).index("by_connection_and_status_and_priority", ["connectionId", "status", "priority"])
    .index("by_day_and_status", ["dayId", "status"])
    .index("by_connection_and_createdAt", ["connectionId", "createdAt"]),
  attendanceEmployees: defineTable({
    connectionId: v.id("attendanceConnections"), sourceId: v.string(), rhidEmployeeId: v.number(), sourceName: v.string(),
    department: v.optional(v.string()), active: v.boolean(), employeeId: v.optional(v.id("employees")), updatedAt: v.number(),
  }).index("by_connection_and_source", ["connectionId", "sourceId"])
    .index("by_connection_and_employee", ["connectionId", "employeeId"]),
  attendanceGeofences: defineTable({
    connectionId: v.id("attendanceConnections"), sourceId: v.string(), sourceName: v.string(),
    latitude: v.optional(v.number()), longitude: v.optional(v.number()), radius: v.optional(v.number()), excluded: v.boolean(),
    projectId: v.optional(v.id("projects")), updatedAt: v.number(),
  }).index("by_connection_and_source", ["connectionId", "sourceId"])
    .index("by_connection_and_project", ["connectionId", "projectId"]),
  attendancePunches: defineTable({
    connectionId: v.id("attendanceConnections"), runId: v.id("attendanceSyncRuns"), attempt: v.number(),
    ...attendancePunchFields,
  }).index("by_run_and_attempt_and_source", ["runId", "attempt", "sourceId"]),
  attendanceDailySummaries: defineTable({
    connectionId: v.id("attendanceConnections"), runId: v.id("attendanceSyncRuns"), attempt: v.number(), date: v.string(),
    ...attendanceSummaryFields,
  }).index("by_run_and_attempt_and_employee", ["runId", "attempt", "employeeKey"]),
};
