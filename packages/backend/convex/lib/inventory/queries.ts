import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

async function materialName(
  ctx: QueryCtx,
  materialId: Id<"materials">
): Promise<string> {
  const material = await ctx.db.get("materials", materialId);
  return material?.name ?? "Material removido";
}

export async function enrichInventoryDocument(
  ctx: QueryCtx,
  document: Doc<"inventoryDocuments">
) {
  const [source, destination, project, createdBy, items] = await Promise.all([
    document.sourceLocationId
      ? ctx.db.get("inventoryLocations", document.sourceLocationId)
      : null,
    document.destinationLocationId
      ? ctx.db.get("inventoryLocations", document.destinationLocationId)
      : null,
    document.projectId ? ctx.db.get("projects", document.projectId) : null,
    ctx.db.get("users", document.createdByUserId),
    ctx.db
      .query("inventoryDocumentItems")
      .withIndex("by_document", (q) =>
        q.eq("documentId", document._id)
      )
      .collect(),
  ]);

  const enrichedItems = await Promise.all(
    items.map(async (item) => ({
      _id: item._id,
      materialId: item.materialId,
      materialName: await materialName(ctx, item.materialId),
      quantity: item.quantity,
      unitCostCents: item.unitCostCents ?? null,
    }))
  );
  const issues = await Promise.all(
    (document.compatibilityIssues ?? []).map(async (issue) => ({
      ...issue,
      materialAName: await materialName(ctx, issue.materialAId),
      materialBName: await materialName(ctx, issue.materialBId),
    }))
  );

  return {
    _id: document._id,
    type: document.type,
    status: document.status,
    projectId: document.projectId ?? null,
    projectName: project?.name ?? null,
    sourceLocationName: source?.name ?? null,
    destinationLocationName: destination?.name ?? null,
    reference: document.reference ?? null,
    notes: document.notes ?? null,
    approvalReason: document.approvalReason ?? null,
    createdByName: createdBy?.name ?? "Usuário removido",
    createdAt: document.createdAt,
    postedAt: document.postedAt ?? null,
    items: enrichedItems,
    compatibilityIssues: issues,
  };
}

export async function listProjectInventorySummaries(ctx: QueryCtx) {
  const projects = await ctx.db.query("projects").order("desc").take(100);
  return await Promise.all(
    projects.map(async (project) => {
      const location = await ctx.db
        .query("inventoryLocations")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .first();
      const balances = location
        ? await ctx.db
            .query("inventoryBalances")
            .withIndex("by_location", (q) =>
              q.eq("locationId", location._id)
            )
            .take(500)
        : [];
      const documents = await ctx.db
        .query("inventoryDocuments")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .order("desc")
        .take(500);
      const posted = documents.filter((document) => document.status === "posted");

      return {
        projectId: project._id,
        projectName: project.name,
        responsibleId: project.responsibleId ?? null,
        materialCount: balances.filter((balance) => balance.quantity !== 0).length,
        transferCount: posted.filter((document) => document.type === "transfer")
          .length,
        consumptionCount: posted.filter(
          (document) => document.type === "consumption"
        ).length,
        returnCount: posted.filter((document) => document.type === "return")
          .length,
      };
    })
  );
}
