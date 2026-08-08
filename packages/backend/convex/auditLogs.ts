import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("auditLogs")
      .withIndex("by_record", (q) =>
        q.eq("tableName", args.tableName).eq("recordId", args.recordId)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (log) => {
        const user = await ctx.db.get("users", log.userId);
        return {
          _id: log._id,
          userId: log.userId,
          userName: user?.name ?? null,
          action: log.action,
          tableName: log.tableName,
          recordId: log.recordId,
          details: log.details ?? null,
          entityLabel: log.entityLabel ?? null,
          source: log.source ?? null,
          schemaVersion: log.schemaVersion ?? null,
          changes: log.changes
            ? log.changes.map((c) => ({
                field: c.field,
                previousValue: c.previousValue ?? null,
                newValue: c.newValue ?? null,
              }))
            : null,
          snapshotBefore: log.snapshotBefore ?? null,
          snapshotAfter: log.snapshotAfter ?? null,
          createdAt: log.createdAt,
        };
      })
    );

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      pageStatus: result.pageStatus ?? null,
    };
  },
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
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("auditLogs")
      .withIndex("by_table", (q) => q.eq("tableName", args.tableName))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (log) => {
        const user = await ctx.db.get("users", log.userId);
        return {
          _id: log._id,
          userId: log.userId,
          userName: user?.name ?? null,
          action: log.action,
          tableName: log.tableName,
          recordId: log.recordId,
          details: log.details ?? null,
          entityLabel: log.entityLabel ?? null,
          source: log.source ?? null,
          schemaVersion: log.schemaVersion ?? null,
          changes: log.changes
            ? log.changes.map((c) => ({
                field: c.field,
                previousValue: c.previousValue ?? null,
                newValue: c.newValue ?? null,
              }))
            : null,
          snapshotBefore: log.snapshotBefore ?? null,
          snapshotAfter: log.snapshotAfter ?? null,
          createdAt: log.createdAt,
        };
      })
    );

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      pageStatus: result.pageStatus ?? null,
    };
  },
});
