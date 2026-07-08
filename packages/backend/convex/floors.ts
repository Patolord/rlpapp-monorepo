import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { deleteSystemsIfOrphaned } from "./systems";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

function defaultFloorLabel(n: number): string {
  return n === 0 ? "Térreo" : `${n}º Andar`;
}

// Lista os andares de uma torre (ordenados do mais alto para o mais baixo).
export const listByTower = engineeringQuery({
  args: { towerId: v.id("towers") },
  returns: v.array(
    v.object({
      _id: v.id("floors"),
      towerId: v.id("towers"),
      projectId: v.id("projects"),
      number: v.number(),
      label: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_tower", (q) => q.eq("towerId", args.towerId))
      .collect();
    return floors
      .sort((a, b) => b.number - a.number)
      .map((f) => ({
        _id: f._id,
        towerId: f.towerId,
        projectId: f.projectId,
        number: f.number,
        label: f.label,
        createdAt: f.createdAt,
      }));
  },
});

// Cria um ou mais andares numa torre.
export const create = engineeringMutation({
  args: {
    towerId: v.id("towers"),
    floors: v.array(
      v.object({
        number: v.number(),
        label: v.optional(v.string()),
      })
    ),
  },
  returns: v.array(v.id("floors")),
  handler: async (ctx, args) => {
    const tower = await ctx.db.get("towers", args.towerId);
    if (!tower) throw new Error("Torre não encontrada");

    const existing = await ctx.db
      .query("floors")
      .withIndex("by_tower", (q) => q.eq("towerId", args.towerId))
      .collect();
    const seen = new Set(existing.map((f) => f.number));

    const created: Id<"floors">[] = [];
    for (const floor of args.floors) {
      const number = Math.floor(floor.number);
      if (seen.has(number)) continue;
      seen.add(number);
      const floorId = await ctx.db.insert("floors", {
        towerId: args.towerId,
        projectId: tower.projectId,
        number,
        label: floor.label?.trim() || defaultFloorLabel(number),
        createdAt: Date.now(),
      });
      created.push(floorId);
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "floors",
      recordId: args.towerId,
      details: `${created.length} andar(es)`,
    });
    return created;
  },
});

export const update = engineeringMutation({
  args: {
    floorId: v.id("floors"),
    label: v.optional(v.string()),
    number: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floor = await ctx.db.get("floors", args.floorId);
    if (!floor) throw new Error("Andar não encontrado");

    const updates: Partial<{ label: string; number: number }> = {};
    if (args.label !== undefined) {
      updates.label = args.label.trim() || defaultFloorLabel(floor.number);
    }
    if (args.number !== undefined) updates.number = Math.floor(args.number);

    await ctx.db.patch("floors", args.floorId, updates);
    return null;
  },
});

export const remove = engineeringMutation({
  args: { floorId: v.id("floors") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floor = await ctx.db.get("floors", args.floorId);
    if (!floor) return null;
    const affectedSystemIds = await cascadeDeleteFloor(ctx, args.floorId);
    await ctx.db.delete("floors", args.floorId);
    // Cascata: sistemas que ficaram sem equipamentos são removidos também.
    await deleteSystemsIfOrphaned(ctx, ctx.user, affectedSystemIds);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "floors",
      recordId: args.floorId,
      details: floor.label,
    });
    return null;
  },
});

// Helper de cascata: apaga ambientes e equipamentos de um andar.
// Retorna os sistemas afetados para checagem de órfãos pelo chamador.
async function cascadeDeleteFloor(
  ctx: MutationCtx,
  floorId: Id<"floors">
): Promise<Set<Id<"systems">>> {
  const affectedSystemIds = new Set<Id<"systems">>();
  const environments = await ctx.db
    .query("environments")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
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
  return affectedSystemIds;
}
