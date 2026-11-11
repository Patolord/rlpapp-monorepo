import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { inventoryCompatibilityRuleType, inventoryDocumentStatus } from "./schema/inventory";
import {
  inventoryMutation,
  inventoryQuery,
  inventoryRulesMutation,
  staffMutation,
  warehouseOrPurchasingMutation,
} from "./lib/rbac";
import {
  createCompatibilityRule,
  listCompatibilityRules,
  setCompatibilityRuleActive,
} from "./model/inventory/compatibility";
import {
  createInventoryDocument,
  reviewInventoryDocument,
} from "./model/inventory/documents";
import { reverseInventoryDocument } from "./model/inventory/posting";
import { getCentralStockHealth } from "./model/inventory/stockPolicy";
import {
  listInventoryDocuments,
  listPendingInventoryApprovals,
  listProjectInventorySummaries,
} from "./model/inventory/queries";
import { postInventoryDocumentForRequest } from "./model/inventory/requests";
import {
  listInventoryBalances,
  listInventoryEventsPage,
  listLegacyInventoryEvents,
  updateInventoryAddress,
} from "./model/inventory/stockLedger";
import {
  compatibilityRuleRowValidator,
  inventoryBalanceRowValidator,
  inventoryDocumentRowValidator,
  inventoryEventRowValidator,
  legacyInventoryEventType,
  legacyInventoryEventValidator,
} from "./model/inventory/validators";
import {
  getInventoryAccess,
  listInventoryMaterialOptions,
  listInventoryProjects,
  quickCreateInventoryMaterial,
} from "./model/inventory/workspace";

export const getAccess = inventoryQuery({
  args: {},
  returns: v.object({
    canViewCentral: v.boolean(),
    canWriteCentral: v.boolean(),
    canCreateEntry: v.boolean(),
    canCreateProjectMovement: v.boolean(),
    canConfigureRules: v.boolean(),
    canQuickCreateMaterial: v.boolean(),
    isEngineer: v.boolean(),
    canReviewMaterialRequests: v.boolean(),
    canFulfillMaterialRequests: v.boolean(),
  }),
  handler: async (ctx) => {
    return getInventoryAccess(ctx.user);
  },
});

export const listMaterialOptions = inventoryQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(
    v.object({
      _id: v.id("materials"),
      name: v.string(),
      variantLabel: v.union(v.string(), v.null()),
      sku: v.union(v.string(), v.null()),
      category: v.union(v.string(), v.null()),
      unit: v.union(v.string(), v.null()),
      technicalAttributes: v.array(
        v.object({ key: v.string(), value: v.string() })
      ),
    })
  ),
  handler: async (ctx, args) => {
    return await listInventoryMaterialOptions(ctx, args.search);
  },
});

export const quickCreateMaterial = warehouseOrPurchasingMutation({
  args: {
    name: v.string(),
    variantLabel: v.optional(v.string()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.object({
    materialId: v.id("materials"),
    name: v.string(),
    variantLabel: v.union(v.string(), v.null()),
    sku: v.string(),
    unit: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return await quickCreateInventoryMaterial(ctx, ctx.user, args);
  },
});

export const listProjects = inventoryQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      responsibleId: v.union(v.id("users"), v.null()),
    })
  ),
  handler: async (ctx) => {
    return await listInventoryProjects(ctx);
  },
});

export const listBalances = inventoryQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
    // Busca no estoque inteiro por nome, SKU ou variação. Com busca, a
    // resposta vem numa página só (até 50 materiais).
    search: v.optional(v.string()),
  },
  returns: v.object({
    page: v.array(inventoryBalanceRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    return await listInventoryBalances(ctx, ctx.user, args);
  },
});

/** Contagens do topo do Estoque central: Crítico · Repor · OK · Sem política. */
export const centralHealth = inventoryQuery({
  args: {},
  returns: v.object({
    critical: v.number(),
    reorder: v.number(),
    healthy: v.number(),
    unconfigured: v.number(),
  }),
  handler: async (ctx) => {
    return await getCentralStockHealth(ctx, ctx.user);
  },
});

export const listProjectSummaries = inventoryQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      responsibleId: v.union(v.id("users"), v.null()),
      materialCount: v.number(),
      transferCount: v.number(),
      consumptionCount: v.number(),
      returnCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    return await listProjectInventorySummaries(ctx);
  },
});

export const listDocuments = inventoryQuery({
  args: {
    status: v.optional(inventoryDocumentStatus),
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(inventoryDocumentRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    return await listInventoryDocuments(ctx, ctx.user, args);
  },
});

export const listPendingApprovals = inventoryQuery({
  args: {},
  returns: v.array(inventoryDocumentRowValidator),
  handler: async (ctx) => {
    return await listPendingInventoryApprovals(ctx, ctx.user);
  },
});

export const listEventsPaginated = inventoryQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(inventoryEventRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    return await listInventoryEventsPage(ctx, ctx.user, args);
  },
});

// Compatibilidade com a tela nativa existente. O MVP web usa o endpoint
// paginado acima; este adaptador permanece limitado a 200 eventos.
export const listEvents = inventoryQuery({
  args: {
    type: v.optional(legacyInventoryEventType),
    limit: v.optional(v.number()),
  },
  returns: v.array(legacyInventoryEventValidator),
  handler: async (ctx, args) => {
    return await listLegacyInventoryEvents(ctx, ctx.user, args);
  },
});

export const createDocument = staffMutation({
  args: {
    type: v.union(
      v.literal("entry"),
      v.literal("transfer"),
      v.literal("consumption"),
      v.literal("return"),
      v.literal("adjustment")
    ),
    projectId: v.optional(v.id("projects")),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        materialId: v.id("materials"),
        quantity: v.number(),
        unitCostCents: v.optional(v.number()),
      })
    ),
  },
  returns: v.object({
    documentId: v.id("inventoryDocuments"),
    status: v.union(v.literal("draft"), v.literal("pending_approval")),
    issueCount: v.number(),
  }),
  handler: async (ctx, args) => {
    return await createInventoryDocument(ctx, ctx.user, args);
  },
});

export const postDocument = staffMutation({
  args: {
    documentId: v.id("inventoryDocuments"),
    requestId: v.optional(v.id("inventoryRequests")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await postInventoryDocumentForRequest(ctx, ctx.user, args);
    return null;
  },
});

export const reviewDocument = staffMutation({
  args: {
    documentId: v.id("inventoryDocuments"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reviewInventoryDocument(ctx, ctx.user, args);
    return null;
  },
});

export const reverseDocument = inventoryMutation({
  args: {
    documentId: v.id("inventoryDocuments"),
    reason: v.string(),
  },
  returns: v.id("inventoryDocuments"),
  handler: async (ctx, args) => {
    return await reverseInventoryDocument(ctx, ctx.user, args);
  },
});

export const updatePhysicalAddress = inventoryMutation({
  args: {
    balanceId: v.id("inventoryBalances"),
    physicalAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateInventoryAddress(ctx, ctx.user, args);
    return null;
  },
});

export const listRules = inventoryQuery({
  args: {},
  returns: v.array(compatibilityRuleRowValidator),
  handler: async (ctx) => {
    return await listCompatibilityRules(ctx);
  },
});

export const createRule = inventoryRulesMutation({
  args: {
    type: inventoryCompatibilityRuleType,
    name: v.string(),
    materialAId: v.optional(v.id("materials")),
    materialBId: v.optional(v.id("materials")),
    categoryA: v.optional(v.string()),
    categoryB: v.optional(v.string()),
    attributeKey: v.optional(v.string()),
    message: v.string(),
  },
  returns: v.id("inventoryCompatibilityRules"),
  handler: async (ctx, args) => {
    return await createCompatibilityRule(ctx, ctx.user, args);
  },
});

export const setRuleActive = inventoryRulesMutation({
  args: {
    ruleId: v.id("inventoryCompatibilityRules"),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setCompatibilityRuleActive(ctx, ctx.user, args);
    return null;
  },
});
