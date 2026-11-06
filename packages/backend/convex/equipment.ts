import { v } from "convex/values";
import { authedMutation, authedQuery, obrasQuery, staffQuery } from "./lib/rbac";
import {
  assignableEquipmentValidator,
  equipmentDocValidator,
  listAssignableEquipment,
  updateEquipment,
} from "./model/engineering/equipmentRecords";
import { equipmentStatusValidator } from "./schema/engineering";

export const get = authedQuery({
  args: { id: v.id("equipment") },
  returns: v.union(equipmentDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("equipment", args.id);
  },
});

const engineeringEquipmentReturn = v.object({
  _id: v.id("equipment"),
  description: v.union(v.string(), v.null()),
  status: equipmentStatusValidator,
  createdAt: v.number(),
  projectEquipmentId: v.union(v.id("projectEquipment"), v.null()),
  createdByUserId: v.union(v.id("users"), v.null()),
  tag: v.union(v.string(), v.null()),
  type: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
});

export const getForEngineering = obrasQuery({
  args: { id: v.id("equipment") },
  returns: v.union(engineeringEquipmentReturn, v.null()),
  handler: async (ctx, args) => {
    const equipment = await ctx.db.get("equipment", args.id);
    if (!equipment) return null;
    return {
      _id: equipment._id,
      description: equipment.description ?? null,
      status: equipment.status,
      createdAt: equipment.createdAt,
      projectEquipmentId: equipment.projectEquipmentId ?? null,
      createdByUserId: equipment.createdByUserId ?? null,
      tag: equipment.tag ?? null,
      type: equipment.type ?? null,
      notes: equipment.notes ?? null,
    };
  },
});

export const list = staffQuery({
  args: {},
  returns: v.array(equipmentDocValidator),
  handler: async (ctx) => {
    return await ctx.db.query("equipment").order("desc").collect();
  },
});

export const create = authedMutation({
  args: {
    // Cadastro simplificado: descrição + foto da etiqueta são o mínimo.
    description: v.string(),
    labelPhotoIds: v.array(v.id("_storage")),
    status: v.optional(equipmentStatusValidator),
    // Token do QR mantido por compatibilidade com chamadas existentes.
    qrToken: v.optional(v.string()),
  },
  returns: v.id("equipment"),
  handler: async (ctx, args) => {
    if (!args.description.trim()) {
      throw new Error("Descrição é obrigatória");
    }
    if (args.labelPhotoIds.length === 0) {
      throw new Error("É obrigatório anexar pelo menos uma foto da etiqueta");
    }

    return await ctx.db.insert("equipment", {
      description: args.description.trim(),
      labelPhotoIds: args.labelPhotoIds,
      status: args.status ?? "installing",
      createdAt: Date.now(),
      createdByUserId: ctx.user._id,
    });
  },
});

export const update = authedMutation({
  args: {
    id: v.id("equipment"),
    description: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    projectEquipmentId: v.optional(v.id("projectEquipment")),
  },
  returns: v.id("equipment"),
  handler: async (ctx, args) => await updateEquipment(ctx, args),
});

// Equipamentos que ainda não foram alocados a nenhum item de obra.
export const listAssignable = obrasQuery({
  args: {},
  returns: v.array(assignableEquipmentValidator),
  handler: async (ctx) => await listAssignableEquipment(ctx),
});
