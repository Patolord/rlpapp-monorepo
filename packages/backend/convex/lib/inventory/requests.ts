import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { looksLikeConvexId } from "../engenharia/slug";
import { hasPermission } from "../rbac";
import { assertTechnicianProjectAccess } from "../../technicianPortal";
import { createAndPostConsumption, findInventoryLocation } from "./operations";

export const MAX_INVENTORY_REQUEST_LINES = 20;

export function canReviewMaterialRequests(user: Doc<"users">): boolean {
  return (
    user.role === "director" ||
    user.role === "admin" ||
    user.role === "engenheiro" ||
    user.department === "engenharia"
  );
}

export function canFulfillMaterialRequests(user: Doc<"users">): boolean {
  return (
    user.role === "director" ||
    user.role === "admin" ||
    hasPermission(user, "estoque.write")
  );
}

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

export async function requireAssignedProject(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  return await assertTechnicianProjectAccess(ctx, user, projectId);
}

export async function getProjectMaterialBalance(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  materialId: Id<"materials">
): Promise<Doc<"inventoryBalances"> | null> {
  const location = await findInventoryLocation(ctx, projectId);
  if (!location) return null;
  return await ctx.db
    .query("inventoryBalances")
    .withIndex("by_location_material", (q) =>
      q.eq("locationId", location._id).eq("materialId", materialId)
    )
    .unique();
}

export async function consumeRemainingOnObra(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    projectId: Id<"projects">;
    materialId: Id<"materials">;
    notes?: string;
  }
): Promise<{ documentId: Id<"inventoryDocuments">; quantity: number }> {
  const balance = await getProjectMaterialBalance(
    ctx,
    input.projectId,
    input.materialId
  );
  if (!balance || balance.quantity <= 0) {
    throw new Error("Este material já está zerado nesta obra");
  }
  const documentId = await createAndPostConsumption(ctx, user, {
    projectId: input.projectId,
    notes: input.notes,
    lines: [{ materialId: input.materialId, quantity: balance.quantity }],
  });
  return { documentId, quantity: balance.quantity };
}

export async function loadRequestItems(
  ctx: QueryCtx | MutationCtx,
  requestId: Id<"inventoryRequests">
): Promise<Doc<"inventoryRequestItems">[]> {
  return await ctx.db
    .query("inventoryRequestItems")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .collect();
}

export async function enrichRequest(
  ctx: QueryCtx,
  request: Doc<"inventoryRequests">
) {
  const [project, requester, reviewer, items] = await Promise.all([
    ctx.db.get("projects", request.projectId),
    ctx.db.get("users", request.requestedByUserId),
    request.reviewedByUserId
      ? ctx.db.get("users", request.reviewedByUserId)
      : null,
    loadRequestItems(ctx, request._id),
  ]);

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const material = await ctx.db.get("materials", item.materialId);
      return {
        _id: item._id,
        materialId: item.materialId,
        materialName: material?.name ?? "Material removido",
        variantLabel: material?.variantLabel ?? null,
        unit: item.unit ?? material?.unit ?? null,
        quantity: item.quantity,
        reason: item.reason,
        markedDepleted: item.markedDepleted,
      };
    })
  );

  return {
    _id: request._id,
    projectId: request.projectId,
    projectName: project?.name ?? "Obra removida",
    projectSlug: project?.slug ?? project?._id ?? request.projectId,
    status: request.status,
    notes: request.notes ?? null,
    requestedByUserId: request.requestedByUserId,
    requestedByName: requester?.name ?? "Usuário removido",
    reviewedByName: reviewer?.name ?? null,
    reviewedAt: request.reviewedAt ?? null,
    reviewNotes: request.reviewNotes ?? null,
    fulfilledByDocumentId: request.fulfilledByDocumentId ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    items: enrichedItems,
  };
}

export async function listRequestsByFilter(
  ctx: QueryCtx,
  args: {
    projectId?: Id<"projects">;
    status?: Doc<"inventoryRequests">["status"];
    requestedByUserId?: Id<"users">;
    limit?: number;
  }
): Promise<Doc<"inventoryRequests">[]> {
  const limit = args.limit ?? 100;

  if (args.projectId && args.status) {
    return await ctx.db
      .query("inventoryRequests")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId!).eq("status", args.status!)
      )
      .order("desc")
      .take(limit);
  }
  if (args.projectId) {
    return await ctx.db
      .query("inventoryRequests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
      .order("desc")
      .take(limit);
  }
  if (args.requestedByUserId) {
    const rows = await ctx.db
      .query("inventoryRequests")
      .withIndex("by_requested_by", (q) =>
        q.eq("requestedByUserId", args.requestedByUserId!)
      )
      .order("desc")
      .take(limit);
    return args.status
      ? rows.filter((row) => row.status === args.status)
      : rows;
  }
  if (args.status) {
    return await ctx.db
      .query("inventoryRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status!))
      .order("desc")
      .take(limit);
  }
  return await ctx.db.query("inventoryRequests").order("desc").take(limit);
}

export async function sentAndConsumedByMaterial(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<{
  sent: Map<Id<"materials">, number>;
  consumed: Map<Id<"materials">, number>;
}> {
  const documents = await ctx.db
    .query("inventoryDocuments")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .take(500);
  const posted = documents.filter((document) => document.status === "posted");
  const sent = new Map<Id<"materials">, number>();
  const consumed = new Map<Id<"materials">, number>();

  for (const document of posted) {
    if (document.type !== "transfer" && document.type !== "consumption") {
      continue;
    }
    const items = await ctx.db
      .query("inventoryDocumentItems")
      .withIndex("by_document", (q) => q.eq("documentId", document._id))
      .collect();
    const target = document.type === "transfer" ? sent : consumed;
    for (const item of items) {
      target.set(item.materialId, (target.get(item.materialId) ?? 0) + item.quantity);
    }
  }

  return { sent, consumed };
}
