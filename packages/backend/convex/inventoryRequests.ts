import { v } from "convex/values";
import { inventoryRequestReason, inventoryRequestStatus } from "./schema/inventory";
import {
  authedMutation,
  authedQuery,
  inventoryMutation,
  inventoryQuery,
  materialRequestsMutation,
} from "./lib/rbac";
import {
  consumeRemainingOnObra,
  enrichRequest,
  fulfillInventoryRequest,
  listProjectMaterialBalances,
  listRequestsByFilter,
  requireAssignedProject,
  resolveProjectByIdentifier,
} from "./model/inventory/requests";
import {
  cancelInventoryRequest,
  createInventoryRequest,
  listMaterialPickerSuggestions,
  reviewInventoryRequest,
  searchActiveCatalog,
} from "./model/inventory/requestWorkflow";

const catalogMaterialValidator = v.object({
  materialId: v.id("materials"),
  name: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  sku: v.union(v.string(), v.null()),
});

const requestItemValidator = v.object({
  _id: v.id("inventoryRequestItems"),
  materialId: v.id("materials"),
  materialName: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  quantity: v.number(),
  reason: inventoryRequestReason,
  markedDepleted: v.boolean(),
});

const requestRowValidator = v.object({
  _id: v.id("inventoryRequests"),
  projectId: v.id("projects"),
  projectName: v.string(),
  projectSlug: v.string(),
  status: inventoryRequestStatus,
  notes: v.union(v.string(), v.null()),
  requestedByUserId: v.id("users"),
  requestedByName: v.string(),
  reviewedByName: v.union(v.string(), v.null()),
  reviewedAt: v.union(v.number(), v.null()),
  reviewNotes: v.union(v.string(), v.null()),
  fulfilledByDocumentId: v.union(v.id("inventoryDocuments"), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  items: v.array(requestItemValidator),
});

export const resolveAssignedObra = authedQuery({
  args: { identifier: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("projects"),
      slug: v.string(),
      name: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const project = await resolveProjectByIdentifier(ctx, args.identifier);
    if (!project) return null;
    await requireAssignedProject(ctx, ctx.user, project._id);
    return {
      _id: project._id,
      slug: project.slug ?? project._id,
      name: project.name,
    };
  },
});

export const listObraBalances = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      materialId: v.id("materials"),
      materialName: v.string(),
      variantLabel: v.union(v.string(), v.null()),
      unit: v.union(v.string(), v.null()),
      quantity: v.number(),
      sentQuantity: v.number(),
      consumedQuantity: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listProjectMaterialBalances(ctx, ctx.user, args.projectId);
  },
});

export const listPickerSuggestions = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    recents: v.array(catalogMaterialValidator),
    common: v.array(catalogMaterialValidator),
  }),
  handler: async (ctx, args) => {
    return await listMaterialPickerSuggestions(ctx, ctx.user, args.projectId);
  },
});

export const searchCatalog = authedQuery({
  args: { search: v.string() },
  returns: v.array(catalogMaterialValidator),
  handler: async (ctx, args) => {
    return await searchActiveCatalog(ctx, args.search);
  },
});

export const listObraRequests = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(requestRowValidator),
  handler: async (ctx, args) => {
    await requireAssignedProject(ctx, ctx.user, args.projectId);
    const requests = await listRequestsByFilter(ctx, {
      projectId: args.projectId,
      limit: 50,
    });
    return await Promise.all(
      requests.map((request) => enrichRequest(ctx, request))
    );
  },
});

export const markDepleted = authedMutation({
  args: {
    projectId: v.id("projects"),
    materialId: v.id("materials"),
  },
  returns: v.object({
    documentId: v.id("inventoryDocuments"),
    quantity: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAssignedProject(ctx, ctx.user, args.projectId);
    const result = await consumeRemainingOnObra(ctx, ctx.user, {
      projectId: args.projectId,
      materialId: args.materialId,
      notes: "Acabou",
    });
    return result;
  },
});

export const createRequest = authedMutation({
  args: {
    projectId: v.id("projects"),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        materialId: v.id("materials"),
        quantity: v.number(),
        reason: inventoryRequestReason,
        markedDepleted: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.id("inventoryRequests"),
  handler: async (ctx, args) => {
    return await createInventoryRequest(ctx, ctx.user, args);
  },
});

export const cancelRequest = authedMutation({
  args: { requestId: v.id("inventoryRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cancelInventoryRequest(ctx, ctx.user, args.requestId);
    return null;
  },
});

export const listOfficeRequests = inventoryQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    status: v.optional(inventoryRequestStatus),
  },
  returns: v.array(requestRowValidator),
  handler: async (ctx, args) => {
    const requests = await listRequestsByFilter(ctx, {
      projectId: args.projectId,
      status: args.status,
      limit: 100,
    });
    return await Promise.all(
      requests.map((request) => enrichRequest(ctx, request))
    );
  },
});

export const getRequest = inventoryQuery({
  args: { requestId: v.id("inventoryRequests") },
  returns: v.union(requestRowValidator, v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("inventoryRequests", args.requestId);
    if (!request) return null;
    return await enrichRequest(ctx, request);
  },
});

export const reviewRequest = materialRequestsMutation({
  args: {
    requestId: v.id("inventoryRequests"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reviewInventoryRequest(ctx, ctx.user, args);
    return null;
  },
});

export const markFulfilled = inventoryMutation({
  args: {
    requestId: v.id("inventoryRequests"),
    documentId: v.id("inventoryDocuments"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await fulfillInventoryRequest(ctx, ctx.user, args);
    return null;
  },
});
