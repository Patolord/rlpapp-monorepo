import { BASE_MATERIALS, type BasePrices, baseMaterialLabel } from "@rlpapp/shared/takeoff/weights";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  getTakeoffSetting,
  priceDateToTimestamp,
  putTakeoffSetting,
  recordTakeoffPriceChanges,
  sanitizePriceNote,
  sanitizeTakeoffBasePrices,
  syncTakeoffBasePrice,
  upsertTakeoffPriceRecord,
} from "./takeoffSettings";

/**
 * Prices per kg of the RLP Takeoff base materials (`takeoffSettings.ts`): publishing the whole
 * table, dated price records, the published-price history and its one-off backfill. The pure
 * rules and the low-level writes live in `takeoffSettings.ts`.
 */

/** Points returned per material in the history (the most recent ones). */
const PRICE_HISTORY_LIMIT = 200;

/** Replaces the prices per kg (a missing key = no price) and records what changed. */
export async function saveTakeoffBasePrices(
  ctx: MutationCtx,
  user: Doc<"users">,
  prices: BasePrices
): Promise<void> {
  const clean = { prices: sanitizeTakeoffBasePrices(prices) };
  const { id, before } = await putTakeoffSetting(ctx, "basePrices", clean, user._id);
  await recordTakeoffPriceChanges(ctx, before?.prices ?? null, clean.prices, user._id, Date.now());
  await logAudit(ctx, user, {
    action: before ? "update" : "create",
    tableName: "takeoffSettings",
    recordId: id,
    entityLabel: "Preços por kg",
    snapshotBefore: before ?? undefined,
    snapshotAfter: clean,
  });
}

/** Publishes the price in force of a material (its latest record) when it changed. */
async function publishCurrentPrice(
  ctx: MutationCtx,
  user: Doc<"users">,
  material: string,
  now: number
) {
  const change = await syncTakeoffBasePrice(ctx, material, user._id, now);
  if (!change) return;
  await logAudit(ctx, user, {
    action: change.before ? "update" : "create",
    tableName: "takeoffSettings",
    recordId: change.id,
    entityLabel: "Preços por kg",
    snapshotBefore: change.before ?? undefined,
    snapshotAfter: change.after,
  });
}

/**
 * Records the price per kg of a material on a date; a second record on the same day corrects
 * the first. The published price is always the latest record's.
 */
export async function saveTakeoffPriceRecord(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { material: string; date: string; price: number; note?: string }
): Promise<Id<"takeoffPriceHistory">> {
  const price = sanitizeTakeoffBasePrices({ [input.material]: input.price })[input.material]!;
  const recordedAt = priceDateToTimestamp(input.date);
  const now = Date.now();
  if (recordedAt > now) throw new Error("A data do preço não pode estar no futuro");
  const note = sanitizePriceNote(input.note);
  const id = await upsertTakeoffPriceRecord(
    ctx,
    { material: input.material, recordedAt, price, note },
    user._id
  );
  await logAudit(ctx, user, {
    action: "update",
    tableName: "takeoffPriceHistory",
    recordId: id,
    entityLabel: `Preço por kg: ${baseMaterialLabel(input.material)}`,
    details: `${input.date}: R$ ${price}/kg${note ? ` (${note})` : ""}`,
  });
  await publishCurrentPrice(ctx, user, input.material, now);
  return id;
}

/** Removes a price record; the published price falls back to the previous record. */
export async function removeTakeoffPriceRecord(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"takeoffPriceHistory">
): Promise<void> {
  const record = await ctx.db.get("takeoffPriceHistory", id);
  if (!record) throw new Error("Registro de preço não encontrado");
  await ctx.db.delete("takeoffPriceHistory", id);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "takeoffPriceHistory",
    recordId: id,
    entityLabel: `Preço por kg: ${baseMaterialLabel(record.material)}`,
    snapshotBefore: record,
  });
  await publishCurrentPrice(ctx, user, record.material, Date.now());
}

/**
 * Published prices per kg, per material in chronological order: each point holds until the
 * next (`price: null` = no published price, the app uses the supplier's).
 */
export async function listTakeoffPriceHistory(ctx: QueryCtx) {
  const names = new Map<Id<"users">, string | null>();
  const nameOf = async (userId: Id<"users"> | undefined) => {
    if (!userId) return null;
    if (!names.has(userId)) {
      names.set(userId, (await ctx.db.get("users", userId))?.name ?? null);
    }
    return names.get(userId) ?? null;
  };
  const out = [];
  for (const { key } of BASE_MATERIALS) {
    const rows = await ctx.db
      .query("takeoffPriceHistory")
      .withIndex("by_material_recordedAt", (q) => q.eq("material", key))
      .order("desc")
      .take(PRICE_HISTORY_LIMIT);
    for (const row of rows.reverse()) {
      out.push({
        id: row._id,
        material: row.material,
        price: row.price,
        recordedAt: row.recordedAt,
        recordedBy: await nameOf(row.recordedByUserId),
        note: row.note ?? null,
      });
    }
  }
  return out;
}

/**
 * One-off backfill of the history from the audit log of the publications made before
 * `takeoffPriceHistory` existed. Does nothing when the history already has points. Returns
 * the number of points recorded.
 */
export async function backfillTakeoffPriceHistory(ctx: MutationCtx): Promise<number> {
  if (await ctx.db.query("takeoffPriceHistory").first()) return 0;
  const setting = await getTakeoffSetting(ctx, "basePrices");
  if (!setting) return 0;
  const logs = await ctx.db
    .query("auditLogs")
    .withIndex("by_record", (q) =>
      q.eq("tableName", "takeoffSettings").eq("recordId", setting._id)
    )
    .take(1000);
  let previous: BasePrices | null = null;
  let recorded = 0;
  for (const log of logs) {
    if (!log.snapshotAfter) continue;
    let prices: BasePrices;
    try {
      prices = (JSON.parse(log.snapshotAfter) as { prices?: BasePrices }).prices ?? {};
    } catch {
      continue;
    }
    recorded += await recordTakeoffPriceChanges(ctx, previous, prices, log.userId, log.createdAt);
    previous = prices;
  }
  // sem auditoria (ou incompleta): o preço em vigor entra na data da última publicação
  if (setting.updatedByUserId) {
    recorded += await recordTakeoffPriceChanges(
      ctx,
      previous,
      setting.prices,
      setting.updatedByUserId,
      setting.updatedAt
    );
  }
  return recorded;
}
