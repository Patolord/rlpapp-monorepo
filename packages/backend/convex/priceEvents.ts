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

export const list = engineeringOrPurchasingQuery({
  args: {
    now: v.number(),
    materialId: v.optional(v.id("materials")),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
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
