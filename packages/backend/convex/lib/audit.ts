import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Registra uma entrada no log de auditoria do sistema.
 * Deve ser chamado dentro de mutations, após uma escrita relevante.
 */
export async function logAudit(
  ctx: MutationCtx,
  user: Doc<"users">,
  params: {
    action: string;
    tableName: string;
    recordId: string;
    details?: string;
  }
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    userId: user._id,
    action: params.action,
    tableName: params.tableName,
    recordId: params.recordId,
    details: params.details,
    createdAt: Date.now(),
  });
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
