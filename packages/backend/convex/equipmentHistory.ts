import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/rbac";
import { logEquipmentHistory } from "./lib/audit";

const locationValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

// Lista o histórico de um equipamento planejado (com nome do usuário).
export const listForEquipment = authedQuery({
  args: { equipmentId: v.id("projectEquipment") },
  returns: v.array(
    v.object({
      _id: v.id("equipmentHistory"),
      action: v.string(),
      userName: v.string(),
      previousValue: v.union(v.string(), v.null()),
      newValue: v.union(v.string(), v.null()),
      notes: v.union(v.string(), v.null()),
      location: v.union(locationValidator, v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("equipmentHistory")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .collect();

    const userCache = new Map<string, string>();
    const result = [];
    for (const e of entries) {
      let userName = userCache.get(e.userId);
      if (userName === undefined) {
        const user = await ctx.db.get("users", e.userId);
        userName = user?.name ?? "Desconhecido";
        userCache.set(e.userId, userName);
      }
      result.push({
        _id: e._id,
        action: e.action,
        userName,
        previousValue: e.previousValue ?? null,
        newValue: e.newValue ?? null,
        notes: e.notes ?? null,
        location: e.location ?? null,
        createdAt: e.createdAt,
      });
    }
    return result;
  },
});

// Registra uma entrada de histórico manualmente (ex: técnico em campo via QR).
// Estrutura preparada para GPS — a localização é opcional.
export const record = authedMutation({
  args: {
    equipmentId: v.id("projectEquipment"),
    action: v.string(),
    notes: v.optional(v.string()),
    location: v.optional(locationValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const equipment = await ctx.db.get("projectEquipment", args.equipmentId);
    if (!equipment) throw new Error("Equipamento não encontrado");
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: args.equipmentId,
      action: args.action,
      notes: args.notes?.trim() || undefined,
      location: args.location,
    });
    return null;
  },
});
