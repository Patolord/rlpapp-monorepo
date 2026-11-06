import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { looksLikeConvexId } from "./slug";
import { seesAllFieldProjects } from "../../lib/rbac";

/** Resolve uma obra por slug (preferido) ou por id (fallback legado). */
export async function resolveProjectByIdentifier(
  ctx: QueryCtx | MutationCtx,
  identifier: string
): Promise<Doc<"projects"> | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const bySlug = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", trimmed))
    .first();
  if (bySlug) return bySlug;

  if (looksLikeConvexId(trimmed)) {
    return await ctx.db.get("projects", trimmed as Id<"projects">);
  }
  return null;
}

/** Resolve slug/ID legado para o `_id` e o slug canônico (ID quando sem slug). */
export async function resolveProjectSlug(
  ctx: QueryCtx | MutationCtx,
  identifier: string
): Promise<{ _id: Id<"projects">; slug: string } | null> {
  const project = await resolveProjectByIdentifier(ctx, identifier);
  if (!project) return null;
  return { _id: project._id, slug: project.slug ?? project._id };
}

export async function assertTechnicianProjectAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (seesAllFieldProjects(user)) return project;
  const allowed = (project.technicianIds ?? []).includes(user._id);
  if (!allowed) throw new Error("Acesso negado a esta obra");
  return project;
}

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
  project: Pick<Doc<"projects">, "customerId" | "client">,
  cache?: Map<string, string | null>
): Promise<string | null> {
  if (project.customerId) {
    const cached = cache?.get(project.customerId);
    if (cached !== undefined) return cached;
    const customer = await ctx.db.get("customers", project.customerId);
    const label = customer?.name ?? (project.client?.trim() || null);
    cache?.set(project.customerId, label);
    return label;
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
  const matches = await ctx.db
    .query("projects")
    .withIndex("by_legacy_number", (q) => q.eq("legacyNumber", legacyNumber))
    .take(2);
  if (matches.some((project) => project._id !== excludeId)) {
    throw new Error(`Já existe uma obra com o número ${legacyNumber}`);
  }
}
