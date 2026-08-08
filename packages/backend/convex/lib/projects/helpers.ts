import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export function isProjectArchived(project: Doc<"projects">): boolean {
  return (
    project.status === "archived" ||
    project.archivedAt !== undefined
  );
}

/** IDs de usuários com acesso ao portal (novo campo com fallback legado). */
export function getPortalUserIds(project: Doc<"projects">) {
  return project.portalUserIds ?? project.clientIds ?? [];
}

/** Rótulo legado do cliente (texto livre). */
export function getLegacyClientLabel(project: Doc<"projects">): string | undefined {
  return project.client?.trim() || undefined;
}

export async function resolveCustomerLabel(
  ctx: Pick<QueryCtx, "db">,
  project: Pick<Doc<"projects">, "customerId" | "client">
): Promise<string | null> {
  if (project.customerId) {
    const customer = await ctx.db.get("customers", project.customerId);
    if (customer) return customer.name;
  }
  return project.client?.trim() || null;
}

export function assertValidLegacyNumber(legacyNumber: number): void {
  if (!Number.isSafeInteger(legacyNumber) || legacyNumber <= 0) {
    throw new Error("O número da obra deve ser um número inteiro positivo");
  }
}

export async function assertUniqueLegacyNumber(
  ctx: MutationCtx,
  legacyNumber: number,
  excludeId?: Id<"projects">
): Promise<void> {
  assertValidLegacyNumber(legacyNumber);
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_legacy_number", (q) => q.eq("legacyNumber", legacyNumber))
    .first();
  if (existing && existing._id !== excludeId) {
    throw new Error(`Já existe uma obra com o número ${legacyNumber}`);
  }
}
