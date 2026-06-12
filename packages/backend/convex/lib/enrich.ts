import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Resolve o produto de cada linha (padrão "fetch lines → enrich product"). */
async function enrichWithProduct<T extends { productId: Id<"products"> }>(
  ctx: QueryCtx,
  lines: T[]
): Promise<(T & { product: Doc<"products"> | null })[]> {
  return Promise.all(
    lines.map(async (line) => ({
      ...line,
      product: await ctx.db.get("products", line.productId),
    }))
  );
}

/** Linhas de um recibo com produto resolvido. */
export async function getReceiptLinesWithProducts(
  ctx: QueryCtx,
  receiptId: Id<"receipts">
) {
  const lines = await ctx.db
    .query("receiptLines")
    .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
    .collect();
  return enrichWithProduct(ctx, lines);
}

/** Linhas de uma remessa com produto resolvido. */
export async function getShipmentLinesWithProducts(
  ctx: QueryCtx,
  shipmentId: Id<"shipments">
) {
  const lines = await ctx.db
    .query("shipmentLines")
    .withIndex("by_shipment", (q) => q.eq("shipmentId", shipmentId))
    .collect();
  return enrichWithProduct(ctx, lines);
}

/** Linhas de uma solicitação de material com produto resolvido. */
export async function getRequestLinesWithProducts(
  ctx: QueryCtx,
  requestId: Id<"materialRequests">
) {
  const lines = await ctx.db
    .query("materialRequestLines")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .collect();
  return enrichWithProduct(ctx, lines);
}
