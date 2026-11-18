import { hasPermission } from "@rlpapp/shared/auth/permissions";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";
import { budgetFolderStage, budgetStage } from "../../schema/budgetBoard";

/**
 * Cards do quadro de orçamentos: criar, editar, mover e excluir. O quadro é a
 * fonte da verdade; a pasta na TRELLO é conferida em folderCheck.ts.
 */

export type BudgetStage = Infer<typeof budgetStage>;

export const BUDGET_STAGES: readonly BudgetStage[] = [
  "para_fazer",
  "em_andamento",
  "concluido",
  "obsoleto",
];

/** Etapas que o quadro mostra inteiras; as demais só os cards mais recentes. */
const ACTIVE_STAGES: readonly BudgetStage[] = ["para_fazer", "em_andamento"];
const ACTIVE_LIMIT = 500;
const ARCHIVE_LIMIT = 50;

const MAX_TITLE = 200;
const MAX_FIELD = 120;
const MAX_NOTES = 5000;
const MAX_ASSIGNEES = 10;

const STAGE_LABELS: Record<BudgetStage, string> = {
  para_fazer: "Para Fazer",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  obsoleto: "Obsoletos",
};

export const budgetCardViewValidator = v.object({
  _id: v.id("budgetCards"),
  title: v.string(),
  client: v.union(v.string(), v.null()),
  prcNumber: v.union(v.string(), v.null()),
  stage: budgetStage,
  position: v.number(),
  assignees: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  dueDate: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  folder: v.union(
    v.null(),
    v.object({
      itemId: v.string(),
      name: v.union(v.string(), v.null()),
      webUrl: v.union(v.string(), v.null()),
      /** Onde a pasta estava na última conferência; null se nunca conferida. */
      stage: v.union(budgetFolderStage, v.null()),
      checkedAt: v.union(v.number(), v.null()),
    })
  ),
  updatedAt: v.number(),
});

export const budgetBoardValidator = v.object({
  cards: v.array(budgetCardViewValidator),
  /** Etapas com mais cards do que os listados (Concluído e Obsoletos mostram só os recentes). */
  truncated: v.array(budgetStage),
});

export type BudgetCardView = Infer<typeof budgetCardViewValidator>;

async function stageCards(ctx: QueryCtx, stage: BudgetStage, limit: number) {
  return await ctx.db
    .query("budgetCards")
    .withIndex("by_stage_and_position", (q) => q.eq("stage", stage))
    .take(limit);
}

export async function listBoard(ctx: QueryCtx): Promise<Infer<typeof budgetBoardValidator>> {
  const truncated: BudgetStage[] = [];
  const perStage = await Promise.all(
    BUDGET_STAGES.map(async (stage) => {
      const limit = ACTIVE_STAGES.includes(stage) ? ACTIVE_LIMIT : ARCHIVE_LIMIT;
      const cards = await stageCards(ctx, stage, limit + 1);
      if (cards.length > limit) truncated.push(stage);
      return cards.slice(0, limit);
    })
  );
  const cards = perStage.flat();
  const userIds = [...new Set(cards.flatMap((card) => card.assigneeIds))];
  const users = new Map<Id<"users">, string>();
  for (const id of userIds) {
    const user = await ctx.db.get("users", id);
    if (user) users.set(id, user.name);
  }
  return {
    cards: cards.map((card) => toView(card, users)),
    truncated: BUDGET_STAGES.filter((stage) => truncated.includes(stage)),
  };
}

function toView(card: Doc<"budgetCards">, users: Map<Id<"users">, string>): BudgetCardView {
  return {
    _id: card._id,
    title: card.title,
    client: card.client ?? null,
    prcNumber: card.prcNumber ?? null,
    stage: card.stage,
    position: card.position,
    assignees: card.assigneeIds.flatMap((id) => {
      const name = users.get(id);
      return name === undefined ? [] : [{ _id: id, name }];
    }),
    dueDate: card.dueDate ?? null,
    notes: card.notes ?? null,
    folder: card.folderItemId
      ? {
          itemId: card.folderItemId,
          name: card.folderName ?? null,
          webUrl: card.folderWebUrl ?? null,
          stage: card.folderStage ?? null,
          checkedAt: card.folderCheckedAt ?? null,
        }
      : null,
    updatedAt: card.updatedAt,
  };
}

/** Quem pode ser responsável por um card: usuários ativos que veem o quadro. */
export async function listAssignees(ctx: QueryCtx) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect();
  return users
    .filter((user) => hasPermission(user, "orcamentos.quadro.read"))
    .map((user) => ({ _id: user._id, name: user.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Validação dos campos
// ---------------------------------------------------------------------------

function invalid(message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code: "INVALID_CARD", message });
}

function cleanText(value: string | null | undefined, max: number, label: string) {
  if (value === null || value === undefined) return undefined;
  const text = value.trim();
  if (text.length > max) throw invalid(`${label} com mais de ${max} caracteres.`);
  return text.length > 0 ? text : undefined;
}

function cleanTitle(value: string): string {
  const title = cleanText(value, MAX_TITLE, "Título");
  if (!title) throw invalid("Informe o título do card.");
  return title;
}

function cleanDueDate(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw invalid("Prazo inválido: use a data no formato AAAA-MM-DD.");
  }
  return value;
}

async function cleanAssignees(ctx: QueryCtx, ids: readonly Id<"users">[]): Promise<Id<"users">[]> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_ASSIGNEES) throw invalid(`No máximo ${MAX_ASSIGNEES} responsáveis.`);
  for (const id of unique) {
    const user = await ctx.db.get("users", id);
    if (!user || !user.isActive) throw invalid("Responsável inexistente ou inativo.");
  }
  return unique;
}

async function getCard(ctx: QueryCtx, cardId: Id<"budgetCards">): Promise<Doc<"budgetCards">> {
  const card = await ctx.db.get("budgetCards", cardId);
  if (!card) throw new ConvexError({ code: "NOT_FOUND", message: "Card não encontrado." });
  return card;
}

/** Posição para entrar no topo da coluna. */
async function topPosition(ctx: QueryCtx, stage: BudgetStage): Promise<number> {
  const first = await ctx.db
    .query("budgetCards")
    .withIndex("by_stage_and_position", (q) => q.eq("stage", stage))
    .first();
  return first ? first.position - 1 : 0;
}

function cardLabel(card: { title: string; client?: string; prcNumber?: string }): string {
  return [card.prcNumber, card.client, card.title].filter(Boolean).join(" - ");
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

export const cardFieldsValidator = {
  title: v.string(),
  client: v.optional(v.union(v.string(), v.null())),
  prcNumber: v.optional(v.union(v.string(), v.null())),
  assigneeIds: v.optional(v.array(v.id("users"))),
  dueDate: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
};

export interface NewCardInput {
  title: string;
  client?: string | null;
  prcNumber?: string | null;
  stage: BudgetStage;
  assigneeIds?: Id<"users">[];
  dueDate?: string | null;
  notes?: string | null;
  folder?: { itemId: string; name: string; webUrl: string | null; stage: BudgetStage };
}

export async function createCard(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: NewCardInput
): Promise<Id<"budgetCards">> {
  const now = Date.now();
  const card = {
    title: cleanTitle(input.title),
    client: cleanText(input.client, MAX_FIELD, "Cliente"),
    prcNumber: cleanText(input.prcNumber, MAX_FIELD, "Número da proposta"),
    stage: input.stage,
    position: await topPosition(ctx, input.stage),
    assigneeIds: await cleanAssignees(ctx, input.assigneeIds ?? []),
    dueDate: cleanDueDate(input.dueDate),
    notes: cleanText(input.notes, MAX_NOTES, "Notas"),
    folderItemId: input.folder?.itemId,
    folderName: input.folder?.name,
    folderWebUrl: input.folder?.webUrl ?? undefined,
    folderStage: input.folder?.stage,
    folderCheckedAt: input.folder ? now : undefined,
    createdBy: user._id,
    createdAt: now,
    updatedAt: now,
  };
  const cardId = await ctx.db.insert("budgetCards", card);
  await logAudit(ctx, user, {
    action: "create",
    tableName: "budgetCards",
    recordId: cardId,
    entityLabel: cardLabel(card),
    details: input.folder
      ? `Card criado em ${STAGE_LABELS[card.stage]} a partir da pasta "${input.folder.name}"`
      : `Card criado em ${STAGE_LABELS[card.stage]}`,
    source: "quadro_orcamentos",
  });
  return cardId;
}

export async function updateCard(
  ctx: MutationCtx,
  user: Doc<"users">,
  cardId: Id<"budgetCards">,
  input: {
    title: string;
    client?: string | null;
    prcNumber?: string | null;
    assigneeIds?: Id<"users">[];
    dueDate?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const card = await getCard(ctx, cardId);
  const next = {
    title: cleanTitle(input.title),
    client: input.client === undefined ? card.client : cleanText(input.client, MAX_FIELD, "Cliente"),
    prcNumber:
      input.prcNumber === undefined
        ? card.prcNumber
        : cleanText(input.prcNumber, MAX_FIELD, "Número da proposta"),
    assigneeIds:
      input.assigneeIds === undefined ? card.assigneeIds : await cleanAssignees(ctx, input.assigneeIds),
    dueDate: input.dueDate === undefined ? card.dueDate : cleanDueDate(input.dueDate),
    notes: input.notes === undefined ? card.notes : cleanText(input.notes, MAX_NOTES, "Notas"),
  };
  const changes = diffFields(
    { ...card, assigneeIds: card.assigneeIds.join(",") },
    { ...card, ...next, assigneeIds: next.assigneeIds.join(",") },
    ["title", "client", "prcNumber", "assigneeIds", "dueDate", "notes"]
  );
  if (changes.length === 0) return;
  await ctx.db.patch("budgetCards", cardId, { ...next, updatedAt: Date.now() });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "budgetCards",
    recordId: cardId,
    entityLabel: cardLabel({ ...card, ...next }),
    changes,
    source: "quadro_orcamentos",
  });
}

/**
 * Move o card para `stage`, na posição `index` da coluna (0 = topo). A posição
 * fica entre os vizinhos, sem renumerar a coluna.
 */
export async function moveCard(
  ctx: MutationCtx,
  user: Doc<"users">,
  cardId: Id<"budgetCards">,
  stage: BudgetStage,
  index: number
): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw invalid("Posição inválida.");
  const card = await getCard(ctx, cardId);
  const column = (await stageCards(ctx, stage, ACTIVE_LIMIT + 1)).filter(
    (other) => other._id !== cardId
  );
  const at = Math.min(index, column.length);
  const before = column[at - 1];
  const after = column[at];
  const position =
    before && after
      ? (before.position + after.position) / 2
      : before
        ? before.position + 1
        : after
          ? after.position - 1
          : 0;
  await ctx.db.patch("budgetCards", cardId, { stage, position, updatedAt: Date.now() });
  if (card.stage !== stage) {
    await logAudit(ctx, user, {
      action: "update",
      tableName: "budgetCards",
      recordId: cardId,
      entityLabel: cardLabel(card),
      details: `Card movido de ${STAGE_LABELS[card.stage]} para ${STAGE_LABELS[stage]}`,
      changes: [{ field: "stage", previousValue: card.stage, newValue: stage }],
      source: "quadro_orcamentos",
    });
  }
}

export async function deleteCard(
  ctx: MutationCtx,
  user: Doc<"users">,
  cardId: Id<"budgetCards">
): Promise<void> {
  const card = await getCard(ctx, cardId);
  await ctx.db.delete("budgetCards", cardId);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "budgetCards",
    recordId: cardId,
    entityLabel: cardLabel(card),
    details: "Card excluído do quadro (a pasta no SharePoint não é apagada)",
    snapshotBefore: card,
    source: "quadro_orcamentos",
  });
}

export { STAGE_LABELS as BUDGET_STAGE_LABELS };
