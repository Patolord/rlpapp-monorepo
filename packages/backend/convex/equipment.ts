import { v } from "convex/values";
import { authedMutation, authedQuery, staffQuery } from "./lib/functions";

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
    tag: v.optional(v.string()),
    type: v.optional(v.string()),
    location: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    notes: v.optional(v.string()),
    // Token do QR usado como tag default quando não informada.
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
      tag: args.tag?.trim() || args.qrToken,
      type: args.type?.trim() || undefined,
      location: args.location?.trim() || undefined,
      description: args.description.trim(),
      labelPhotoIds: args.labelPhotoIds,
      status: args.status ?? "installing",
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

export const update = authedMutation({
  args: {
    id: v.id("equipment"),
    tag: v.optional(v.string()),
    type: v.optional(v.string()),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
    notes: v.optional(v.string()),
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
