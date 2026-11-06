import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import type {
  priceEventReviewStatus,
  priceEventSource,
} from "../../schema/procurement";
import { sanitizeDimensions, type MaterialDimensions } from "./catalog";
import { enrichPriceEvent } from "./priceEvents";
import { computeNeedsReview } from "./pricing";
import { promoteTakeoffItem } from "./takeoffPromotion";

/** Registro de preços e a fila de revisão da Compras. */

export type AddPriceEventInput = {
  rawDescription?: string;
  materialId?: Id<"materials">;
  supplierId?: Id<"suppliers">;
  supplierNameRaw?: string;
  unitPriceCents: number;
  unit?: string;
  quantity?: number;
  source: Infer<typeof priceEventSource>;
  occurredAt: number;
  validUntil?: number;
  projectId?: Id<"projects">;
  takeoffId?: Id<"takeoffs">;
  takeoffItemId?: Id<"takeoffItems">;
  dimensions?: MaterialDimensions;
  notes?: string;
};

/**
 * Registra um preço. Com `takeoffItemId`, preenche material, takeoff, obra,
 * unidade, descrição e medidas a partir do item; um item sem material ganha o
 * SKU da sua medida.
 */
export async function addPriceEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: AddPriceEventInput
): Promise<Id<"priceEvents">> {
  if (input.unitPriceCents < 0) throw new Error("Preço inválido");

  let materialId = input.materialId;
  let takeoffId = input.takeoffId;
  let projectId = input.projectId;
  let unit = input.unit?.trim() || undefined;
  let rawDescription = input.rawDescription?.trim() || undefined;
  let dimensions = sanitizeDimensions(input.dimensions);

  if (input.takeoffItemId) {
    const item = await ctx.db.get("takeoffItems", input.takeoffItemId);
    if (!item) throw new Error("Item do takeoff não encontrado");
    if (materialId && item.materialId && materialId !== item.materialId) {
      throw new Error("Material diferente do vinculado ao item do takeoff");
    }
    if (!item.materialId) {
      const promoted = await promoteTakeoffItem(ctx, user, item);
      materialId = promoted.materialId;
    } else {
      materialId = item.materialId;
    }
    takeoffId ??= item.takeoffId;
    projectId ??= item.projectId;
    unit ??= item.unit?.trim() || undefined;
    rawDescription ??= item.rawDescription;
    dimensions ??= sanitizeDimensions(item.customDimensions);
  }

  if (!dimensions && materialId) {
    const material = await ctx.db.get("materials", materialId);
    dimensions = material?.dimensions;
  }

  const needsReview = computeNeedsReview({
    materialId,
    supplierId: input.supplierId,
    supplierNameRaw: input.supplierNameRaw,
    unit,
    rawDescription,
  });

  const now = Date.now();
  const eventId = await ctx.db.insert("priceEvents", {
    rawDescription,
    materialId,
    supplierId: input.supplierId,
    supplierNameRaw: input.supplierNameRaw?.trim() || undefined,
    unitPriceCents: input.unitPriceCents,
    unit,
    quantity: input.quantity,
    source: input.source,
    occurredAt: input.occurredAt,
    validUntil: input.validUntil,
    projectId,
    takeoffId,
    takeoffItemId: input.takeoffItemId,
    dimensions,
    notes: input.notes?.trim() || undefined,
    reviewStatus: needsReview ? "unreviewed" : "reviewed",
    needsReview,
    createdAt: now,
    createdByUserId: user._id,
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "priceEvents",
    recordId: eventId,
  });

  return eventId;
}

export async function listPriceReviewQueue(
  ctx: QueryCtx,
  input: { now: number; limit?: number }
) {
  const limit = input.limit ?? 100;
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_needs_review", (q) => q.eq("needsReview", true))
    .order("desc")
    .take(limit);

  const out = [];
  for (const event of events) {
    out.push(await enrichPriceEvent(ctx, event, input.now));
  }
  return out;
}

export type UpdatePriceEventReviewInput = {
  eventId: Id<"priceEvents">;
  reviewStatus: Infer<typeof priceEventReviewStatus>;
  materialId?: Id<"materials">;
  supplierId?: Id<"suppliers">;
  unit?: string;
};

export async function updatePriceEventReview(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdatePriceEventReviewInput
): Promise<void> {
  const event = await ctx.db.get("priceEvents", input.eventId);
  if (!event) throw new Error("Evento de preço não encontrado");

  const materialId = input.materialId ?? event.materialId;
  const supplierId = input.supplierId ?? event.supplierId;
  const unit = input.unit ?? event.unit;

  const needsReview =
    input.reviewStatus === "ignored" || input.reviewStatus === "duplicate"
      ? false
      : computeNeedsReview({
          materialId,
          supplierId,
          supplierNameRaw: event.supplierNameRaw,
          unit,
          rawDescription: event.rawDescription,
        });

  await ctx.db.patch("priceEvents", input.eventId, {
    reviewStatus: input.reviewStatus,
    materialId,
    supplierId,
    unit: unit?.trim() || undefined,
    needsReview,
  });

  await logAudit(ctx, user, {
    action: "review",
    tableName: "priceEvents",
    recordId: input.eventId,
    details: input.reviewStatus,
  });
}
