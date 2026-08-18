import { v } from "convex/values";
import {
  inventoryRequestReason,
  inventoryRequestStatus,
} from "./schema";
import { normalizeText } from "./lib/compras/procurement";
import {
  authedMutation,
  authedQuery,
  inventoryMutation,
  inventoryQuery,
  staffMutation,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { findInventoryLocation } from "./lib/inventory/operations";
import {
  MAX_INVENTORY_REQUEST_LINES,
  canFulfillMaterialRequests,
  canReviewMaterialRequests,
  consumeRemainingOnObra,
  enrichRequest,
  listRequestsByFilter,
  requireAssignedProject,
  resolveProjectByIdentifier,
  sentAndConsumedByMaterial,
} from "./lib/inventory/requests";
import type { Doc, Id } from "./_generated/dataModel";

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

function mapCatalogMaterial(material: Doc<"materials">) {
  return {
    materialId: material._id,
    name: material.name,
    variantLabel: material.variantLabel ?? null,
    unit: material.unit ?? null,
    sku: material.sku ?? null,
  };
}

function matchesCatalogSearch(material: Doc<"materials">, search: string): boolean {
  const term = search.toLocaleLowerCase("pt-BR");
  return (
    material.name.toLocaleLowerCase("pt-BR").includes(term) ||
    (material.variantLabel?.toLocaleLowerCase("pt-BR").includes(term) ?? false) ||
    (material.sku?.toLocaleLowerCase("pt-BR").includes(term) ?? false) ||
    (material.category?.toLocaleLowerCase("pt-BR").includes(term) ?? false)
  );
}

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
    await requireAssignedProject(ctx, ctx.user, args.projectId);
    const location = await findInventoryLocation(ctx, args.projectId);
    if (!location) return [];

    const [balances, totals] = await Promise.all([
      ctx.db
        .query("inventoryBalances")
        .withIndex("by_location", (q) => q.eq("locationId", location._id))
        .take(200),
      sentAndConsumedByMaterial(ctx, args.projectId),
    ]);

    const rows = await Promise.all(
      balances.map(async (balance) => {
        const material = await ctx.db.get("materials", balance.materialId);
        return {
          materialId: balance.materialId,
          materialName: material?.name ?? "Material removido",
          variantLabel: material?.variantLabel ?? null,
          unit: material?.unit ?? null,
          quantity: balance.quantity,
          sentQuantity: totals.sent.get(balance.materialId) ?? 0,
          consumedQuantity: totals.consumed.get(balance.materialId) ?? 0,
        };
      })
    );

    return rows.sort((a, b) => {
      if (a.quantity === 0 && b.quantity !== 0) return -1;
      if (a.quantity !== 0 && b.quantity === 0) return 1;
      return a.materialName.localeCompare(b.materialName, "pt-BR");
    });
  },
});

export const listPickerSuggestions = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    recents: v.array(catalogMaterialValidator),
    common: v.array(catalogMaterialValidator),
  }),
  handler: async (ctx, args) => {
    await requireAssignedProject(ctx, ctx.user, args.projectId);

    const recentIds: Id<"materials">[] = [];
    const seenRecent = new Set<string>();
    const addRecent = (materialId: Id<"materials">) => {
      if (seenRecent.has(materialId)) return;
      seenRecent.add(materialId);
      recentIds.push(materialId);
    };

    const myRequests = await ctx.db
      .query("inventoryRequests")
      .withIndex("by_requested_by", (q) =>
        q.eq("requestedByUserId", ctx.user._id)
      )
      .order("desc")
      .take(30);
    for (const request of myRequests) {
      if (request.projectId !== args.projectId) continue;
      const items = await ctx.db
        .query("inventoryRequestItems")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .collect();
      for (const item of items) addRecent(item.materialId);
    }

    const myDocuments = await ctx.db
      .query("inventoryDocuments")
      .withIndex("by_created_by", (q) =>
        q.eq("createdByUserId", ctx.user._id)
      )
      .order("desc")
      .take(40);
    for (const document of myDocuments) {
      if (
        document.projectId !== args.projectId ||
        document.type !== "consumption"
      ) {
        continue;
      }
      const items = await ctx.db
        .query("inventoryDocumentItems")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect();
      for (const item of items) addRecent(item.materialId);
    }

    const commonIds: Id<"materials">[] = [];
    const seenCommon = new Set<string>();
    const addCommon = (materialId: Id<"materials">) => {
      if (seenCommon.has(materialId)) return;
      seenCommon.add(materialId);
      commonIds.push(materialId);
    };

    const location = await findInventoryLocation(ctx, args.projectId);
    if (location) {
      const balances = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location", (q) => q.eq("locationId", location._id))
        .take(100);
      for (const balance of balances) addCommon(balance.materialId);
    }

    const takeoffItems = await ctx.db
      .query("takeoffItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(100);
    for (const item of takeoffItems) {
      if (item.materialId) addCommon(item.materialId);
    }

    const toCatalog = async (materialIds: Id<"materials">[]) => {
      const rows = [];
      for (const materialId of materialIds.slice(0, 12)) {
        const material = await ctx.db.get("materials", materialId);
        if (!material || !material.active) continue;
        rows.push(mapCatalogMaterial(material));
      }
      return rows;
    };

    return {
      recents: await toCatalog(recentIds),
      common: await toCatalog(commonIds),
    };
  },
});

export const searchCatalog = authedQuery({
  args: { search: v.string() },
  returns: v.array(catalogMaterialValidator),
  handler: async (ctx, args) => {
    const search = args.search.trim();
    if (search.length < 2) return [];

    const searchQuery = normalizeText(search) || search;
    let indexed: Doc<"materials">[] = [];
    try {
      indexed = await ctx.db
        .query("materials")
        .withSearchIndex("search_text", (q) =>
          q.search("searchText", searchQuery).eq("active", true)
        )
        .take(20);
    } catch {
      indexed = [];
    }
    if (indexed.length > 0) {
      return indexed.map(mapCatalogMaterial);
    }

    const materials = await ctx.db
      .query("materials")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(300);

    return materials
      .filter((material) => matchesCatalogSearch(material, search))
      .slice(0, 20)
      .map(mapCatalogMaterial);
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
    await requireAssignedProject(ctx, ctx.user, args.projectId);
    if (args.items.length === 0) {
      throw new Error("Adicione pelo menos um material");
    }
    if (args.items.length > MAX_INVENTORY_REQUEST_LINES) {
      throw new Error(
        `Cada pedido aceita no máximo ${MAX_INVENTORY_REQUEST_LINES} materiais`
      );
    }

    const seen = new Set<string>();
    for (const item of args.items) {
      if (seen.has(item.materialId)) {
        throw new Error("Há materiais repetidos no pedido");
      }
      seen.add(item.materialId);
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error("A quantidade deve ser maior que zero");
      }
      const material = await ctx.db.get("materials", item.materialId);
      if (!material || !material.active) {
        throw new Error("Use apenas materiais ativos do catálogo");
      }
    }

    for (const item of args.items) {
      if (!item.markedDepleted) continue;
      const location = await findInventoryLocation(ctx, args.projectId);
      if (!location) continue;
      const balance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q.eq("locationId", location._id).eq("materialId", item.materialId)
        )
        .unique();
      if (balance && balance.quantity > 0) {
        await consumeRemainingOnObra(ctx, ctx.user, {
          projectId: args.projectId,
          materialId: item.materialId,
          notes: "Acabou (pedido de reposição)",
        });
      }
    }

    const now = Date.now();
    const notes = args.notes?.trim();
    const requestId = await ctx.db.insert("inventoryRequests", {
      projectId: args.projectId,
      status: "pending",
      requestedByUserId: ctx.user._id,
      notes: notes || undefined,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      const material = await ctx.db.get("materials", item.materialId);
      await ctx.db.insert("inventoryRequestItems", {
        requestId,
        materialId: item.materialId,
        quantity: item.quantity,
        unit: material?.unit,
        reason: item.reason,
        markedDepleted: item.markedDepleted === true,
        createdAt: now,
      });
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "inventoryRequests",
      recordId: requestId,
      details: `Pedido de ${args.items.length} material(is) para a obra`,
    });

    return requestId;
  },
});

export const cancelRequest = authedMutation({
  args: { requestId: v.id("inventoryRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("inventoryRequests", args.requestId);
    if (!request) throw new Error("Pedido não encontrado");
    await requireAssignedProject(ctx, ctx.user, request.projectId);
    if (request.requestedByUserId !== ctx.user._id) {
      throw new Error("Só quem pediu pode cancelar");
    }
    if (request.status !== "pending") {
      throw new Error("Somente pedidos pendentes podem ser cancelados");
    }
    await ctx.db.patch("inventoryRequests", args.requestId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "cancel",
      tableName: "inventoryRequests",
      recordId: args.requestId,
    });
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

export const reviewRequest = staffMutation({
  args: {
    requestId: v.id("inventoryRequests"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!canReviewMaterialRequests(ctx.user)) {
      throw new Error("Apenas engenharia ou administradores validam pedidos");
    }
    const reason = args.reason.trim();
    if (!reason) throw new Error("Informe a justificativa");

    const request = await ctx.db.get("inventoryRequests", args.requestId);
    if (!request) throw new Error("Pedido não encontrado");
    if (request.status !== "pending") {
      throw new Error("Este pedido não está pendente");
    }

    const now = Date.now();
    const status = args.decision === "approve" ? "approved" : "rejected";
    await ctx.db.patch("inventoryRequests", args.requestId, {
      status,
      reviewedByUserId: ctx.user._id,
      reviewedAt: now,
      reviewNotes: reason,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
      action: args.decision,
      tableName: "inventoryRequests",
      recordId: args.requestId,
      details: reason,
    });
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
    if (!canFulfillMaterialRequests(ctx.user)) {
      throw new Error("Apenas o Estoque pode registrar o envio");
    }
    const request = await ctx.db.get("inventoryRequests", args.requestId);
    if (!request) throw new Error("Pedido não encontrado");
    if (request.status !== "approved") {
      throw new Error("Só é possível enviar pedidos já aprovados");
    }
    const document = await ctx.db.get("inventoryDocuments", args.documentId);
    if (!document) throw new Error("Movimentação não encontrada");
    if (document.type !== "transfer") {
      throw new Error("Vincule uma transferência para a obra");
    }
    if (document.projectId !== request.projectId) {
      throw new Error("A transferência precisa ser da mesma obra do pedido");
    }
    if (document.status !== "posted") {
      throw new Error("Conclua a transferência antes de marcar o pedido como enviado");
    }

    await ctx.db.patch("inventoryRequests", args.requestId, {
      status: "fulfilled",
      fulfilledByDocumentId: args.documentId,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "fulfill",
      tableName: "inventoryRequests",
      recordId: args.requestId,
    });
    return null;
  },
});
