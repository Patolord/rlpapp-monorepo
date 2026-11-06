import { v } from "convex/values";
import {
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import {
  duplicateTower,
  listTowersWithFloorCounts,
  removeTower,
} from "./model/engineering/buildingStructure";

// Lista as torres de uma obra, ordenadas.
export const list = obrasQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("towers"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      name: v.string(),
      order: v.number(),
      createdAt: v.number(),
      floorCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listTowersWithFloorCounts(ctx, args.projectId);
  },
});

export const create = obrasMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    order: v.optional(v.number()),
  },
  returns: v.id("towers"),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Obra não encontrada");
    const name = args.name.trim();
    if (!name) throw new Error("O nome da torre é obrigatório");

    let order = args.order;
    if (order === undefined) {
      const existing = await ctx.db
        .query("towers")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      order = existing.length;
    }

    const towerId = await ctx.db.insert("towers", {
      projectId: args.projectId,
      name,
      order,
      createdAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "towers",
      recordId: towerId,
      details: name,
    });
    return towerId;
  },
});

export const update = obrasMutation({
  args: {
    towerId: v.id("towers"),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tower = await ctx.db.get("towers", args.towerId);
    if (!tower) throw new Error("Torre não encontrada");

    const updates: Partial<{ name: string; order: number }> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("O nome da torre é obrigatório");
      updates.name = name;
    }
    if (args.order !== undefined) updates.order = args.order;

    await ctx.db.patch("towers", args.towerId, updates);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "towers",
      recordId: args.towerId,
    });
    return null;
  },
});

// Remove uma torre em cascata: andares, ambientes e equipamentos vinculados.
export const remove = obrasMutation({
  args: { towerId: v.id("towers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeTower(ctx, ctx.user, args.towerId);
    return null;
  },
});

// Duplica uma torre com todos os andares, ambientes e equipamentos planejados.
export const duplicate = obrasMutation({
  args: {
    towerId: v.id("towers"),
    name: v.optional(v.string()),
  },
  returns: v.id("towers"),
  handler: async (ctx, args) => {
    return await duplicateTower(ctx, ctx.user, args);
  },
});
