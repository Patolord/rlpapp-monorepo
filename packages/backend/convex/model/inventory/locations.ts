import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Locais de estoque: o estoque central (um só) e um estoque por obra, criados
 * sob demanda na primeira movimentação.
 */

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
  if (!location) throw ruleViolation("Não foi possível criar o estoque central");
  return location;
}

export async function getOrCreateProjectLocation(
  ctx: MutationCtx,
  projectId: Id<"projects">
): Promise<Doc<"inventoryLocations">> {
  const existing = await findInventoryLocation(ctx, projectId);
  if (existing) return existing;

  const project = await ctx.db.get("projects", projectId);
  if (!project) throw notFound("Obra não encontrada");
  const locationId = await ctx.db.insert("inventoryLocations", {
    type: "project",
    name: `Obra: ${project.name}`,
    projectId,
    active: true,
    createdAt: Date.now(),
  });
  const location = await ctx.db.get("inventoryLocations", locationId);
  if (!location) throw ruleViolation("Não foi possível criar o estoque da obra");
  return location;
}
