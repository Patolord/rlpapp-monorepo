import { v } from "convex/values";
import { projectDocumentTechnicianAccess } from "./schema";
import {
  authedQuery,
  engineeringMutation,
  engineeringQuery,
  requireUser,
} from "./lib/rbac";
import { internalQuery } from "./_generated/server";
import { logAudit } from "./lib/audit";
import {
  assertTechnicianProjectAccess,
  isProjectArchived,
} from "./lib/projects/helpers";
import {
  assertValidPdfUpload,
  canUserViewDocument,
  listVisibleDocuments,
  normalizeAllowedTechnicians,
  normalizeDocumentName,
  toDownloadFileName,
} from "./lib/projects/documents";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Documentos (PDF) da obra. A engenharia envia e decide quais técnicos de
// campo podem ver/baixar cada arquivo. Técnicos consomem via
// listForTechnician/getForTechnician (acesso filtrado por documento).
//
// O arquivo em si nunca é exposto por URL direta do storage: o download passa
// pelo endpoint HTTP autenticado (`GET /project-documents/:id`, em http.ts),
// que reavalia o acesso a cada pedido — revogar o acesso revoga o download.

// ---------------------------------------------------------------------------
// Validators compartilhados
// ---------------------------------------------------------------------------

const fieldDocumentValidator = v.object({
  _id: v.id("projectDocuments"),
  projectId: v.id("projects"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  fileName: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

const officeDocumentValidator = v.object({
  _id: v.id("projectDocuments"),
  projectId: v.id("projects"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  fileName: v.string(),
  contentType: v.string(),
  sizeBytes: v.number(),
  technicianAccess: projectDocumentTechnicianAccess,
  allowedTechnicians: v.array(
    v.object({ _id: v.id("users"), name: v.string() })
  ),
  uploadedBy: v.union(
    v.object({ _id: v.id("users"), name: v.string() }),
    v.null()
  ),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
});

function toFieldDocument(document: Doc<"projectDocuments">) {
  return {
    _id: document._id,
    projectId: document.projectId,
    name: document.name,
    description: document.description ?? null,
    fileName: toDownloadFileName(document.name),
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt ?? null,
  };
}

function toOfficeDocument(
  document: Doc<"projectDocuments">,
  userNames: Map<Id<"users">, string>
) {
  const base = toFieldDocument(document);
  const allowedTechnicians = (document.allowedTechnicianIds ?? [])
    .map((id) => ({ _id: id, name: userNames.get(id) ?? "Usuário removido" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const uploaderName = userNames.get(document.uploadedByUserId);
  return {
    ...base,
    technicianAccess: document.technicianAccess,
    allowedTechnicians,
    uploadedBy: uploaderName
      ? { _id: document.uploadedByUserId, name: uploaderName }
      : null,
  };
}

async function loadUserNames(
  ctx: QueryCtx,
  ids: Iterable<Id<"users">>
): Promise<Map<Id<"users">, string>> {
  const names = new Map<Id<"users">, string>();
  for (const id of new Set(ids)) {
    const user = await ctx.db.get("users", id);
    if (user) names.set(id, user.name);
  }
  return names;
}

async function requireActiveProject(
  ctx: QueryCtx,
  projectId: Id<"projects">
): Promise<Doc<"projects">> {
  const project = await ctx.db.get("projects", projectId);
  if (!project) throw new Error("Obra não encontrada");
  if (isProjectArchived(project)) {
    throw new Error("Obra arquivada — restaure antes de alterar documentos");
  }
  return project;
}

async function requireDocument(
  ctx: QueryCtx,
  documentId: Id<"projectDocuments">
): Promise<Doc<"projectDocuments">> {
  const document = await ctx.db.get("projectDocuments", documentId);
  if (!document) throw new Error("Documento não encontrado");
  return document;
}

// ---------------------------------------------------------------------------
// Escritório (engenharia)
// ---------------------------------------------------------------------------

export const generateUploadUrl = engineeringMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Apaga um arquivo recém-enviado cujo cadastro falhou (nome inválido, obra
 * arquivada…). Só remove arquivos ainda não vinculados a um documento, para
 * nunca apagar o PDF de um documento existente.
 */
export const discardUpload = engineeringMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await ctx.db
      .query("projectDocuments")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (referenced) throw new Error("Este arquivo pertence a um documento");
    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // Já removido (ou nunca existiu): nada a fazer.
    }
    return null;
  },
});

export const create = engineeringMutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    name: v.string(),
    description: v.optional(v.string()),
    technicianAccess: projectDocumentTechnicianAccess,
    allowedTechnicianIds: v.optional(v.array(v.id("users"))),
  },
  returns: v.id("projectDocuments"),
  handler: async (ctx, args) => {
    const project = await requireActiveProject(ctx, args.projectId);

    const existing = await ctx.db
      .query("projectDocuments")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (existing) throw new Error("Este arquivo já foi cadastrado");

    const file = await assertValidPdfUpload(ctx, args.storageId);
    const name = normalizeDocumentName(args.name);
    const description = args.description?.trim() || undefined;
    const allowedTechnicianIds = normalizeAllowedTechnicians(
      project,
      args.technicianAccess,
      args.allowedTechnicianIds
    );

    const documentId = await ctx.db.insert("projectDocuments", {
      projectId: args.projectId,
      storageId: args.storageId,
      name,
      description,
      contentType: file.contentType,
      sizeBytes: file.size,
      technicianAccess: args.technicianAccess,
      allowedTechnicianIds,
      uploadedByUserId: ctx.user._id,
      createdAt: Date.now(),
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "projectDocuments",
      recordId: documentId,
      entityLabel: name,
      details: `Obra ${project.name} · acesso técnicos: ${args.technicianAccess}`,
    });
    return documentId;
  },
});

export const update = engineeringMutation({
  args: {
    documentId: v.id("projectDocuments"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    technicianAccess: v.optional(projectDocumentTechnicianAccess),
    allowedTechnicianIds: v.optional(v.array(v.id("users"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await requireDocument(ctx, args.documentId);
    const project = await requireActiveProject(ctx, document.projectId);

    const technicianAccess = args.technicianAccess ?? document.technicianAccess;
    const allowedTechnicianIds = normalizeAllowedTechnicians(
      project,
      technicianAccess,
      args.allowedTechnicianIds ?? document.allowedTechnicianIds
    );
    const name =
      args.name === undefined ? document.name : normalizeDocumentName(args.name);
    const description =
      args.description === undefined
        ? document.description
        : args.description?.trim() || undefined;

    await ctx.db.patch("projectDocuments", args.documentId, {
      name,
      description,
      technicianAccess,
      allowedTechnicianIds,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "projectDocuments",
      recordId: args.documentId,
      entityLabel: name,
      changes: [
        ...(name !== document.name
          ? [{ field: "name", previousValue: document.name, newValue: name }]
          : []),
        ...(technicianAccess !== document.technicianAccess
          ? [
              {
                field: "technicianAccess",
                previousValue: document.technicianAccess,
                newValue: technicianAccess,
              },
            ]
          : []),
      ],
    });
    return null;
  },
});

export const remove = engineeringMutation({
  args: { documentId: v.id("projectDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const document = await requireDocument(ctx, args.documentId);
    const project = await ctx.db.get("projects", document.projectId);

    await ctx.db.delete("projectDocuments", args.documentId);
    try {
      await ctx.storage.delete(document.storageId);
    } catch {
      // O arquivo pode já ter sido removido; o registro é o que importa.
    }

    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "projectDocuments",
      recordId: args.documentId,
      entityLabel: document.name,
      details: project ? `Obra ${project.name}` : undefined,
      snapshotBefore: document,
    });
    return null;
  },
});

export const listByProject = engineeringQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(officeDocumentValidator),
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("projectDocuments")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    documents.sort((a, b) => b.createdAt - a.createdAt);

    const userNames = await loadUserNames(
      ctx,
      documents.flatMap((document) => [
        document.uploadedByUserId,
        ...(document.allowedTechnicianIds ?? []),
      ])
    );
    return documents.map((document) => toOfficeDocument(document, userNames));
  },
});

// ---------------------------------------------------------------------------
// Campo (técnico atribuído ou staff)
// ---------------------------------------------------------------------------

export const listForTechnician = authedQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(fieldDocumentValidator),
  handler: async (ctx, args) => {
    const project = await assertTechnicianProjectAccess(
      ctx,
      ctx.user,
      args.projectId
    );
    const documents = await listVisibleDocuments(ctx, ctx.user, project);
    documents.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return documents.map(toFieldDocument);
  },
});

async function loadDocumentForUser(
  ctx: QueryCtx,
  user: Doc<"users">,
  documentId: Id<"projectDocuments">
): Promise<Doc<"projectDocuments"> | null> {
  const document = await ctx.db.get("projectDocuments", documentId);
  if (!document) return null;
  const project = await ctx.db.get("projects", document.projectId);
  if (!project) return null;
  if (!canUserViewDocument(user, project, document)) {
    throw new Error("Acesso negado a este documento");
  }
  return document;
}

export const getForTechnician = authedQuery({
  args: { documentId: v.id("projectDocuments") },
  returns: v.union(fieldDocumentValidator, v.null()),
  handler: async (ctx, args) => {
    const document = await loadDocumentForUser(ctx, ctx.user, args.documentId);
    return document ? toFieldDocument(document) : null;
  },
});

// ---------------------------------------------------------------------------
// Download autenticado (usado pelo endpoint HTTP em http.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve o arquivo a servir para o usuário autenticado na requisição HTTP.
 * Reaplica a regra de acesso a cada download. Lança "Not authenticated" sem
 * sessão e "Acesso negado…" quando o usuário perdeu o acesso.
 */
export const resolveDownload = internalQuery({
  args: { documentId: v.id("projectDocuments") },
  returns: v.union(
    v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const document = await loadDocumentForUser(ctx, user, args.documentId);
    if (!document) return null;
    return {
      storageId: document.storageId,
      fileName: toDownloadFileName(document.name),
      contentType: document.contentType,
    };
  },
});
