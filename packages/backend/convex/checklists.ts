import { v } from "convex/values";
import {
  authedMutation,
  authedQuery,
  engineeringMutation,
  engineeringQuery,
} from "./lib/functions";
import { logEquipmentHistory } from "./lib/audit";

const checklistItemValidator = v.object({
  label: v.string(),
  required: v.boolean(),
});

// --- Templates de checklist ---

export const listTemplates = engineeringQuery({
  args: { projectId: v.optional(v.id("projects")) },
  returns: v.array(
    v.object({
      _id: v.id("checklistTemplates"),
      projectId: v.union(v.id("projects"), v.null()),
      name: v.string(),
      items: v.array(checklistItemValidator),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("checklistTemplates")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return templates.map((t) => ({
      _id: t._id,
      projectId: t.projectId ?? null,
      name: t.name,
      items: t.items,
      createdAt: t.createdAt,
    }));
  },
});

export const createTemplate = engineeringMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    items: v.array(checklistItemValidator),
  },
  returns: v.id("checklistTemplates"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("O nome do checklist é obrigatório");
    return await ctx.db.insert("checklistTemplates", {
      projectId: args.projectId,
      name,
      items: args.items
        .map((i) => ({ label: i.label.trim(), required: i.required }))
        .filter((i) => i.label),
      createdAt: Date.now(),
    });
  },
});

export const removeTemplate = engineeringMutation({
  args: { templateId: v.id("checklistTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("checklistTemplates", args.templateId);
    return null;
  },
});

// --- Itens de checklist por equipamento ---

// Lista os itens de checklist de um equipamento planejado (público para QR).
export const listForEquipment = authedQuery({
  args: { equipmentId: v.id("projectEquipment") },
  returns: v.array(
    v.object({
      _id: v.id("checklistItems"),
      equipmentId: v.id("projectEquipment"),
      label: v.string(),
      required: v.boolean(),
      completed: v.boolean(),
      completedBy: v.union(v.id("users"), v.null()),
      completedAt: v.union(v.number(), v.null()),
      notes: v.union(v.string(), v.null()),
      order: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("checklistItems")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .collect();
    return items
      .sort((a, b) => a.order - b.order)
      .map((i) => ({
        _id: i._id,
        equipmentId: i.equipmentId,
        label: i.label,
        required: i.required,
        completed: i.completed,
        completedBy: i.completedBy ?? null,
        completedAt: i.completedAt ?? null,
        notes: i.notes ?? null,
        order: i.order,
      }));
  },
});

// Aplica um template de checklist a um equipamento (instancia os itens).
export const applyTemplate = engineeringMutation({
  args: {
    equipmentId: v.id("projectEquipment"),
    templateId: v.id("checklistTemplates"),
    replace: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const equipment = await ctx.db.get("projectEquipment", args.equipmentId);
    if (!equipment) throw new Error("Equipamento não encontrado");
    const template = await ctx.db.get("checklistTemplates", args.templateId);
    if (!template) throw new Error("Template não encontrado");

    if (args.replace) {
      const existing = await ctx.db
        .query("checklistItems")
        .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
        .collect();
      for (const item of existing) {
        await ctx.db.delete("checklistItems", item._id);
      }
    }

    let order = 0;
    for (const item of template.items) {
      await ctx.db.insert("checklistItems", {
        equipmentId: args.equipmentId,
        label: item.label,
        required: item.required,
        completed: false,
        order: order++,
      });
    }
    await ctx.db.patch("projectEquipment", args.equipmentId, {
      checklistTemplateId: args.templateId,
    });
    return template.items.length;
  },
});

// Adiciona um item avulso ao checklist de um equipamento.
export const addItem = engineeringMutation({
  args: {
    equipmentId: v.id("projectEquipment"),
    label: v.string(),
    required: v.optional(v.boolean()),
  },
  returns: v.id("checklistItems"),
  handler: async (ctx, args) => {
    const label = args.label.trim();
    if (!label) throw new Error("Descrição do item é obrigatória");
    const existing = await ctx.db
      .query("checklistItems")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .collect();
    return await ctx.db.insert("checklistItems", {
      equipmentId: args.equipmentId,
      label,
      required: args.required ?? false,
      completed: false,
      order: existing.length,
    });
  },
});

// Marca/desmarca um item de checklist (disponível para técnicos via QR).
export const toggleItem = authedMutation({
  args: {
    itemId: v.id("checklistItems"),
    completed: v.boolean(),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("checklistItems", args.itemId);
    if (!item) throw new Error("Item não encontrado");

    await ctx.db.patch("checklistItems", args.itemId, {
      completed: args.completed,
      completedBy: args.completed ? ctx.user._id : undefined,
      completedAt: args.completed ? Date.now() : undefined,
      notes: args.notes?.trim() || item.notes,
    });
    await logEquipmentHistory(ctx, ctx.user, {
      equipmentId: item.equipmentId,
      action: args.completed ? "checklist_completed" : "checklist_unchecked",
      newValue: item.label,
    });
    return null;
  },
});

export const removeItem = engineeringMutation({
  args: { itemId: v.id("checklistItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("checklistItems", args.itemId);
    return null;
  },
});
