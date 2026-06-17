import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/functions";

const logStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

export const listByEquipment = authedQuery({
  args: { equipmentId: v.id("equipment") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .collect();

    const logsWithPhotos = await Promise.all(
      logs.map(async (log) => {
        const photoUrls = await Promise.all(
          log.photoIds.map(async (id) => {
            const url = await ctx.storage.getUrl(id);
            return url;
          })
        );
        return {
          ...log,
          photoUrls: photoUrls.filter((url): url is string => url !== null),
        };
      })
    );

    return logsWithPhotos;
  },
});

// Registros (instalação/manutenção) criados pelo próprio usuário logado.
// Acessível ao qr_operator para acompanhar seu histórico de campo.
export const listMine = authedQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_createdByUser", (q) =>
        q.eq("createdByUserId", ctx.user._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      results.page.map(async (log) => {
        const equipment = await ctx.db.get("equipment", log.equipmentId);
        const qrCode = await ctx.db
          .query("qrCodes")
          .withIndex("by_equipment", (q) =>
            q.eq("equipmentId", log.equipmentId)
          )
          .order("desc")
          .first();
        const photoUrls = await Promise.all(
          log.photoIds.map((id) => ctx.storage.getUrl(id))
        );
        return {
          ...log,
          equipment: equipment
            ? { description: equipment.description }
            : null,
          qrToken: qrCode?.token ?? null,
          photoUrls: photoUrls.filter((url): url is string => url !== null),
        };
      })
    );

    return { ...results, page };
  },
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
    status: logStatusValidator,
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
  handler: async (ctx, args) => {
    if (args.photoIds.length === 0) {
      throw new Error("É obrigatório anexar pelo menos uma foto");
    }

    // Responsável vinculado ao usuário logado (não aceita texto livre).
    const technicianName = ctx.user.name;

    await ctx.db.patch("equipment", args.equipmentId, {
      status: args.status,
    });

    return await ctx.db.insert("maintenanceLogs", {
      equipmentId: args.equipmentId,
      type: args.type,
      technicianName,
      createdByUserId: ctx.user._id,
      notes: args.notes?.trim() || undefined,
      tags: args.tags,
      status: args.status,
      tests: args.tests,
      photoIds: args.photoIds,
      createdAt: Date.now(),
    });
  },
});

export const generateUploadUrl = authedMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
