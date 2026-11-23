import { defineTable } from "convex/server";
import { v } from "convex/values";

// Quadro de orçamentos (kanban do dashboard). O quadro é a fonte da verdade:
// etapa, responsáveis, prazo e notas moram aqui. A pasta do orçamento na
// TRELLO do SharePoint (z/Orçamentos/TRELLO) é só conferida: a conferência
// anota onde cada pasta está, e quem gerencia move a pasta para a etapa do card.

/** Etapas do quadro, uma por pasta de etapa da TRELLO. */
export const budgetStage = v.union(
  v.literal("para_fazer"),
  v.literal("em_andamento"),
  v.literal("concluido"),
  v.literal("obsoleto")
);

/** Onde a pasta estava na última conferência; "missing" quando não foi achada em nenhuma etapa. */
export const budgetFolderStage = v.union(budgetStage, v.literal("missing"));

export const budgetBoardTables = {
  budgetCards: defineTable({
    /** Obra ou descrição do orçamento. */
    title: v.string(),
    client: v.optional(v.string()),
    /** Número da proposta ("26.37108PRC"). */
    prcNumber: v.optional(v.string()),
    stage: budgetStage,
    /** Ordem na coluna (fracionária: mover um card não renumera os outros). */
    position: v.number(),
    assigneeIds: v.array(v.id("users")),
    /** Prazo de envio, "AAAA-MM-DD". */
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    /**
     * Pasta do orçamento na TRELLO: id do item no Graph, que não muda quando
     * a pasta é movida ou renomeada; nome e link são os da última conferência.
     */
    folderItemId: v.optional(v.string()),
    folderName: v.optional(v.string()),
    folderWebUrl: v.optional(v.string()),
    folderStage: v.optional(budgetFolderStage),
    folderCheckedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stage_and_position", ["stage", "position"])
    .index("by_folderItemId", ["folderItemId"]),
};
