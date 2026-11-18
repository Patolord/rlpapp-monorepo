import { v } from "convex/values";
import { engineeringOrPurchasingQuery, precosMutation } from "./lib/rbac";
import { priceEventSource, quoteFreight } from "./schema/procurement";
import {
  createQuoteProposal,
  getQuoteProposal,
  getQuoteWeek,
  linkPriceEventsToProposal,
  listQuoteProposals,
  listQuoteWeeks,
  updateQuoteProposal,
} from "./model/procurement/quoteProposals";
import {
  quoteProposalSummaryValidator,
  quoteProposalValidator,
  quoteWeekSummaryValidator,
  quoteWeekValidator,
} from "./model/procurement/quoteValidators";

/**
 * Propostas de fornecedor (vários preços de uma vez) e a rodada semanal que
 * compara os fornecedores. Cada linha da proposta vira um priceEvent.
 */

const lineValidator = v.object({
  materialId: v.optional(v.id("materials")),
  /** Descrição como o fornecedor escreveu; obrigatória sem materialId. */
  rawDescription: v.optional(v.string()),
  unitPriceCents: v.number(),
  unit: v.optional(v.string()),
  quantity: v.optional(v.number()),
  notes: v.optional(v.string()),
});

export const create = precosMutation({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    supplierNameRaw: v.optional(v.string()),
    /** Data em que a proposta chegou (ms); vale para todas as linhas. */
    receivedAt: v.number(),
    validUntil: v.optional(v.number()),
    paymentTerms: v.optional(v.string()),
    freight: v.optional(quoteFreight),
    reference: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    notes: v.optional(v.string()),
    /** Origem dos preços; padrão "quote". */
    source: v.optional(priceEventSource),
    lines: v.array(lineValidator),
  },
  returns: v.object({
    proposalId: v.id("quoteProposals"),
    priceEventIds: v.array(v.id("priceEvents")),
  }),
  handler: async (ctx, args) => {
    return await createQuoteProposal(ctx, ctx.user, args);
  },
});

export const update = precosMutation({
  args: {
    proposalId: v.id("quoteProposals"),
    supplierId: v.optional(v.id("suppliers")),
    supplierNameRaw: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    validUntil: v.optional(v.union(v.number(), v.null())),
    paymentTerms: v.optional(v.string()),
    freight: v.optional(v.union(quoteFreight, v.null())),
    reference: v.optional(v.string()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateQuoteProposal(ctx, ctx.user, args);
    return null;
  },
});

/** Liga preços já lançados (do mesmo fornecedor) a uma proposta. */
export const linkPriceEvents = precosMutation({
  args: {
    proposalId: v.id("quoteProposals"),
    priceEventIds: v.array(v.id("priceEvents")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await linkPriceEventsToProposal(ctx, ctx.user, args);
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { proposalId: v.id("quoteProposals") },
  returns: v.union(quoteProposalValidator, v.null()),
  handler: async (ctx, args) => {
    return await getQuoteProposal(ctx, args.proposalId);
  },
});

export const list = engineeringOrPurchasingQuery({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    limit: v.optional(v.number()),
  },
  returns: v.array(quoteProposalSummaryValidator),
  handler: async (ctx, args) => {
    return await listQuoteProposals(ctx, args);
  },
});

/** Semanas com preços lançados, mais recentes primeiro. */
export const listWeeks = engineeringOrPurchasingQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(quoteWeekSummaryValidator),
  handler: async (ctx, args) => {
    return await listQuoteWeeks(ctx, args);
  },
});

/**
 * Mapa da rodada: os preços da semana que contém `weekStart` (qualquer
 * instante dela), um fornecedor por coluna e um material por linha.
 */
export const week = engineeringOrPurchasingQuery({
  args: { weekStart: v.number(), now: v.number() },
  returns: quoteWeekValidator,
  handler: async (ctx, args) => {
    return await getQuoteWeek(ctx, args);
  },
});
