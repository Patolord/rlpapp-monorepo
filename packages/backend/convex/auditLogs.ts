import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { listAuditLogsByRecord, listAuditLogsByTable } from "./lib/audit";
import { adminQuery } from "./lib/rbac";

export const auditLogValidator = v.object({
  _id: v.id("auditLogs"),
  userId: v.id("users"),
  userName: v.union(v.string(), v.null()),
  action: v.string(),
  tableName: v.string(),
  recordId: v.string(),
  details: v.union(v.string(), v.null()),
  entityLabel: v.union(v.string(), v.null()),
  source: v.union(v.string(), v.null()),
  schemaVersion: v.union(v.number(), v.null()),
  changes: v.union(
    v.array(
      v.object({
        field: v.string(),
        previousValue: v.union(v.string(), v.null()),
        newValue: v.union(v.string(), v.null()),
      })
    ),
    v.null()
  ),
  snapshotBefore: v.union(v.string(), v.null()),
  snapshotAfter: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

export const listByRecord = adminQuery({
  args: {
    tableName: v.string(),
    recordId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(auditLogValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => await listAuditLogsByRecord(ctx, args),
});

export const listByTable = adminQuery({
  args: {
    tableName: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(auditLogValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => await listAuditLogsByTable(ctx, args),
});
