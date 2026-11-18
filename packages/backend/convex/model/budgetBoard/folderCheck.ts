import { parseOrcamentoName } from "@rlpapp/shared/engenharia/orcamentoName";
import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { budgetStage } from "../../schema/budgetBoard";
import { BUDGET_STAGE_LABELS, createCard, type BudgetStage } from "./cards";

/**
 * Conferência entre o quadro e as pastas da TRELLO. O quadro manda; a pasta
 * só é conferida:
 *
 * - cada card com pasta ganha a etapa onde a pasta está agora (folderStage),
 *   e a tela marca o card quando ela difere da etapa do card;
 * - pastas em Para Fazer ou Em Andamento sem card aparecem como "sem card",
 *   para virar card ou ser arrumadas;
 * - Concluído e Obsoletos (e os "Ultrapassados" de Para Fazer) só contam:
 *   são o histórico, e pasta antiga sem card ali não é pendência.
 */

/** Etapas em que uma pasta sem card é pendência. */
const ACTIVE_STAGES: readonly BudgetStage[] = ["para_fazer", "em_andamento"];

export const scannedFolderValidator = v.object({
  itemId: v.string(),
  name: v.string(),
  webUrl: v.union(v.string(), v.null()),
  modifiedAt: v.union(v.number(), v.null()),
  stage: budgetStage,
  group: v.union(v.string(), v.null()),
});

export type ScannedFolder = Infer<typeof scannedFolderValidator>;

export const folderCheckResultValidator = v.object({
  checkedAt: v.number(),
  /** Pastas em Para Fazer ou Em Andamento que nenhum card aponta. */
  orphans: v.array(scannedFolderValidator),
  /** Cards cuja pasta não foi achada em nenhuma etapa (apagada ou movida para fora). */
  missing: v.number(),
});

/**
 * Grava em cada card com pasta onde ela está agora e devolve as pastas
 * ativas sem card. Percorre só os cards com pasta (índice by_folderItemId).
 */
export async function applyFolderCheck(
  ctx: MutationCtx,
  folders: readonly ScannedFolder[],
  checkedAt: number
): Promise<Infer<typeof folderCheckResultValidator>> {
  const byItem = new Map(folders.map((folder) => [folder.itemId, folder]));
  const linked = new Set<string>();
  let missing = 0;
  const cards = ctx.db
    .query("budgetCards")
    .withIndex("by_folderItemId", (q) => q.gt("folderItemId", ""));
  for await (const card of cards) {
    const itemId = card.folderItemId!;
    linked.add(itemId);
    const folder = byItem.get(itemId);
    if (!folder) missing += 1;
    const patch = folder
      ? {
          folderStage: folder.stage,
          folderName: folder.name,
          folderWebUrl: folder.webUrl ?? undefined,
          folderCheckedAt: checkedAt,
        }
      : { folderStage: "missing" as const, folderCheckedAt: checkedAt };
    if (
      card.folderStage !== patch.folderStage ||
      ("folderName" in patch && card.folderName !== patch.folderName) ||
      ("folderWebUrl" in patch && card.folderWebUrl !== patch.folderWebUrl) ||
      card.folderCheckedAt === undefined
    ) {
      await ctx.db.patch("budgetCards", card._id, patch);
    }
  }
  const orphans = folders.filter(
    (folder) => ACTIVE_STAGES.includes(folder.stage) && !linked.has(folder.itemId)
  );
  return { checkedAt, orphans, missing };
}

async function folderAlreadyLinked(ctx: MutationCtx, itemId: string) {
  return await ctx.db
    .query("budgetCards")
    .withIndex("by_folderItemId", (q) => q.eq("folderItemId", itemId))
    .first();
}

/**
 * Cria um card para cada pasta (vindas da conferência no servidor, não do
 * navegador), na etapa onde a pasta está, com número, cliente e obra lidos do
 * nome. Pastas que já têm card são puladas. Devolve quantos cards criou.
 */
export async function importFolders(
  ctx: MutationCtx,
  user: Doc<"users">,
  folders: readonly ScannedFolder[]
): Promise<number> {
  let created = 0;
  for (const folder of folders) {
    if (await folderAlreadyLinked(ctx, folder.itemId)) continue;
    const { code, title, subtitle } = parseOrcamentoName(folder.name);
    await createCard(ctx, user, {
      title: subtitle ?? title,
      client: subtitle ? title : null,
      prcNumber: code,
      stage: folder.stage,
      folder: { itemId: folder.itemId, name: folder.name, webUrl: folder.webUrl, stage: folder.stage },
    });
    created += 1;
  }
  return created;
}

/** Liga um card a uma pasta da TRELLO que ainda não tem card. */
export async function linkFolder(
  ctx: MutationCtx,
  user: Doc<"users">,
  cardId: Id<"budgetCards">,
  folder: ScannedFolder
): Promise<void> {
  const card = await ctx.db.get("budgetCards", cardId);
  if (!card) throw new ConvexError({ code: "NOT_FOUND", message: "Card não encontrado." });
  const other = await folderAlreadyLinked(ctx, folder.itemId);
  if (other && other._id !== cardId) {
    throw new ConvexError({
      code: "ALREADY_LINKED",
      message: `A pasta "${folder.name}" já está ligada ao card "${other.title}".`,
    });
  }
  await ctx.db.patch("budgetCards", cardId, {
    folderItemId: folder.itemId,
    folderName: folder.name,
    folderWebUrl: folder.webUrl ?? undefined,
    folderStage: folder.stage,
    folderCheckedAt: Date.now(),
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "budgetCards",
    recordId: cardId,
    entityLabel: card.title,
    details: `Card ligado à pasta "${folder.name}" (${BUDGET_STAGE_LABELS[folder.stage]})`,
    source: "quadro_orcamentos",
  });
}

/** Registra que a pasta do card foi movida para a etapa dele no SharePoint. */
export async function recordFolderMoved(
  ctx: MutationCtx,
  user: Doc<"users">,
  cardId: Id<"budgetCards">,
  folder: ScannedFolder,
  previousStage: BudgetStage | "missing" | null
): Promise<void> {
  const card = await ctx.db.get("budgetCards", cardId);
  if (!card) return;
  await ctx.db.patch("budgetCards", cardId, {
    folderName: folder.name,
    folderWebUrl: folder.webUrl ?? undefined,
    folderStage: folder.stage,
    folderCheckedAt: Date.now(),
  });
  const from = previousStage && previousStage !== "missing" ? BUDGET_STAGE_LABELS[previousStage] : "?";
  await logAudit(ctx, user, {
    action: "update",
    tableName: "budgetCards",
    recordId: cardId,
    entityLabel: card.title,
    details: `Pasta "${folder.name}" movida no SharePoint de ${from} para ${BUDGET_STAGE_LABELS[folder.stage]}`,
    source: "quadro_orcamentos",
  });
}
