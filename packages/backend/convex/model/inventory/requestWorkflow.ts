import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  activeUsersWithRole,
  engineeringDeciders,
  notify,
  plural,
} from "../notifications/notify";
import { findInventoryLocation } from "./locations";
import {
  MAX_INVENTORY_REQUEST_LINES,
  canReviewMaterialRequests,
  consumeRemainingOnObra,
  loadRequestItems,
  requireAssignedProject,
} from "./requests";
import { forbidden } from "../../lib/accessErrors";
import { notFound, ruleViolation } from "../../lib/domainErrors";
import { normalizeText } from "../kernel/text";

// Pedidos de material feitos pela obra: escolha de materiais do catálogo
// (sugestões e busca), criação, cancelamento e validação pela engenharia.
// O envio pelo Estoque fica em `requests.ts` (`fulfillInventoryRequest`).

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

export type CatalogMaterialRow = ReturnType<typeof mapCatalogMaterial>;

/**
 * Sugestões do seletor de materiais da obra: os recentes do usuário (pedidos
 * e consumos nesta obra) e os comuns da obra (saldo e levantamento).
 */
export async function listMaterialPickerSuggestions(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<{ recents: CatalogMaterialRow[]; common: CatalogMaterialRow[] }> {
  await requireAssignedProject(ctx, user, projectId);

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
      q.eq("requestedByUserId", user._id)
    )
    .order("desc")
    .take(30);
  for (const request of myRequests) {
    if (request.projectId !== projectId) continue;
    const items = await ctx.db
      .query("inventoryRequestItems")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .collect();
    for (const item of items) addRecent(item.materialId);
  }

  const myDocuments = await ctx.db
    .query("inventoryDocuments")
    .withIndex("by_created_by", (q) =>
      q.eq("createdByUserId", user._id)
    )
    .order("desc")
    .take(40);
  for (const document of myDocuments) {
    if (
      document.projectId !== projectId ||
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

  const location = await findInventoryLocation(ctx, projectId);
  if (location) {
    const balances = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location", (q) => q.eq("locationId", location._id))
      .take(100);
    for (const balance of balances) addCommon(balance.materialId);
  }

  const takeoffItems = await ctx.db
    .query("takeoffItems")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
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
}

/** Busca materiais ativos do catálogo (índice de busca, com fallback). */
export async function searchActiveCatalog(
  ctx: QueryCtx,
  rawSearch: string
): Promise<CatalogMaterialRow[]> {
  const search = rawSearch.trim();
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
  } catch (error) {
    console.error("inventoryRequests.searchCatalog search index failed", {
      search: searchQuery,
      error,
    });
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
}

export type CreateInventoryRequestInput = {
  projectId: Id<"projects">;
  notes?: string;
  items: {
    materialId: Id<"materials">;
    quantity: number;
    reason: Doc<"inventoryRequestItems">["reason"];
    markedDepleted?: boolean;
  }[];
};

/**
 * Cria um pedido de material da obra. Itens marcados como "acabou" zeram
 * antes o saldo restante na obra (consumo automático).
 */
export async function createInventoryRequest(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateInventoryRequestInput
): Promise<Id<"inventoryRequests">> {
  await requireAssignedProject(ctx, user, input.projectId);
  if (input.items.length === 0) {
    throw ruleViolation("Adicione pelo menos um material");
  }
  if (input.items.length > MAX_INVENTORY_REQUEST_LINES) {
    throw ruleViolation(
      `Cada pedido aceita no máximo ${MAX_INVENTORY_REQUEST_LINES} materiais`
    );
  }

  const seen = new Set<string>();
  const materials = new Map<Id<"materials">, Doc<"materials">>();
  for (const item of input.items) {
    if (seen.has(item.materialId)) {
      throw ruleViolation("Há materiais repetidos no pedido");
    }
    seen.add(item.materialId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw ruleViolation("A quantidade deve ser maior que zero");
    }
    const material = await ctx.db.get("materials", item.materialId);
    if (!material || !material.active) {
      throw ruleViolation("Use apenas materiais ativos do catálogo");
    }
    materials.set(item.materialId, material);
  }

  const location = await findInventoryLocation(ctx, input.projectId);
  for (const item of input.items) {
    if (!item.markedDepleted) continue;
    if (!location) continue;
    const balance = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location_material", (q) =>
        q.eq("locationId", location._id).eq("materialId", item.materialId)
      )
      .unique();
    if (balance && balance.quantity > 0) {
      await consumeRemainingOnObra(ctx, user, {
        projectId: input.projectId,
        materialId: item.materialId,
        notes: "Acabou (pedido de reposição)",
      });
    }
  }

  const now = Date.now();
  const notes = input.notes?.trim();
  const requestId = await ctx.db.insert("inventoryRequests", {
    projectId: input.projectId,
    status: "pending",
    requestedByUserId: user._id,
    notes: notes || undefined,
    createdAt: now,
    updatedAt: now,
  });

  for (const item of input.items) {
    const material = materials.get(item.materialId);
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

  await logAudit(ctx, user, {
    action: "create",
    tableName: "inventoryRequests",
    recordId: requestId,
    details: `Pedido de ${input.items.length} material(is) para a obra`,
  });

  // N1: quem decide pela engenharia na obra.
  const project = await ctx.db.get("projects", input.projectId);
  if (project) {
    await notify(
      ctx,
      await engineeringDeciders(ctx, project),
      {
        kind: "N1",
        category: "pedidos",
        title: `Pedido de material · ${project.name}`,
        body: `${user.name} pediu ${plural(input.items.length, "item", "itens")}. Toque para aprovar ou recusar.`,
        target: "pedido",
        params: { requestId, projectId: input.projectId },
        projectId: input.projectId,
      },
      { actorId: user._id }
    );
  }

  return requestId;
}

/** Cancela um pedido pendente; só quem pediu pode cancelar. */
export async function cancelInventoryRequest(
  ctx: MutationCtx,
  user: Doc<"users">,
  requestId: Id<"inventoryRequests">
): Promise<void> {
  const request = await ctx.db.get("inventoryRequests", requestId);
  if (!request) throw notFound("Pedido não encontrado");
  await requireAssignedProject(ctx, user, request.projectId);
  if (request.requestedByUserId !== user._id) {
    throw forbidden("Só quem pediu pode cancelar");
  }
  if (request.status !== "pending") {
    throw ruleViolation("Somente pedidos pendentes podem ser cancelados");
  }
  await ctx.db.patch("inventoryRequests", requestId, {
    status: "cancelled",
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "cancel",
    tableName: "inventoryRequests",
    recordId: requestId,
  });
}

/** Aprova ou recusa um pedido pendente, com justificativa. */
export async function reviewInventoryRequest(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    requestId: Id<"inventoryRequests">;
    decision: "approve" | "reject";
    reason: string;
  }
): Promise<void> {
  if (!canReviewMaterialRequests(user)) {
    throw forbidden("Apenas engenharia ou administradores validam pedidos");
  }
  const reason = input.reason.trim();
  if (!reason) throw ruleViolation("Informe a justificativa");

  const request = await ctx.db.get("inventoryRequests", input.requestId);
  if (!request) throw notFound("Pedido não encontrado");
  if (request.status !== "pending") {
    throw ruleViolation("Este pedido não está pendente");
  }

  const now = Date.now();
  const status = input.decision === "approve" ? "approved" : "rejected";
  await ctx.db.patch("inventoryRequests", input.requestId, {
    status,
    reviewedByUserId: user._id,
    reviewedAt: now,
    reviewNotes: reason,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: input.decision,
    tableName: "inventoryRequests",
    recordId: input.requestId,
    details: reason,
  });

  // N2a/N3 para quem pediu; N2b para o Estoque atender.
  const project = await ctx.db.get("projects", request.projectId);
  const projectName = project?.name ?? "Obra";
  const items = await loadRequestItems(ctx, input.requestId);
  const itemsLabel = plural(items.length, "item", "itens");
  const params = { requestId: input.requestId, projectId: request.projectId };
  if (input.decision === "approve") {
    await notify(
      ctx,
      [request.requestedByUserId],
      {
        kind: "N2a",
        category: "pedidos",
        title: `Pedido aprovado · ${projectName}`,
        body: `${items.length === 1 ? "Seu item foi aprovado" : `Seus ${itemsLabel} foram aprovados`}. O estoque vai separar e enviar.`,
        target: "estoque_obra",
        params,
        projectId: request.projectId,
      },
      { actorId: user._id }
    );
    await notify(
      ctx,
      await activeUsersWithRole(ctx, "estoque"),
      {
        kind: "N2b",
        category: "pedidos",
        title: `Pedido para atender · ${projectName}`,
        body: `${itemsLabel} ${items.length === 1 ? "aprovado" : "aprovados"} por ${user.name}. Toque para montar o envio.`,
        target: "pedido",
        params,
        projectId: request.projectId,
      },
      { actorId: user._id }
    );
  } else {
    await notify(
      ctx,
      [request.requestedByUserId],
      {
        kind: "N3",
        category: "pedidos",
        title: `Pedido recusado · ${projectName}`,
        body: `Motivo: "${reason}"`,
        target: "estoque_obra",
        params,
        projectId: request.projectId,
      },
      { actorId: user._id }
    );
  }
}
