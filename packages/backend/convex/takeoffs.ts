import { v } from "convex/values";
import {
  authedQuery,
  engineeringOrPurchasingQuery,
  materiaisMutation,
  orcamentosMutation,
} from "./lib/rbac";
import { materialDimensions, takeoffItemStatus } from "./schema/procurement";
import {
  desktopPublishOptions as desktopPublishOptionsFor,
  desktopPublishOptionsArgs,
  desktopPublishOptionsResult,
  publishDesktopBudgetArgs,
  publishDesktopBudgetResult,
  removeDesktopBudgetArgs,
  removeDesktopBudgetResult,
} from "./model/procurement/desktopBudget";
import {
  addTakeoffItem,
  applySuggestedTakeoffItemPrice,
  promoteTakeoffItemToMaterial,
  removeTakeoffItem,
  updateTakeoffItem,
} from "./model/procurement/takeoffItems";
import {
  createTakeoff,
  getTakeoffWithItems,
  listTakeoffs,
  publishTakeoffFromDesktop,
  removeDesktopTakeoffInApp,
  removeTakeoffFromDesktop,
} from "./model/procurement/takeoffs";
import {
  takeoffItemValidator,
  takeoffValidator,
} from "./model/procurement/takeoffValidators";

export const list = engineeringOrPurchasingQuery({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  returns: v.array(takeoffValidator),
  handler: async (ctx, args) => {
    return await listTakeoffs(ctx, args);
  },
});

export const get = engineeringOrPurchasingQuery({
  args: {
    takeoffId: v.id("takeoffs"),
    now: v.number(),
  },
  returns: v.union(
    v.object({
      takeoff: takeoffValidator,
      items: v.array(takeoffItemValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await getTakeoffWithItems(ctx, args);
  },
});

export const create = orcamentosMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
  },
  returns: v.id("takeoffs"),
  handler: async (ctx, args) => {
    return await createTakeoff(ctx, ctx.user, args);
  },
});

export const addItem = orcamentosMutation({
  args: {
    takeoffId: v.id("takeoffs"),
    rawDescription: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    customDimensions: v.optional(materialDimensions),
    customSpecification: v.optional(v.string()),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  returns: v.id("takeoffItems"),
  handler: async (ctx, args) => {
    return await addTakeoffItem(ctx, args);
  },
});

export const updateItem = orcamentosMutation({
  args: {
    itemId: v.id("takeoffItems"),
    rawDescription: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    customDimensions: v.optional(materialDimensions),
    customSpecification: v.optional(v.string()),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(takeoffItemStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateTakeoffItem(ctx, args);
    return null;
  },
});

export const promoteItemToMaterial = materiaisMutation({
  args: {
    itemId: v.id("takeoffItems"),
    familyName: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.object({
    materialId: v.id("materials"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return await promoteTakeoffItemToMaterial(ctx, ctx.user, args);
  },
});

export const removeItem = orcamentosMutation({
  args: { itemId: v.id("takeoffItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeTakeoffItem(ctx, args.itemId);
    return null;
  },
});

export const applySuggestedPrice = orcamentosMutation({
  args: {
    itemId: v.id("takeoffItems"),
    unitPriceCents: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applySuggestedTakeoffItemPrice(ctx, args);
    return null;
  },
});

/**
 * Para o app desktop antes de enviar um orçamento aprovado: se o usuário pode
 * enviar, as obras para escolher e onde este projeto já foi enviado.
 *
 * Qualquer usuário autenticado pode chamar: sem `engenharia.write` a resposta
 * diz `canPublish: false` (sem obras), para o desktop explicar a falta de
 * permissão — o erro do wrapper de permissão chega como "Server Error" em
 * produção.
 */
export const desktopPublishOptions = authedQuery({
  args: desktopPublishOptionsArgs,
  returns: desktopPublishOptionsResult,
  handler: async (ctx, args) => {
    return await desktopPublishOptionsFor(ctx, ctx.user, args.externalId);
  },
});

/**
 * Publica (ou republica) o orçamento aprovado pelo cliente, enviado pelo app
 * desktop de takeoff. Idempotente por `externalId`: cria o takeoff na primeira
 * vez e depois atualiza linhas por `externalLineId`, apagando as que saíram do
 * orçamento — menos as que a Compras já cotou ou levou adiante, que o desktop
 * não altera nem apaga e voltam em `kept`. Só aceita orçamentos em reais (BRL).
 * Falhas esperadas: `ConvexError` com os códigos de
 * `DESKTOP_BUDGET_ERROR_CODES`.
 */
export const publishFromDesktop = orcamentosMutation({
  args: publishDesktopBudgetArgs,
  returns: publishDesktopBudgetResult,
  handler: async (ctx, args) => {
    return await publishTakeoffFromDesktop(ctx, ctx.user, args);
  },
});

/**
 * Remove o orçamento publicado pelo app desktop com este `externalId`, com
 * suas linhas (o desktop desfaz um envio). Recusa com `BUDGET_IN_USE` se a
 * Compras já trabalhou nele (cotação, compra em andamento, linha adicionada
 * no app) e com `BUDGET_NOT_FOUND` se não há orçamento com este id.
 */
export const removeFromDesktop = orcamentosMutation({
  args: removeDesktopBudgetArgs,
  returns: removeDesktopBudgetResult,
  handler: async (ctx, args) => {
    return await removeTakeoffFromDesktop(ctx, ctx.user, args);
  },
});

/**
 * Remove, pelo app, um orçamento publicado pelo app desktop (com suas
 * linhas). Mesmas recusas de `removeFromDesktop`: `BUDGET_IN_USE` quando a
 * Compras já trabalhou nele, `BUDGET_NOT_FOUND` se não existe; e só takeoffs
 * de origem desktop (`INVALID_BUDGET` para os manuais).
 */
export const remove = orcamentosMutation({
  args: { takeoffId: v.id("takeoffs") },
  returns: removeDesktopBudgetResult,
  handler: async (ctx, args) => {
    return await removeDesktopTakeoffInApp(ctx, ctx.user, args.takeoffId);
  },
});
