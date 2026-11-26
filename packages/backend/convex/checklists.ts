import { v } from "convex/values";
import {
  authedMutation,
  authedQuery,
  obrasMutation,
  obrasQuery,
} from "./lib/rbac";
import {
  addChecklistItem,
  applyChecklistTemplate,
  createChecklistTemplate,
  deleteChecklistItem,
  deleteChecklistTemplate,
  listChecklistTemplates,
  listEquipmentChecklist,
  toggleChecklistItem,
} from "./model/engineering/checklists";

const checklistItemValidator = v.object({
  label: v.string(),
  required: v.boolean(),
});

// --- Templates de checklist ---

export const listTemplates = obrasQuery({
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
  handler: async (ctx, args) => await listChecklistTemplates(ctx, args.projectId),
});

export const createTemplate = obrasMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    items: v.array(checklistItemValidator),
  },
  returns: v.id("checklistTemplates"),
  handler: async (ctx, args) => await createChecklistTemplate(ctx, args),
});

export const removeTemplate = obrasMutation({
  args: { templateId: v.id("checklistTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteChecklistTemplate(ctx, args.templateId);
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
  handler: async (ctx, args) => await listEquipmentChecklist(ctx, args.equipmentId),
});

// Aplica um template de checklist a um equipamento (instancia os itens).
export const applyTemplate = obrasMutation({
  args: {
    equipmentId: v.id("projectEquipment"),
    templateId: v.id("checklistTemplates"),
    replace: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => await applyChecklistTemplate(ctx, args),
});

// Adiciona um item avulso ao checklist de um equipamento.
export const addItem = obrasMutation({
  args: {
    equipmentId: v.id("projectEquipment"),
    label: v.string(),
    required: v.optional(v.boolean()),
  },
  returns: v.id("checklistItems"),
  handler: async (ctx, args) => await addChecklistItem(ctx, args),
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
    await toggleChecklistItem(ctx, ctx.user, args);
    return null;
  },
});

export const removeItem = obrasMutation({
  args: { itemId: v.id("checklistItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteChecklistItem(ctx, args.itemId);
    return null;
  },
});
