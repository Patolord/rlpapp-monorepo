import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  precosMutation,
  purchasingQuery,
} from "./lib/rbac";
import {
  materialDimensions,
  priceEventReviewStatus,
  priceEventSource,
} from "./schema/procurement";
import { suggestPriceEstimate } from "./model/procurement/priceEstimates";
import {
  addPriceEvent,
  listPriceReviewQueue,
  updatePriceEventReview,
} from "./model/procurement/priceEventReview";
import {
  getMaterialPriceHistory,
  getPriceDashboardStats,
  listLatestPricesForMaterial,
  listPriceEvents,
} from "./model/procurement/priceEvents";
import {
  estimateSuggestionValidator,
  priceEventValidator,
  priceHistoryValidator,
} from "./model/procurement/priceEventValidators";
import {
  getFamilyPriceHistory,
  setFamilyDefaultVariant as setDefaultVariant,
} from "./model/procurement/familyPriceHistory";
import { materialReferenceStats } from "./model/procurement/priceHistory";
import {
  familyPriceHistoryValidator,
  referenceStatsValidator,
} from "./model/procurement/quoteValidators";

export const list = engineeringOrPurchasingQuery({
  args: {
    now: v.number(),
    materialId: v.optional(v.id("materials")),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    supplierId: v.optional(v.id("suppliers")),
    /** Período de `occurredAt` (ms, inclusivo). */
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    return await listPriceEvents(ctx, args);
  },
});

export const latestForMaterial = engineeringOrPurchasingQuery({
  args: {
    materialId: v.optional(v.id("materials")),
    rawDescription: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    return await listLatestPricesForMaterial(ctx, args);
  },
});

/**
 * Histórico de preços de um material com variação: série cronológica na
 * unidade de referência (cada ponto comparado ao anterior do mesmo
 * fornecedor), último preço por fornecedor e resumo (30/90 dias, mín/máx).
 */
export const historyForMaterial = engineeringOrPurchasingQuery({
  args: {
    materialId: v.id("materials"),
    now: v.number(),
  },
  returns: priceHistoryValidator,
  handler: async (ctx, args) => {
    return await getMaterialPriceHistory(ctx, args);
  },
});

/**
 * Histórico de um equipamento comparável: a família do material (ou a
 * informada), cada variante com a referência de orçamento (mediana dos últimos
 * 6 meses, faixa, dispersão, variação mensal) e todas as cotações dos últimos
 * `monthsBack` meses (12 por padrão), de todos os fornecedores.
 */
export const familyHistory = engineeringOrPurchasingQuery({
  args: {
    familyId: v.optional(v.id("materialFamilies")),
    materialId: v.optional(v.id("materials")),
    now: v.number(),
    monthsBack: v.optional(v.number()),
  },
  returns: familyPriceHistoryValidator,
  handler: async (ctx, args) => {
    return await getFamilyPriceHistory(ctx, args);
  },
});

/**
 * Referência de orçamento de um material: mediana das cotações de
 * fornecedores dos últimos 6 meses, faixa, dispersão, variação mensal e
 * situação (ok | wide | stale), em `reference` (null sem cotação na parte
 * lida). `truncated` diz que a janela não foi lida inteira.
 */
export const materialReference = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials"), now: v.number() },
  returns: v.object({
    reference: v.union(referenceStatsValidator, v.null()),
    /** A janela não foi lida inteira: com reference null, pode haver cotação além. */
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const material = await ctx.db.get("materials", args.materialId);
    if (!material) return { reference: null, truncated: false };
    return await materialReferenceStats(ctx, material, args.now);
  },
});

/** Escolhe a variante de referência de preço da família (null limpa). */
export const setFamilyDefaultVariant = precosMutation({
  args: {
    familyId: v.id("materialFamilies"),
    materialId: v.union(v.id("materials"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setDefaultVariant(ctx, ctx.user, args);
    return null;
  },
});

export const add = precosMutation({
  args: {
    rawDescription: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
    supplierNameRaw: v.optional(v.string()),
    unitPriceCents: v.number(),
    unit: v.optional(v.string()),
    quantity: v.optional(v.number()),
    source: priceEventSource,
    occurredAt: v.number(),
    validUntil: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    /**
     * Item do takeoff cotado. Preenche material, takeoff, obra, unidade,
     * descrição e medidas a partir do item; um item sem material ganha o SKU
     * da sua medida, para a cotação contar na família.
     */
    takeoffItemId: v.optional(v.id("takeoffItems")),
    /** Medidas do item cotado (fabricados sob medida). */
    dimensions: v.optional(materialDimensions),
    notes: v.optional(v.string()),
    /** Proposta do fornecedor de onde veio o preço (quoteProposals). */
    quoteProposalId: v.optional(v.id("quoteProposals")),
  },
  returns: v.id("priceEvents"),
  handler: async (ctx, args) => {
    return await addPriceEvent(ctx, ctx.user, args);
  },
});

/**
 * Estimativa por tamanho para um item fabricado sob medida, a partir das
 * cotações da mesma família de material. A família vem do material, do id
 * informado ou do nome (descrição livre). Devolve o método usado (medida
 * exata, vizinhos de tamanho próximo ou curva ajustada), a confiança e os
 * precedentes considerados.
 */
export const suggestEstimate = engineeringOrPurchasingQuery({
  args: {
    materialId: v.optional(v.id("materials")),
    familyId: v.optional(v.id("materialFamilies")),
    familyName: v.optional(v.string()),
    dimensions: materialDimensions,
    supplierId: v.optional(v.id("suppliers")),
    now: v.number(),
  },
  returns: estimateSuggestionValidator,
  handler: async (ctx, args) => {
    return await suggestPriceEstimate(ctx, args);
  },
});

export const reviewQueue = purchasingQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    return await listPriceReviewQueue(ctx, args);
  },
});

export const updateReview = precosMutation({
  args: {
    eventId: v.id("priceEvents"),
    reviewStatus: priceEventReviewStatus,
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
    unit: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updatePriceEventReview(ctx, ctx.user, args);
    return null;
  },
});

export const dashboardStats = engineeringOrPurchasingQuery({
  args: { now: v.number() },
  returns: v.object({
    activeMaterials: v.number(),
    activeSuppliers: v.number(),
    unreviewedPrices: v.number(),
    stalePrices: v.number(),
    recentEvents: v.number(),
    takeoffsNeedingPricing: v.number(),
  }),
  handler: async (ctx, args) => {
    return await getPriceDashboardStats(ctx, args.now);
  },
});
