import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
    technicianName: v.string(),
    notes: v.string(),
    status: v.union(
      v.literal("operational"),
      v.literal("warning"),
      v.literal("error")
    ),
    tests: v.optional(
      v.object({
        vacuum: v.boolean(),
        pressure: v.boolean(),
        communication: v.boolean(),
      })
    ),
    photoIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.equipmentId, {
      status: args.status,
    });

    return await ctx.db.insert("maintenanceLogs", {
      equipmentId: args.equipmentId,
      technicianName: args.technicianName,
      notes: args.notes,
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
    return await ctx.storage.generateUploadUrl();
  },
});
