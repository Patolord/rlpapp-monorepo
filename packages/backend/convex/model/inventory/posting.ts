import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  assertCanPostInventoryDocument,
  createInventoryDocument,
  type InventoryLineInput,
} from "./documents";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Conclusão de movimentações: aplica cada linha nos saldos
 * (`inventoryBalances`) e grava os eventos (`inventoryEvents`); estorno de
 * movimentações concluídas e o consumo em campo, criado e concluído de uma vez.
 */

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
        throw ruleViolation("Entrada sem estoque de destino");
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
        throw ruleViolation("Transferência sem origem ou destino");
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
        throw ruleViolation("Consumo sem estoque de origem");
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
        throw ruleViolation("Retorno sem origem ou destino");
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
        throw ruleViolation("Ajuste sem estoque");
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
    throw ruleViolation(
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
  if (!document) throw notFound("Movimentação não encontrada");
  if (document.type === "reversal") {
    throw ruleViolation("Estornos são concluídos automaticamente");
  }
  await assertCanPostInventoryDocument(
    ctx,
    user,
    document.type,
    document.projectId
  );
  if (document.status === "pending_approval") {
    throw ruleViolation("A movimentação aguarda aprovação do engenheiro da obra");
  }
  if (document.status !== "draft" && document.status !== "approved") {
    throw ruleViolation("Esta movimentação não pode ser concluída");
  }
  if (
    (document.compatibilityIssues?.length ?? 0) > 0 &&
    document.status !== "approved"
  ) {
    throw ruleViolation("As incompatibilidades precisam ser aprovadas");
  }

  const items = await ctx.db
    .query("inventoryDocumentItems")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  if (items.length === 0) throw ruleViolation("A movimentação não possui itens");

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

export async function reverseInventoryDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { documentId: Id<"inventoryDocuments">; reason: string }
): Promise<Id<"inventoryDocuments">> {
  const reason = input.reason.trim();
  if (!reason) throw ruleViolation("Informe o motivo do estorno");
  const original = await ctx.db.get("inventoryDocuments", input.documentId);
  if (!original) throw notFound("Movimentação não encontrada");
  if (original.status !== "posted") {
    throw ruleViolation("Somente movimentações concluídas podem ser estornadas");
  }
  if (original.reversedByDocumentId) {
    throw ruleViolation("Esta movimentação já foi estornada");
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
      throw notFound("Item original do estorno não encontrado");
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
    throw ruleViolation("Consumo em campo não pode exigir aprovação");
  }
  await postInventoryDocument(ctx, user, created.documentId);
  return created.documentId;
}
