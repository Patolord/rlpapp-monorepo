import type { Doc, Id } from "../_generated/dataModel";
import type { PaginationOptions, PaginationResult } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const AUDIT_SCHEMA_VERSION = 1;

export type AuditChange = {
  field: string;
  previousValue?: string;
  newValue?: string;
};

export type AuditParams = {
  action: string;
  tableName: string;
  recordId: string;
  details?: string;
  entityLabel?: string;
  source?: string;
  changes?: AuditChange[];
  snapshotBefore?: unknown;
  snapshotAfter?: unknown;
};

function serializeSnapshot(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Registra uma entrada no log de auditoria do sistema.
 * Deve ser chamado dentro de mutations, após uma escrita relevante.
 */
export async function logAudit(
  ctx: MutationCtx,
  user: Doc<"users">,
  params: AuditParams
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    userId: user._id,
    action: params.action,
    tableName: params.tableName,
    recordId: params.recordId,
    details: params.details,
    entityLabel: params.entityLabel,
    source: params.source,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    changes: params.changes,
    snapshotBefore: serializeSnapshot(params.snapshotBefore),
    snapshotAfter: serializeSnapshot(params.snapshotAfter),
    createdAt: Date.now(),
  });
}

/** Compara dois objetos planos e retorna mudanças legíveis. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T)[]
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const prev = before[field];
    const next = after[field];
    const prevStr =
      prev === undefined ? undefined : JSON.stringify(prev);
    const nextStr =
      next === undefined ? undefined : JSON.stringify(next);
    if (prevStr !== nextStr) {
      changes.push({
        field: String(field),
        previousValue: prevStr,
        newValue: nextStr,
      });
    }
  }
  return changes;
}

/**
 * Registra uma entrada no histórico de um equipamento planejado.
 * Usado para rastrear instalação, teste, finalização e mudanças de status.
 */
export async function logEquipmentHistory(
  ctx: MutationCtx,
  user: Doc<"users">,
  params: {
    equipmentId: Id<"projectEquipment">;
    action: string;
    previousValue?: string;
    newValue?: string;
    notes?: string;
    location?: { latitude: number; longitude: number };
  }
): Promise<void> {
  await ctx.db.insert("equipmentHistory", {
    equipmentId: params.equipmentId,
    action: params.action,
    userId: user._id,
    previousValue: params.previousValue,
    newValue: params.newValue,
    notes: params.notes,
    location: params.location,
    createdAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Leitura do log (`convex/auditLogs.ts`, só administradores)
// ---------------------------------------------------------------------------

async function toAuditLogPage(
  ctx: QueryCtx,
  result: PaginationResult<Doc<"auditLogs">>
) {
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
}

/** Entradas de um registro, da mais nova à mais antiga, com o nome do autor. */
export async function listAuditLogsByRecord(
  ctx: QueryCtx,
  input: { tableName: string; recordId: string; paginationOpts: PaginationOptions }
) {
  const result = await ctx.db
    .query("auditLogs")
    .withIndex("by_record", (q) =>
      q.eq("tableName", input.tableName).eq("recordId", input.recordId)
    )
    .order("desc")
    .paginate(input.paginationOpts);
  return await toAuditLogPage(ctx, result);
}

/** Entradas de uma tabela, da mais nova à mais antiga, com o nome do autor. */
export async function listAuditLogsByTable(
  ctx: QueryCtx,
  input: { tableName: string; paginationOpts: PaginationOptions }
) {
  const result = await ctx.db
    .query("auditLogs")
    .withIndex("by_table", (q) => q.eq("tableName", input.tableName))
    .order("desc")
    .paginate(input.paginationOpts);
  return await toAuditLogPage(ctx, result);
}
