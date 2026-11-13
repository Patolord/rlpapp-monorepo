import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logEquipmentHistory } from "../../lib/audit";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Checklists de instalação: modelos (`checklistTemplates`, por obra ou
 * globais) e os itens instanciados para cada equipamento planejado
 * (`checklistItems`).
 */

export type ChecklistItemInput = { label: string; required: boolean };

export async function listChecklistTemplates(
  ctx: QueryCtx,
  projectId: Id<"projects"> | undefined
) {
  const templates = await ctx.db
    .query("checklistTemplates")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return templates.map((t) => ({
    _id: t._id,
    projectId: t.projectId ?? null,
    name: t.name,
    items: t.items,
    createdAt: t.createdAt,
  }));
}

export async function createChecklistTemplate(
  ctx: MutationCtx,
  input: { projectId?: Id<"projects">; name: string; items: ChecklistItemInput[] }
): Promise<Id<"checklistTemplates">> {
  const name = input.name.trim();
  if (!name) throw ruleViolation("O nome do checklist é obrigatório");
  return await ctx.db.insert("checklistTemplates", {
    projectId: input.projectId,
    name,
    items: input.items
      .map((i) => ({ label: i.label.trim(), required: i.required }))
      .filter((i) => i.label),
    createdAt: Date.now(),
  });
}

export async function deleteChecklistTemplate(
  ctx: MutationCtx,
  templateId: Id<"checklistTemplates">
): Promise<void> {
  await ctx.db.delete("checklistTemplates", templateId);
}

async function equipmentChecklist(ctx: QueryCtx, equipmentId: Id<"projectEquipment">) {
  return await ctx.db
    .query("checklistItems")
    .withIndex("by_equipment", (q) => q.eq("equipmentId", equipmentId))
    .collect();
}

/** Itens do checklist de um equipamento planejado, na ordem de execução. */
export async function listEquipmentChecklist(
  ctx: QueryCtx,
  equipmentId: Id<"projectEquipment">
) {
  const items = await equipmentChecklist(ctx, equipmentId);
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
}

/**
 * Aplica um template de checklist a um equipamento planejado (opcionalmente
 * substituindo os itens atuais) e devolve quantos itens foram criados. Sem
 * `replace`, os itens novos entram depois dos que já existem.
 */
export async function applyChecklistTemplate(
  ctx: MutationCtx,
  args: {
    equipmentId: Id<"projectEquipment">;
    templateId: Id<"checklistTemplates">;
    replace?: boolean;
  }
): Promise<number> {
  const equipment = await ctx.db.get("projectEquipment", args.equipmentId);
  if (!equipment) throw notFound("Equipamento não encontrado");
  const template = await ctx.db.get("checklistTemplates", args.templateId);
  if (!template) throw notFound("Template não encontrado");

  const existing = await equipmentChecklist(ctx, args.equipmentId);
  if (args.replace) {
    for (const item of existing) {
      await ctx.db.delete("checklistItems", item._id);
    }
  }

  let order = args.replace ? 0 : existing.length;
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
}

/** Item avulso no fim do checklist de um equipamento. */
export async function addChecklistItem(
  ctx: MutationCtx,
  input: { equipmentId: Id<"projectEquipment">; label: string; required?: boolean }
): Promise<Id<"checklistItems">> {
  const label = input.label.trim();
  if (!label) throw ruleViolation("Descrição do item é obrigatória");
  const existing = await equipmentChecklist(ctx, input.equipmentId);
  return await ctx.db.insert("checklistItems", {
    equipmentId: input.equipmentId,
    label,
    required: input.required ?? false,
    completed: false,
    order: existing.length,
  });
}

/** Marca ou desmarca um item e registra no histórico do equipamento. */
export async function toggleChecklistItem(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { itemId: Id<"checklistItems">; completed: boolean; notes?: string }
): Promise<void> {
  const item = await ctx.db.get("checklistItems", input.itemId);
  if (!item) throw notFound("Item não encontrado");

  await ctx.db.patch("checklistItems", input.itemId, {
    completed: input.completed,
    completedBy: input.completed ? user._id : undefined,
    completedAt: input.completed ? Date.now() : undefined,
    notes: input.notes?.trim() || item.notes,
  });
  await logEquipmentHistory(ctx, user, {
    equipmentId: item.equipmentId,
    action: input.completed ? "checklist_completed" : "checklist_unchecked",
    newValue: item.label,
  });
}

export async function deleteChecklistItem(
  ctx: MutationCtx,
  itemId: Id<"checklistItems">
): Promise<void> {
  await ctx.db.delete("checklistItems", itemId);
}
