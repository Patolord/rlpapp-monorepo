import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, getUserByIdentity } from "./lib/auth";

const logStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

export const listByEquipment = query({
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

export const create = mutation({
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
    await requireAuth(ctx);

    if (args.photoIds.length === 0) {
      throw new Error("É obrigatório anexar pelo menos uma foto");
    }

    // Responsável vinculado ao usuário logado (não aceita texto livre).
    const user = await getUserByIdentity(ctx);
    const technicianName = user?.name ?? "Desconhecido";

    await ctx.db.patch(args.equipmentId, {
      status: args.status,
    });

    return await ctx.db.insert("maintenanceLogs", {
      equipmentId: args.equipmentId,
      type: args.type,
      technicianName,
      notes: args.notes?.trim() || undefined,
      tags: args.tags,
      status: args.status,
      tests: args.tests,
      photoIds: args.photoIds,
      createdAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
