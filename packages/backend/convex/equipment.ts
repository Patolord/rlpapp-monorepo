import { v } from "convex/values";
import {
  authedMutation,
  authedQuery,
  engineeringQuery,
  staffQuery,
} from "./lib/functions";

export const equipmentStatusValidator = v.union(
  v.literal("installing"),
  v.literal("operational"),
  v.literal("warning"),
  v.literal("error")
);

export const get = authedQuery({
  args: { id: v.id("equipment") },
  handler: async (ctx, args) => {
    return await ctx.db.get("equipment", args.id);
  },
});

export const list = staffQuery({
  args: {},
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
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const equipment = await ctx.db.get("equipment", id);
    if (!equipment) throw new Error("Equipment not found");

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) filtered[key] = value;
    }

    await ctx.db.patch("equipment", id, filtered);
    return id;
  },
});

// Equipamentos que ainda não foram alocados a nenhum item de obra.
export const listAssignable = engineeringQuery({
  args: {},
  handler: async (ctx) => {
    const equipment = await ctx.db
      .query("equipment")
      .withIndex("by_projectEquipment", (q) =>
        q.eq("projectEquipmentId", undefined)
      )
      .order("desc")
      .collect();

    return await Promise.all(
      equipment.map(async (e) => {
        const qrCode = await ctx.db
          .query("qrCodes")
          .withIndex("by_equipment", (q) => q.eq("equipmentId", e._id))
          .order("desc")
          .first();
        return {
          _id: e._id,
          description: e.description,
          status: e.status,
          token: qrCode?.token ?? null,
        };
      })
    );
  },
});
