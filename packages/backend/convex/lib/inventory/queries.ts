import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

async function materialName(
  ctx: QueryCtx,
  materialId: Id<"materials">
): Promise<string> {
  const material = await ctx.db.get("materials", materialId);
  return material?.name ?? "Material removido";
}

type ProjectDocumentsCursor = {
  v: 1;
  db: string | null;
  pending: Id<"inventoryDocuments">[];
  /** true quando a varredura do índice já terminou (não recomeçar do início). */
  dbDone: boolean;
};

function decodeProjectDocumentsCursor(raw: string | null): {
  dbCursor: string | null;
  pendingIds: Id<"inventoryDocuments">[];
  dbDone: boolean;
} {
  if (raw == null || raw === "") {
    return { dbCursor: null, pendingIds: [], dbDone: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectDocumentsCursor>;
    if (parsed?.v === 1) {
      return {
        dbCursor: parsed.db ?? null,
        pendingIds: Array.isArray(parsed.pending) ? parsed.pending : [],
        dbDone: parsed.dbDone === true,
      };
    }
  } catch {
    // Cursor opaco legado do Convex — continua a paginação a partir dele.
  }
  return { dbCursor: raw, pendingIds: [], dbDone: false };
}

function encodeProjectDocumentsCursor(
  dbCursor: string | null,
  pendingIds: Id<"inventoryDocuments">[],
  dbDone: boolean
): string {
  const payload: ProjectDocumentsCursor = {
    v: 1,
    db: dbCursor,
    pending: pendingIds,
    dbDone,
  };
  return JSON.stringify(payload);
}

function isProjectDocument(document: Doc<"inventoryDocuments">): boolean {
  return document.projectId !== undefined;
}

/**
 * Pagina movimentações. Quando `projectOnly`, ignora documentos do central e
 * mantém metadados de paginação coerentes (tamanho da página / continueCursor).
 */
export async function paginateInventoryDocuments(
  ctx: QueryCtx,
  args: {
    status?: Doc<"inventoryDocuments">["status"];
    numItems: number;
    cursor: string | null;
    projectOnly: boolean;
  }
): Promise<{
  page: Doc<"inventoryDocuments">[];
  isDone: boolean;
  continueCursor: string;
}> {
  const paginateBase = async (paginationOpts: {
    numItems: number;
    cursor: string | null;
  }) => {
    if (args.status) {
      return await ctx.db
        .query("inventoryDocuments")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db
      .query("inventoryDocuments")
      .order("desc")
      .paginate(paginationOpts);
  };

  if (!args.projectOnly) {
    const results = await paginateBase({
      numItems: args.numItems,
      cursor: args.cursor,
    });
    return {
      page: results.page,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  }

  const {
    dbCursor,
    pendingIds,
    dbDone: initialDbDone,
  } = decodeProjectDocumentsCursor(args.cursor);
  const collected: Doc<"inventoryDocuments">[] = [];
  const remainingPending: Id<"inventoryDocuments">[] = [];

  for (const documentId of pendingIds) {
    const document = await ctx.db.get("inventoryDocuments", documentId);
    if (!document || !isProjectDocument(document)) continue;
    if (args.status && document.status !== args.status) continue;
    if (collected.length < args.numItems) {
      collected.push(document);
    } else {
      remainingPending.push(documentId);
    }
  }

  let cursor = dbCursor;
  let dbDone = initialDbDone;
  let continueCursor = dbCursor ?? "";
  let batches = 0;
  const maxBatches = 25;

  while (
    collected.length < args.numItems &&
    !dbDone &&
    batches < maxBatches
  ) {
    // Lê um pouco a mais por lote para atravessar trechos só do central.
    const results = await paginateBase({
      numItems: Math.max(args.numItems, 50),
      cursor,
    });
    batches += 1;
    continueCursor = results.continueCursor;
    dbDone = results.isDone;
    cursor = results.continueCursor;

    for (const document of results.page) {
      if (!isProjectDocument(document)) continue;
      if (collected.length < args.numItems) {
        collected.push(document);
      } else {
        remainingPending.push(document._id);
      }
    }
  }

  const done = dbDone && remainingPending.length === 0;
  return {
    page: collected,
    isDone: done,
    continueCursor: done
      ? continueCursor
      : encodeProjectDocumentsCursor(
          dbDone ? null : continueCursor,
          remainingPending,
          dbDone
        ),
  };
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
