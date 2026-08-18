import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../audit";
import { hasPermission } from "../rbac";
import { evaluateCompatibility } from "./compatibility";

export const MAX_INVENTORY_DOCUMENT_LINES = 100;

export type InventoryMovementType =
  | "entry"
  | "transfer"
  | "consumption"
  | "return"
  | "adjustment";

export type InventoryLineInput = {
  materialId: Id<"materials">;
  quantity: number;
  unitCostCents?: number;
};

type CreateDocumentInput = {
  type: InventoryMovementType;
  projectId?: Id<"projects">;
  reference?: string;
  notes?: string;
  lines: InventoryLineInput[];
};

function isAdmin(user: Doc<"users">): boolean {
  return user.role === "director" || user.role === "admin";
}

function isEngineering(user: Doc<"users">): boolean {
  return user.role === "engenheiro" || user.department === "engenharia";
}

function isPurchasing(user: Doc<"users">): boolean {
  return user.department === "compras";
}

function isAssignedTechnician(
  user: Doc<"users">,
  project: Doc<"projects"> | null
): boolean {
  if (!project) return false;
  return (project.technicianIds ?? []).includes(user._id);
}

async function assertCanCreate(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: InventoryMovementType,
  projectId?: Id<"projects">
): Promise<void> {
  if (isAdmin(user) || hasPermission(user, "estoque.write")) return;
  if (type === "entry" && isPurchasing(user)) return;
  if ((type === "consumption" || type === "return") && isEngineering(user)) {
    return;
  }
  if (type === "consumption" && projectId) {
    const project = await ctx.db.get("projects", projectId);
    if (isAssignedTechnician(user, project)) return;
  }
  throw new Error("Você não pode registrar este tipo de movimentação");
}

async function assertCanPost(
  ctx: MutationCtx,
  user: Doc<"users">,
  type: InventoryMovementType | "reversal",
  projectId?: Id<"projects">
): Promise<void> {
  if (isAdmin(user) || hasPermission(user, "estoque.write")) return;
  if (type === "entry" && isPurchasing(user)) return;
  if (type === "consumption" && isEngineering(user)) return;
  if (type === "consumption" && projectId) {
    const project = await ctx.db.get("projects", projectId);
    if (isAssignedTechnician(user, project)) return;
  }
  throw new Error("Você não pode concluir este tipo de movimentação");
}

export async function findInventoryLocation(
  ctx: QueryCtx | MutationCtx,
  projectId?: Id<"projects">
): Promise<Doc<"inventoryLocations"> | null> {
  if (projectId) {
    return await ctx.db
      .query("inventoryLocations")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
  }
  return await ctx.db
    .query("inventoryLocations")
    .withIndex("by_type", (q) => q.eq("type", "central"))
    .first();
}

export async function getOrCreateCentralLocation(
  ctx: MutationCtx
): Promise<Doc<"inventoryLocations">> {
  const existing = await findInventoryLocation(ctx);
  if (existing) return existing;

  const locationId = await ctx.db.insert("inventoryLocations", {
    type: "central",
    name: "Estoque Central",
    active: true,
    createdAt: Date.now(),
  });
  const location = await ctx.db.get("inventoryLocations", locationId);
  if (!location) throw new Error("Não foi possível criar o estoque central");
  return location;
}

async function getOrCreateProjectLocation(
  ctx: MutationCtx,
  projectId: Id<"projects">
): Promise<Doc<"inventoryLocations">> {
  const existing = await findInventoryLocation(ctx, projectId);
  if (existing) return existing;

  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  const locationId = await ctx.db.insert("inventoryLocations", {
    type: "project",
    name: `Obra: ${project.name}`,
    projectId,
    active: true,
    createdAt: Date.now(),
  });
  const location = await ctx.db.get("inventoryLocations", locationId);
  if (!location) throw new Error("Não foi possível criar o estoque da obra");
  return location;
}

function validateLines(
  type: InventoryMovementType,
  lines: InventoryLineInput[]
): void {
  if (lines.length === 0) {
    throw new Error("Adicione pelo menos um material");
  }
  if (lines.length > MAX_INVENTORY_DOCUMENT_LINES) {
    throw new Error(
      `Cada movimentação aceita no máximo ${MAX_INVENTORY_DOCUMENT_LINES} materiais`
    );
  }

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity === 0) {
      throw new Error("As quantidades devem ser números diferentes de zero");
    }
    if (type !== "adjustment" && line.quantity < 0) {
      throw new Error("A quantidade deve ser maior que zero");
    }
    if (
      line.unitCostCents !== undefined &&
      (!Number.isInteger(line.unitCostCents) || line.unitCostCents < 0)
    ) {
      throw new Error("O custo unitário deve ser informado em centavos");
    }
  }
}

async function validateMaterials(
  ctx: MutationCtx,
  lines: InventoryLineInput[]
): Promise<void> {
  const uniqueMaterialIds = [...new Set(lines.map((line) => line.materialId))];
  const materials = await Promise.all(
    uniqueMaterialIds.map(async (materialId) => {
      return await ctx.db.get("materials", materialId);
    })
  );
  if (materials.some((material) => !material)) {
    throw new Error("Um ou mais materiais não foram encontrados");
  }
  if (materials.some((material) => material && !material.active)) {
    throw new Error("Materiais inativos não podem ser movimentados");
  }
}

async function resolveDocumentLocations(
  ctx: MutationCtx,
  type: InventoryMovementType,
  projectId?: Id<"projects">
): Promise<{
  sourceLocationId?: Id<"inventoryLocations">;
  destinationLocationId?: Id<"inventoryLocations">;
}> {
  if (type !== "entry" && !projectId && type !== "adjustment") {
    throw new Error("Selecione a obra");
  }

  if (type === "entry") {
    const central = await getOrCreateCentralLocation(ctx);
    return { destinationLocationId: central._id };
  }

  if (type === "adjustment") {
    const location = projectId
      ? await getOrCreateProjectLocation(ctx, projectId)
      : await getOrCreateCentralLocation(ctx);
    return { destinationLocationId: location._id };
  }

  if (!projectId) throw new Error("Selecione a obra");
  const project = await getOrCreateProjectLocation(ctx, projectId);
  if (type === "consumption") {
    return { sourceLocationId: project._id };
  }

  const central = await getOrCreateCentralLocation(ctx);
  if (type === "transfer") {
    return {
      sourceLocationId: central._id,
      destinationLocationId: project._id,
    };
  }
  return {
    sourceLocationId: project._id,
    destinationLocationId: central._id,
  };
}

export async function createInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateDocumentInput
): Promise<{
  documentId: Id<"inventoryDocuments">;
  status: "draft" | "pending_approval";
  issueCount: number;
}> {
  await assertCanCreate(ctx, user, input.type, input.projectId);
  validateLines(input.type, input.lines);
  await validateMaterials(ctx, input.lines);

  const projectId =
    input.type === "entry" ? undefined : input.projectId;
  const locations = await resolveDocumentLocations(
    ctx,
    input.type,
    projectId
  );
  const issues =
    input.type === "transfer"
      ? await evaluateCompatibility(
          ctx,
          input.lines.map((line) => line.materialId)
        )
      : [];
  const status = issues.length > 0 ? "pending_approval" : "draft";
  const now = Date.now();
  const reference = input.reference?.trim();
  const notes = input.notes?.trim();

  const documentId = await ctx.db.insert("inventoryDocuments", {
    type: input.type,
    status,
    ...locations,
    projectId,
    reference: reference || undefined,
    notes: notes || undefined,
    compatibilityIssues: issues.length > 0 ? issues : undefined,
    createdByUserId: user._id,
    createdAt: now,
    updatedAt: now,
  });

  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (!line) continue;
    await ctx.db.insert("inventoryDocumentItems", {
      documentId,
      lineNumber: index + 1,
      materialId: line.materialId,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      createdAt: now,
    });
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "inventoryDocuments",
    recordId: documentId,
    details: `Movimentação ${input.type} criada com ${input.lines.length} item(ns)`,
  });

  return { documentId, status, issueCount: issues.length };
}

export async function createAndPostConsumption(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    projectId: Id<"projects">;
    lines: InventoryLineInput[];
    notes?: string;
  }
): Promise<Id<"inventoryDocuments">> {
  const created = await createInventoryDocument(ctx, user, {
    type: "consumption",
    projectId: input.projectId,
    notes: input.notes,
    lines: input.lines,
  });
  if (created.status !== "draft") {
    throw new Error("Consumo em campo não pode exigir aprovação");
  }
  await postInventoryDocument(ctx, user, created.documentId);
  return created.documentId;
}

type InventoryDelta = {
  itemId: Id<"inventoryDocumentItems">;
  materialId: Id<"materials">;
  locationId: Id<"inventoryLocations">;
  quantityDelta: number;
  type: "in" | "out" | "adjustment";
};

function buildDocumentDeltas(
  document: Doc<"inventoryDocuments">,
  items: Doc<"inventoryDocumentItems">[]
): InventoryDelta[] {
  const deltas: InventoryDelta[] = [];
  for (const item of items) {
    if (document.type === "entry") {
      if (!document.destinationLocationId) {
        throw new Error("Entrada sem estoque de destino");
      }
      deltas.push({
        itemId: item._id,
        materialId: item.materialId,
        locationId: document.destinationLocationId,
        quantityDelta: item.quantity,
        type: "in",
      });
    } else if (document.type === "transfer") {
      if (!document.sourceLocationId || !document.destinationLocationId) {
        throw new Error("Transferência sem origem ou destino");
      }
      deltas.push(
        {
          itemId: item._id,
          materialId: item.materialId,
          locationId: document.sourceLocationId,
          quantityDelta: -item.quantity,
          type: "out",
        },
        {
          itemId: item._id,
          materialId: item.materialId,
          locationId: document.destinationLocationId,
          quantityDelta: item.quantity,
          type: "in",
        }
      );
    } else if (document.type === "consumption") {
      if (!document.sourceLocationId) {
        throw new Error("Consumo sem estoque de origem");
      }
      deltas.push({
        itemId: item._id,
        materialId: item.materialId,
        locationId: document.sourceLocationId,
        quantityDelta: -item.quantity,
        type: "out",
      });
    } else if (document.type === "return") {
      if (!document.sourceLocationId || !document.destinationLocationId) {
        throw new Error("Retorno sem origem ou destino");
      }
      deltas.push(
        {
          itemId: item._id,
          materialId: item.materialId,
          locationId: document.sourceLocationId,
          quantityDelta: -item.quantity,
          type: "out",
        },
        {
          itemId: item._id,
          materialId: item.materialId,
          locationId: document.destinationLocationId,
          quantityDelta: item.quantity,
          type: "in",
        }
      );
    } else if (document.type === "adjustment") {
      if (!document.destinationLocationId) {
        throw new Error("Ajuste sem estoque");
      }
      deltas.push({
        itemId: item._id,
        materialId: item.materialId,
        locationId: document.destinationLocationId,
        quantityDelta: item.quantity,
        type: "adjustment",
      });
    }
  }
  return deltas;
}

async function applyBalanceDelta(
  ctx: MutationCtx,
  delta: Omit<InventoryDelta, "itemId" | "type">,
  now: number
): Promise<void> {
  const balance = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_location_material", (q) =>
      q.eq("locationId", delta.locationId).eq("materialId", delta.materialId)
    )
    .unique();
  const nextQuantity = (balance?.quantity ?? 0) + delta.quantityDelta;
  if (nextQuantity < -0.0000001) {
    const material = await ctx.db.get("materials", delta.materialId);
    throw new Error(
      `Saldo insuficiente para ${material?.name ?? "o material selecionado"}`
    );
  }

  const normalizedQuantity = Math.abs(nextQuantity) < 0.0000001 ? 0 : nextQuantity;
  if (balance) {
    await ctx.db.patch("inventoryBalances", balance._id, {
      quantity: normalizedQuantity,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("inventoryBalances", {
      locationId: delta.locationId,
      materialId: delta.materialId,
      quantity: normalizedQuantity,
      updatedAt: now,
    });
  }
}

export async function postInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  documentId: Id<"inventoryDocuments">
): Promise<void> {
  const document = await ctx.db.get("inventoryDocuments", documentId);
  if (!document) throw new Error("Movimentação não encontrada");
  if (document.type === "reversal") {
    throw new Error("Estornos são concluídos automaticamente");
  }
  await assertCanPost(ctx, user, document.type, document.projectId);
  if (document.status === "pending_approval") {
    throw new Error("A movimentação aguarda aprovação do engenheiro da obra");
  }
  if (document.status !== "draft" && document.status !== "approved") {
    throw new Error("Esta movimentação não pode ser concluída");
  }
  if (
    (document.compatibilityIssues?.length ?? 0) > 0 &&
    document.status !== "approved"
  ) {
    throw new Error("As incompatibilidades precisam ser aprovadas");
  }

  const items = await ctx.db
    .query("inventoryDocumentItems")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  if (items.length === 0) throw new Error("A movimentação não possui itens");

  const deltas = buildDocumentDeltas(document, items);
  const now = Date.now();
  for (const delta of deltas) {
    await applyBalanceDelta(ctx, delta, now);
    await ctx.db.insert("inventoryEvents", {
      documentId,
      documentItemId: delta.itemId,
      type: delta.type,
      locationId: delta.locationId,
      materialId: delta.materialId,
      quantityDelta: delta.quantityDelta,
      createdByUserId: user._id,
      createdAt: now,
    });
  }

  await ctx.db.patch("inventoryDocuments", documentId, {
    status: "posted",
    postedAt: now,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "post",
    tableName: "inventoryDocuments",
    recordId: documentId,
  });
}

export async function reviewInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    documentId: Id<"inventoryDocuments">;
    decision: "approve" | "reject";
    reason: string;
  }
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Informe a justificativa");

  const document = await ctx.db.get(
    "inventoryDocuments",
    input.documentId
  );
  if (!document) throw new Error("Movimentação não encontrada");
  if (document.status !== "pending_approval") {
    throw new Error("Esta movimentação não está pendente de aprovação");
  }
  if (!document.projectId) throw new Error("Movimentação sem obra vinculada");

  const project = await ctx.db.get("projects", document.projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (user.role !== "engenheiro" || project.responsibleId !== user._id) {
    throw new Error(
      "Somente o engenheiro responsável pela obra pode decidir esta exceção"
    );
  }

  const now = Date.now();
  if (input.decision === "approve") {
    await ctx.db.patch("inventoryDocuments", input.documentId, {
      status: "approved",
      approvalReason: reason,
      approvedByUserId: user._id,
      approvedAt: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.patch("inventoryDocuments", input.documentId, {
      status: "rejected",
      approvalReason: reason,
      rejectedByUserId: user._id,
      rejectedAt: now,
      updatedAt: now,
    });
  }

  await logAudit(ctx, user, {
    action: input.decision,
    tableName: "inventoryDocuments",
    recordId: input.documentId,
    details: reason,
  });
}

export async function reverseInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { documentId: Id<"inventoryDocuments">; reason: string }
): Promise<Id<"inventoryDocuments">> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Informe o motivo do estorno");
  const original = await ctx.db.get("inventoryDocuments", input.documentId);
  if (!original) throw new Error("Movimentação não encontrada");
  if (original.status !== "posted") {
    throw new Error("Somente movimentações concluídas podem ser estornadas");
  }
  if (original.reversedByDocumentId) {
    throw new Error("Esta movimentação já foi estornada");
  }

  const originalItems = await ctx.db
    .query("inventoryDocumentItems")
    .withIndex("by_document", (q) => q.eq("documentId", input.documentId))
    .collect();
  const originalEvents = await ctx.db
    .query("inventoryEvents")
    .withIndex("by_document", (q) => q.eq("documentId", input.documentId))
    .collect();
  const now = Date.now();
  const reversalId = await ctx.db.insert("inventoryDocuments", {
    type: "reversal",
    status: "posted",
    sourceLocationId: original.sourceLocationId,
    destinationLocationId: original.destinationLocationId,
    projectId: original.projectId,
    reference: original.reference,
    notes: reason,
    reversalOfDocumentId: original._id,
    createdByUserId: user._id,
    createdAt: now,
    updatedAt: now,
    postedAt: now,
  });

  const reversalItemIds = new Map<
    Id<"inventoryDocumentItems">,
    Id<"inventoryDocumentItems">
  >();
  for (const item of originalItems) {
    const reversalItemId = await ctx.db.insert("inventoryDocumentItems", {
      documentId: reversalId,
      lineNumber: item.lineNumber,
      materialId: item.materialId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
      createdAt: now,
    });
    reversalItemIds.set(item._id, reversalItemId);
  }

  for (const event of originalEvents) {
    const reversalItemId = reversalItemIds.get(event.documentItemId);
    if (!reversalItemId) {
      throw new Error("Item original do estorno não encontrado");
    }
    const quantityDelta = -event.quantityDelta;
    await applyBalanceDelta(
      ctx,
      {
        locationId: event.locationId,
        materialId: event.materialId,
        quantityDelta,
      },
      now
    );
    await ctx.db.insert("inventoryEvents", {
      documentId: reversalId,
      documentItemId: reversalItemId,
      type: "reversal",
      locationId: event.locationId,
      materialId: event.materialId,
      quantityDelta,
      createdByUserId: user._id,
      createdAt: now,
    });
  }

  await ctx.db.patch("inventoryDocuments", original._id, {
    status: "reversed",
    reversedByDocumentId: reversalId,
    updatedAt: now,
  });
  await logAudit(ctx, user, {
    action: "reverse",
    tableName: "inventoryDocuments",
    recordId: original._id,
    details: reason,
  });
  return reversalId;
}

export async function updateInventoryAddress(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    balanceId: Id<"inventoryBalances">;
    physicalAddress: string;
  }
): Promise<void> {
  const balance = await ctx.db.get("inventoryBalances", input.balanceId);
  if (!balance) throw new Error("Saldo não encontrado");
  const location = await ctx.db.get(
    "inventoryLocations",
    balance.locationId
  );
  if (!location || location.type !== "central") {
    throw new Error("O endereço físico só pode ser definido no estoque central");
  }
  const physicalAddress = input.physicalAddress.trim();
  await ctx.db.patch("inventoryBalances", input.balanceId, {
    physicalAddress: physicalAddress || undefined,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update_address",
    tableName: "inventoryBalances",
    recordId: input.balanceId,
    details: physicalAddress,
  });
}
