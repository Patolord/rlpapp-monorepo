import { v } from "convex/values";
import { engineeringMutation, engineeringQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { deleteSystemsIfOrphaned } from "./systems";
import type { Id } from "./_generated/dataModel";

// Lista os ambientes de um andar (ordenados).
export const listByFloor = engineeringQuery({
  args: { floorId: v.id("floors") },
  returns: v.array(
    v.object({
      _id: v.id("environments"),
      floorId: v.id("floors"),
      towerId: v.id("towers"),
      projectId: v.id("projects"),
      name: v.string(),
      type: v.union(v.string(), v.null()),
      order: v.number(),
      col: v.union(v.number(), v.null()),
      colSpan: v.union(v.number(), v.null()),
      rowSpan: v.union(v.number(), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const environments = await ctx.db
      .query("environments")
      .withIndex("by_floor", (q) => q.eq("floorId", args.floorId))
      .collect();
    return environments
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        _id: e._id,
        floorId: e.floorId,
        towerId: e.towerId,
        projectId: e.projectId,
        name: e.name,
        type: e.type ?? null,
        order: e.order,
        col: e.col ?? null,
        colSpan: e.colSpan ?? null,
        rowSpan: e.rowSpan ?? null,
        createdAt: e.createdAt,
      }));
  },
});

/** Valida um campo de posição na matriz: inteiro >= 1 (ou undefined). */
function validateGridField(
  value: number | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined;
  const n = Math.floor(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${label} deve ser um número inteiro maior ou igual a 1`);
  }
  return n;
}

export const create = engineeringMutation({
  args: {
    floorId: v.id("floors"),
    name: v.string(),
    type: v.optional(v.string()),
    order: v.optional(v.number()),
    col: v.optional(v.number()),
    colSpan: v.optional(v.number()),
    rowSpan: v.optional(v.number()),
  },
  returns: v.id("environments"),
  handler: async (ctx, args) => {
    const floor = await ctx.db.get("floors", args.floorId);
    if (!floor) throw new Error("Andar não encontrado");
    const name = args.name.trim();
    if (!name) throw new Error("O nome do ambiente é obrigatório");

    let order = args.order;
    if (order === undefined) {
      const existing = await ctx.db
        .query("environments")
        .withIndex("by_floor", (q) => q.eq("floorId", args.floorId))
        .collect();
      order = existing.length;
    }

    const envId = await ctx.db.insert("environments", {
      floorId: args.floorId,
      towerId: floor.towerId,
      projectId: floor.projectId,
      name,
      type: args.type?.trim() || undefined,
      order,
      col: validateGridField(args.col, "A coluna"),
      colSpan: validateGridField(args.colSpan, "A largura"),
      rowSpan: validateGridField(args.rowSpan, "A quantidade de andares"),
      createdAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "environments",
      recordId: envId,
      details: name,
    });
    return envId;
  },
});

export const update = engineeringMutation({
  args: {
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    type: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
    // null limpa o campo (volta ao padrão de auto-posicionamento).
    col: v.optional(v.union(v.number(), v.null())),
    colSpan: v.optional(v.union(v.number(), v.null())),
    rowSpan: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const env = await ctx.db.get("environments", args.environmentId);
    if (!env) throw new Error("Ambiente não encontrado");

    const updates: Partial<{
      name: string;
      type: string | undefined;
      order: number;
      col: number | undefined;
      colSpan: number | undefined;
      rowSpan: number | undefined;
    }> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("O nome do ambiente é obrigatório");
      updates.name = name;
    }
    if (args.type !== undefined) {
      updates.type = args.type === null ? undefined : args.type.trim() || undefined;
    }
    if (args.order !== undefined) updates.order = args.order;
    if (args.col !== undefined) {
      updates.col =
        args.col === null ? undefined : validateGridField(args.col, "A coluna");
    }
    if (args.colSpan !== undefined) {
      updates.colSpan =
        args.colSpan === null
          ? undefined
          : validateGridField(args.colSpan, "A largura");
    }
    if (args.rowSpan !== undefined) {
      updates.rowSpan =
        args.rowSpan === null
          ? undefined
          : validateGridField(args.rowSpan, "A quantidade de andares");
    }

    await ctx.db.patch("environments", args.environmentId, updates);
    return null;
  },
});

export const remove = engineeringMutation({
  args: { environmentId: v.id("environments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const env = await ctx.db.get("environments", args.environmentId);
    if (!env) return null;

    const items = await ctx.db
      .query("projectEquipment")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();
    const affectedSystemIds = new Set<Id<"systems">>();
    for (const item of items) {
      if (item.systemId) affectedSystemIds.add(item.systemId);
      if (item.linkedEquipmentId) {
        await ctx.db.patch("equipment", item.linkedEquipmentId, {
          projectEquipmentId: undefined,
        });
      }
      await ctx.db.delete("projectEquipment", item._id);
    }
    await ctx.db.delete("environments", args.environmentId);
    // Cascata: sistemas que ficaram sem equipamentos são removidos também.
    await deleteSystemsIfOrphaned(ctx, ctx.user, affectedSystemIds);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "environments",
      recordId: args.environmentId,
      details: env.name,
    });
    return null;
  },
});
