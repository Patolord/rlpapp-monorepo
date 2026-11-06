import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/rbac";
import { logEquipmentHistory } from "./lib/audit";
import { listPlannedEquipmentHistory } from "./model/engineering/projectEquipment";

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
  handler: async (ctx, args) => await listPlannedEquipmentHistory(ctx, args.equipmentId),
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
