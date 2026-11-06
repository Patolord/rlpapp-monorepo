import { v } from "convex/values";
import { projectDocumentTechnicianAccess } from "./schema/engineering";
import {
  authedQuery,
  documentosMutation,
  documentosQuery,
  requireUser,
} from "./lib/rbac";
import { internalQuery } from "./_generated/server";
import { assertTechnicianProjectAccess } from "./model/engineering/projects";
import {
  createProjectDocument,
  listOfficeDocuments,
  listVisibleDocuments,
  loadDocumentForUser,
  removeProjectDocument,
  toDownloadFileName,
  toFieldDocument,
  updateProjectDocument,
} from "./model/engineering/documents";

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

// ---------------------------------------------------------------------------
// Escritório (engenharia)
// ---------------------------------------------------------------------------

export const generateUploadUrl = documentosMutation({
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
export const discardUpload = documentosMutation({
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

export const create = documentosMutation({
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
    return await createProjectDocument(ctx, ctx.user, args);
  },
});

export const update = documentosMutation({
  args: {
    documentId: v.id("projectDocuments"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    technicianAccess: v.optional(projectDocumentTechnicianAccess),
    allowedTechnicianIds: v.optional(v.array(v.id("users"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateProjectDocument(ctx, ctx.user, args);
    return null;
  },
});

export const remove = documentosMutation({
  args: { documentId: v.id("projectDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeProjectDocument(ctx, ctx.user, args.documentId);
    return null;
  },
});

export const listByProject = documentosQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(officeDocumentValidator),
  handler: async (ctx, args) => {
    return await listOfficeDocuments(ctx, args.projectId);
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
