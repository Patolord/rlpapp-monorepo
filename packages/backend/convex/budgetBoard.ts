import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  quadroOrcamentosMutation,
  quadroOrcamentosQuery,
  quadroOrcamentosReadAction,
  quadroOrcamentosWriteAction,
  requireUser,
} from "./lib/rbac";
import {
  budgetBoardValidator,
  cardFieldsValidator,
  createCard,
  deleteCard,
  listAssignees as listBoardAssignees,
  listBoard,
  moveCard,
  updateCard,
} from "./model/budgetBoard/cards";
import {
  applyFolderCheck as applyCheck,
  folderCheckResultValidator,
  importFolders as importFolderCards,
  linkFolder as linkCardFolder,
  recordFolderMoved as recordMoved,
  scannedFolderValidator,
} from "./model/budgetBoard/folderCheck";
import { moveTrelloFolder, scanTrello } from "./model/sharepoint/trello";
import { budgetFolderStage, budgetStage } from "./schema/budgetBoard";

/**
 * Quadro de orçamentos (Engenharia → Orçamentos). O quadro é a fonte da
 * verdade; as pastas da TRELLO no SharePoint (Projetos/z/Orçamentos/TRELLO)
 * são conferidas: `checkFolders` anota onde está a pasta de cada card e lista
 * as pastas sem card, e `moveFolder` leva a pasta para a etapa do card.
 */

export const list = quadroOrcamentosQuery({
  args: {},
  returns: budgetBoardValidator,
  handler: async (ctx) => {
    return await listBoard(ctx);
  },
});

/** Quem pode ser responsável por um card (usuários ativos que veem o quadro). */
export const listAssignees = quadroOrcamentosQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("users"), name: v.string() })),
  handler: async (ctx) => {
    return await listBoardAssignees(ctx);
  },
});

export const create = quadroOrcamentosMutation({
  args: { ...cardFieldsValidator, stage: budgetStage },
  returns: v.id("budgetCards"),
  handler: async (ctx, args) => {
    return await createCard(ctx, ctx.user, args);
  },
});

export const update = quadroOrcamentosMutation({
  args: { cardId: v.id("budgetCards"), ...cardFieldsValidator },
  returns: v.null(),
  handler: async (ctx, { cardId, ...fields }) => {
    await updateCard(ctx, ctx.user, cardId, fields);
    return null;
  },
});

/** Move o card para a etapa, na posição `index` da coluna (0 = topo). */
export const move = quadroOrcamentosMutation({
  args: { cardId: v.id("budgetCards"), stage: budgetStage, index: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await moveCard(ctx, ctx.user, args.cardId, args.stage, args.index);
    return null;
  },
});

/** Exclui o card do quadro; a pasta no SharePoint fica como está. */
export const remove = quadroOrcamentosMutation({
  args: { cardId: v.id("budgetCards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteCard(ctx, ctx.user, args.cardId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Conferência com as pastas da TRELLO (actions: falam com o Microsoft Graph)
// ---------------------------------------------------------------------------

/**
 * Lê as pastas da TRELLO, anota em cada card onde a pasta dele está e devolve
 * a contagem por etapa e as pastas ativas sem card. Grava só esse retrato da
 * conferência (não muda etapa, responsáveis nem nada do card).
 */
export const checkFolders = quadroOrcamentosReadAction({
  args: {},
  returns: v.object({
    ...folderCheckResultValidator.fields,
    webUrl: v.union(v.string(), v.null()),
    stages: v.array(
      v.object({
        stage: budgetStage,
        name: v.string(),
        webUrl: v.union(v.string(), v.null()),
        folderCount: v.number(),
      })
    ),
  }),
  handler: async (ctx) => {
    const scan = await scanTrello();
    const result: Infer<typeof folderCheckResultValidator> = await ctx.runMutation(
      internal.budgetBoard.applyFolderCheck,
      {
        folders: scan.folders,
        checkedAt: Date.now(),
      }
    );
    return {
      ...result,
      webUrl: scan.webUrl,
      stages: scan.stages.map(({ stage, name, webUrl, folderCount }) => ({
        stage,
        name,
        webUrl,
        folderCount,
      })),
    };
  },
});

/** Cria cards para pastas ativas da TRELLO que ainda não têm card. */
export const importFolders = quadroOrcamentosWriteAction({
  args: { itemIds: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const wanted = new Set(args.itemIds);
    const scan = await scanTrello();
    const folders = scan.folders.filter(
      (folder) =>
        wanted.has(folder.itemId) &&
        (folder.stage === "para_fazer" || folder.stage === "em_andamento")
    );
    const created: number = await ctx.runMutation(internal.budgetBoard.createFromFolders, {
      folders,
    });
    return created;
  },
});

/** Liga o card a uma pasta da TRELLO (achada de novo no servidor pelo id). */
export const linkFolder = quadroOrcamentosWriteAction({
  args: { cardId: v.id("budgetCards"), itemId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scan = await scanTrello();
    const folder = scan.folders.find((candidate) => candidate.itemId === args.itemId);
    if (!folder) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Pasta não encontrada na TRELLO; confira as pastas de novo.",
      });
    }
    await ctx.runMutation(internal.budgetBoard.recordFolderLink, { cardId: args.cardId, folder });
    return null;
  },
});

/** Move a pasta do card, no SharePoint, para a pasta da etapa do card. */
export const moveFolder = quadroOrcamentosWriteAction({
  args: { cardId: v.id("budgetCards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.runQuery(internal.budgetBoard.getCardFolder, { cardId: args.cardId });
    if (!card) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Card não encontrado." });
    }
    if (!card.folderItemId) {
      throw new ConvexError({ code: "NO_FOLDER", message: "Este card não tem pasta na TRELLO." });
    }
    const year = Number(
      new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(
        new Date()
      )
    );
    const moved = await moveTrelloFolder({ itemId: card.folderItemId, stage: card.stage, year });
    await ctx.runMutation(internal.budgetBoard.recordFolderMove, {
      cardId: args.cardId,
      folder: moved,
      previousStage: card.folderStage,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internas (chamadas pelas actions acima)
// ---------------------------------------------------------------------------

export const applyFolderCheck = internalMutation({
  args: { folders: v.array(scannedFolderValidator), checkedAt: v.number() },
  returns: folderCheckResultValidator,
  handler: async (ctx, args) => {
    return await applyCheck(ctx, args.folders, args.checkedAt);
  },
});

export const createFromFolders = internalMutation({
  args: { folders: v.array(scannedFolderValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await importFolderCards(ctx, user, args.folders);
  },
});

export const recordFolderLink = internalMutation({
  args: { cardId: v.id("budgetCards"), folder: scannedFolderValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await linkCardFolder(ctx, user, args.cardId, args.folder);
    return null;
  },
});

export const recordFolderMove = internalMutation({
  args: {
    cardId: v.id("budgetCards"),
    folder: scannedFolderValidator,
    previousStage: v.union(budgetFolderStage, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await recordMoved(ctx, user, args.cardId, args.folder, args.previousStage);
    return null;
  },
});

export const getCardFolder = internalQuery({
  args: { cardId: v.id("budgetCards") },
  returns: v.union(
    v.null(),
    v.object({
      stage: budgetStage,
      folderItemId: v.union(v.string(), v.null()),
      folderStage: v.union(budgetFolderStage, v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const card = await ctx.db.get("budgetCards", args.cardId);
    if (!card) return null;
    return {
      stage: card.stage,
      folderItemId: card.folderItemId ?? null,
      folderStage: card.folderStage ?? null,
    };
  },
});
