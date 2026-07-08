import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { deleteSystemsIfOrphaned } from "./systems";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// Lista as torres de uma obra, ordenadas.
export const list = engineeringQuery({
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
    const towers = await ctx.db
      .query("towers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const withCounts = await Promise.all(
      towers.map(async (tower) => {
        const floors = await ctx.db
          .query("floors")
          .withIndex("by_tower", (q) => q.eq("towerId", tower._id))
          .collect();
        return {
          _id: tower._id,
          _creationTime: tower._creationTime,
          projectId: tower.projectId,
          name: tower.name,
          order: tower.order,
          createdAt: tower.createdAt,
          floorCount: floors.length,
        };
      })
    );

    return withCounts.sort((a, b) => a.order - b.order);
  },
});

export const create = engineeringMutation({
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

export const update = engineeringMutation({
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
export const remove = engineeringMutation({
  args: { towerId: v.id("towers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tower = await ctx.db.get("towers", args.towerId);
    if (!tower) return null;

    const affectedSystemIds = await cascadeDeleteTower(ctx, args.towerId);
    await ctx.db.delete("towers", args.towerId);
    // Cascata: sistemas que ficaram sem equipamentos são removidos também.
    await deleteSystemsIfOrphaned(ctx, ctx.user, affectedSystemIds);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "towers",
      recordId: args.towerId,
      details: tower.name,
    });
    return null;
  },
});

// Duplica uma torre com todos os andares, ambientes e equipamentos planejados.
export const duplicate = engineeringMutation({
  args: {
    towerId: v.id("towers"),
    name: v.optional(v.string()),
  },
  returns: v.id("towers"),
  handler: async (ctx, args) => {
    const tower = await ctx.db.get("towers", args.towerId);
    if (!tower) throw new Error("Torre não encontrada");

    const existing = await ctx.db
      .query("towers")
      .withIndex("by_project", (q) => q.eq("projectId", tower.projectId))
      .collect();

    const newTowerId = await ctx.db.insert("towers", {
      projectId: tower.projectId,
      name: args.name?.trim() || `${tower.name} (cópia)`,
      order: existing.length,
      createdAt: Date.now(),
    });

    const floors = await ctx.db
      .query("floors")
      .withIndex("by_tower", (q) => q.eq("towerId", args.towerId))
      .collect();

    for (const floor of floors) {
      const newFloorId = await ctx.db.insert("floors", {
        towerId: newTowerId,
        projectId: floor.projectId,
        number: floor.number,
        label: floor.label,
        createdAt: Date.now(),
      });

      const environments = await ctx.db
        .query("environments")
        .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
        .collect();

      for (const env of environments) {
        const newEnvId = await ctx.db.insert("environments", {
          floorId: newFloorId,
          towerId: newTowerId,
          projectId: env.projectId,
          name: env.name,
          type: env.type,
          order: env.order,
          createdAt: Date.now(),
        });

        const items = await ctx.db
          .query("projectEquipment")
          .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
          .collect();

        for (const item of items) {
          // Equipamentos duplicados começam como planejados (sem vínculo de QR).
          await ctx.db.insert("projectEquipment", {
            projectId: item.projectId,
            unitId: item.unitId,
            environmentId: newEnvId,
            towerId: newTowerId,
            floorId: newFloorId,
            system: item.system,
            // Mesma obra: a cópia continua pertencendo ao mesmo sistema.
            systemId: item.systemId,
            ambiente: item.ambiente,
            kind: item.kind,
            modelo: item.modelo,
            capacidade: item.capacidade,
            status: "installing",
            obs: item.obs,
            deadline: item.deadline,
            serialNumber: undefined,
            checklistTemplateId: item.checklistTemplateId,
          });
        }
      }
    }

    await logAudit(ctx, ctx.user, {
      action: "duplicate",
      tableName: "towers",
      recordId: newTowerId,
      details: `de ${tower.name}`,
    });
    return newTowerId;
  },
});

// Helper de cascata: apaga andares, ambientes e equipamentos de uma torre.
// Retorna os sistemas afetados para checagem de órfãos pelo chamador.
async function cascadeDeleteTower(
  ctx: MutationCtx,
  towerId: Id<"towers">
): Promise<Set<Id<"systems">>> {
  const affectedSystemIds = new Set<Id<"systems">>();
  const floors = await ctx.db
    .query("floors")
    .withIndex("by_tower", (q) => q.eq("towerId", towerId))
    .collect();

  for (const floor of floors) {
    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", floor._id))
      .collect();
    for (const env of environments) {
      const items = await ctx.db
        .query("projectEquipment")
        .withIndex("by_environment", (q) => q.eq("environmentId", env._id))
        .collect();
      for (const item of items) {
        if (item.systemId) affectedSystemIds.add(item.systemId);
        if (item.linkedEquipmentId) {
          await ctx.db.patch("equipment", item.linkedEquipmentId, {
            projectEquipmentId: undefined,
          });
        }
        await ctx.db.delete("projectEquipment", item._id);
      }
      await ctx.db.delete("environments", env._id);
    }
    await ctx.db.delete("floors", floor._id);
  }
  return affectedSystemIds;
}
