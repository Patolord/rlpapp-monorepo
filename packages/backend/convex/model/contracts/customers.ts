import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { normalizeText } from "../kernel/text";

/** Busca ou cria cliente por nome normalizado (usado na migração). */
export async function findOrCreateCustomerByName(
  ctx: MutationCtx,
  params: {
    name: string;
    createdByUserId?: Id<"users">;
  }
): Promise<{ customerId: Id<"customers">; created: boolean }> {
  const name = params.name.trim();
  const nameNormalized = normalizeText(name);
  const existing = await ctx.db
    .query("customers")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  if (existing) return { customerId: existing._id, created: false };

  const now = Date.now();
  const customerId = await ctx.db.insert("customers", {
    name,
    nameNormalized,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: params.createdByUserId,
    updatedByUserId: params.createdByUserId,
  });
  return { customerId, created: true };
}
