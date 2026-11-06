import { equipmentStatusValidator } from "./schema/engineering";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/rbac";
import {
  createMaintenanceLog,
  equipmentLogValidator,
  listEquipmentLogs,
  listMyMaintenanceLogs,
  myMaintenanceLogsValidator,
} from "./model/engineering/equipmentRecords";


export const listByEquipment = authedQuery({
  args: { equipmentId: v.id("equipment") },
  returns: v.array(equipmentLogValidator),
  handler: async (ctx, args) => await listEquipmentLogs(ctx, args.equipmentId),
});

// Registros (instalação/manutenção) criados pelo próprio usuário logado.
// Acessível ao qr_operator para acompanhar seu histórico de campo.
export const listMine = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: myMaintenanceLogsValidator,
  handler: async (ctx, args) =>
    await listMyMaintenanceLogs(ctx, ctx.user, args.paginationOpts),
});

// PÚBLICO (intencional): a página /q/$token mostra a data do último registro
// antes do login. Expõe apenas o timestamp — nunca notas, fotos ou técnico.
export const getLastMaintenanceDate = query({
  args: { equipmentId: v.id("equipment") },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .first();
    return last?.createdAt ?? null;
  },
});

export const create = authedMutation({
  args: {
    equipmentId: v.id("equipment"),
    type: v.union(v.literal("installation"), v.literal("maintenance")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    status: equipmentStatusValidator,
    tests: v.optional(
      v.object({
        vacuum: v.boolean(),
        pressure: v.boolean(),
        communication: v.boolean(),
        gas: v.optional(v.boolean()),
      })
    ),
    photoIds: v.array(v.id("_storage")),
  },
  returns: v.id("maintenanceLogs"),
  handler: async (ctx, args) => await createMaintenanceLog(ctx, ctx.user, args),
});

export const addPhotos = authedMutation({
  args: {
    logId: v.id("maintenanceLogs"),
    photoIds: v.array(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.photoIds.length === 0) {
      throw new Error("Nenhuma foto fornecida");
    }

    const log = await ctx.db.get("maintenanceLogs", args.logId);
    if (!log) {
      throw new Error("Registro não encontrado");
    }

    await ctx.db.patch("maintenanceLogs", args.logId, {
      photoIds: [...log.photoIds, ...args.photoIds],
    });
    return null;
  },
});

export const generateUploadUrl = authedMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
