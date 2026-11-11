import { notify } from "../notifications/notify";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { hasPermission, isStaff } from "../../lib/rbac";
import { assertTechnicianProjectAccess, isProjectArchived } from "./projects";

/** Limite por arquivo (PDF). Convex aceita arquivos maiores, mas em campo
 * o download acontece em rede móvel — manter razoável. */
export const MAX_PROJECT_DOCUMENT_BYTES = 50 * 1024 * 1024;

export const PROJECT_DOCUMENT_CONTENT_TYPE = "application/pdf";

export type TechnicianAccess = Doc<"projectDocuments">["technicianAccess"];

/**
 * Regra de visibilidade em campo. Staff sempre enxerga; técnico precisa
 * estar atribuído à obra (não arquivada) e o documento precisa liberar o
 * acesso.
 */
export function canUserViewDocument(
  user: Doc<"users">,
  project: Doc<"projects">,
  document: Pick<
    Doc<"projectDocuments">,
    "technicianAccess" | "allowedTechnicianIds"
  >
): boolean {
  if (isStaff(user)) return true;
  // Obra arquivada some do campo (mesma regra de listMyProjects/getMyProject).
  if (isProjectArchived(project)) return false;
  // Técnico líder (campo.todas_obras) conta como atribuído a toda obra, mas
  // a regra de acesso de cada documento continua valendo.
  if (
    !hasPermission(user, "campo.todas_obras") &&
    !(project.technicianIds ?? []).includes(user._id)
  ) {
    return false;
  }
  switch (document.technicianAccess) {
    case "all":
      return true;
    case "selected":
      return (document.allowedTechnicianIds ?? []).includes(user._id);
    case "none":
      return false;
  }
}

/**
 * Normaliza a lista de técnicos liberados: só mantém quem está atribuído à
 * obra. Para "none"/"all" a lista é descartada.
 */
export function normalizeAllowedTechnicians(
  project: Doc<"projects">,
  access: TechnicianAccess,
  allowedTechnicianIds: Id<"users">[] | undefined
): Id<"users">[] | undefined {
  if (access !== "selected") return undefined;
  const assigned = new Set(project.technicianIds ?? []);
  const unique = Array.from(new Set(allowedTechnicianIds ?? [])).filter((id) =>
    assigned.has(id)
  );
  if (unique.length === 0) {
    throw new Error(
      "Selecione ao menos um técnico atribuído à obra para liberar o documento"
    );
  }
  return unique;
}

export async function assertValidPdfUpload(
  ctx: MutationCtx,
  storageId: Id<"_storage">
): Promise<{ contentType: string; size: number }> {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    throw new Error("Arquivo não encontrado. Envie o PDF novamente.");
  }
  // O storage grava contentType a partir do header Content-Type do upload.
  // Uploads sem tipo (ou com outro tipo) são recusados; o cliente ainda
  // confere a assinatura %PDF- antes de enviar.
  if (metadata.contentType !== PROJECT_DOCUMENT_CONTENT_TYPE) {
    throw new Error("Apenas arquivos PDF são aceitos");
  }
  if (metadata.size > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new Error("O PDF deve ter no máximo 50 MB");
  }
  return { contentType: PROJECT_DOCUMENT_CONTENT_TYPE, size: metadata.size };
}

export function normalizeDocumentName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Informe um nome para o documento");
  if (trimmed.length > 160) {
    throw new Error("O nome do documento deve ter no máximo 160 caracteres");
  }
  return trimmed;
}

/** Nome de arquivo seguro para download (sempre termina em .pdf). */
export function toDownloadFileName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  return `${base || "documento"}.pdf`;
}

/** Documentos de uma obra que o usuário pode ver em campo. */
export async function listVisibleDocuments(
  ctx: QueryCtx,
  user: Doc<"users">,
  project: Doc<"projects">
): Promise<Doc<"projectDocuments">[]> {
  const documents = await ctx.db
    .query("projectDocuments")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .collect();
  return documents.filter((document) =>
    canUserViewDocument(user, project, document)
  );
}

// ---------------------------------------------------------------------------
// Linhas devolvidas às telas (campo e escritório)
// ---------------------------------------------------------------------------

export function toFieldDocument(document: Doc<"projectDocuments">) {
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

/**
 * Carrega um documento para o usuário, reaplicando a regra de acesso de campo.
 * `null` se o documento ou a obra não existem; lança se o acesso foi negado.
 */
export async function loadDocumentForUser(
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

/** Documentos da obra visíveis ao técnico (ou staff), em ordem alfabética. */
export async function listTechnicianDocuments(
  ctx: QueryCtx,
  user: Doc<"users">,
  projectId: Id<"projects">
) {
  const project = await assertTechnicianProjectAccess(ctx, user, projectId);
  const documents = await listVisibleDocuments(ctx, user, project);
  documents.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return documents.map(toFieldDocument);
}

/** Arquivo a entregar no download autenticado; `null` se não existe. */
export async function resolveDocumentDownload(
  ctx: QueryCtx,
  user: Doc<"users">,
  documentId: Id<"projectDocuments">
) {
  const document = await loadDocumentForUser(ctx, user, documentId);
  if (!document) return null;
  return {
    storageId: document.storageId,
    fileName: toDownloadFileName(document.name),
    contentType: document.contentType,
  };
}

// ---------------------------------------------------------------------------
// Escritório (engenharia)
// ---------------------------------------------------------------------------

/** Técnicos da obra que passam a ver o documento em campo (aviso N8). */
function fieldViewers(
  project: Doc<"projects">,
  access: TechnicianAccess,
  allowed: Id<"users">[] | undefined
): Id<"users">[] {
  if (access === "none") return [];
  if (access === "all") return project.technicianIds ?? [];
  return allowed ?? [];
}

async function notifyNewDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  recipients: Id<"users">[],
  project: Doc<"projects">,
  documentId: Id<"projectDocuments">,
  name: string
): Promise<void> {
  await notify(
    ctx,
    recipients,
    {
      kind: "N8",
      category: "obras_documentos",
      title: `Documento novo · ${project.name}`,
      body: `${name} (PDF).`,
      target: "documentos",
      params: { projectId: project._id, documentId },
      projectId: project._id,
    },
    { actorId: user._id }
  );
}

export type CreateProjectDocumentInput = {
  projectId: Id<"projects">;
  storageId: Id<"_storage">;
  name: string;
  description?: string;
  technicianAccess: TechnicianAccess;
  allowedTechnicianIds?: Id<"users">[];
};

export async function createProjectDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CreateProjectDocumentInput
): Promise<Id<"projectDocuments">> {
  const project = await requireActiveProject(ctx, input.projectId);

  const existing = await ctx.db
    .query("projectDocuments")
    .withIndex("by_storage", (q) => q.eq("storageId", input.storageId))
    .first();
  if (existing) throw new Error("Este arquivo já foi cadastrado");

  const file = await assertValidPdfUpload(ctx, input.storageId);
  const name = normalizeDocumentName(input.name);
  const description = input.description?.trim() || undefined;
  const allowedTechnicianIds = normalizeAllowedTechnicians(
    project,
    input.technicianAccess,
    input.allowedTechnicianIds
  );

  const documentId = await ctx.db.insert("projectDocuments", {
    projectId: input.projectId,
    storageId: input.storageId,
    name,
    description,
    contentType: file.contentType,
    sizeBytes: file.size,
    technicianAccess: input.technicianAccess,
    allowedTechnicianIds,
    uploadedByUserId: user._id,
    createdAt: Date.now(),
  });

  await logAudit(ctx, user, {
    action: "create",
    tableName: "projectDocuments",
    recordId: documentId,
    entityLabel: name,
    details: `Obra ${project.name} · acesso técnicos: ${input.technicianAccess}`,
  });

  await notifyNewDocument(
    ctx,
    user,
    fieldViewers(project, input.technicianAccess, allowedTechnicianIds),
    project,
    documentId,
    name
  );
  return documentId;
}

export type UpdateProjectDocumentInput = {
  documentId: Id<"projectDocuments">;
  name?: string;
  description?: string | null;
  technicianAccess?: TechnicianAccess;
  allowedTechnicianIds?: Id<"users">[];
};

export async function updateProjectDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: UpdateProjectDocumentInput
): Promise<void> {
  const document = await requireDocument(ctx, input.documentId);
  const project = await requireActiveProject(ctx, document.projectId);

  const technicianAccess = input.technicianAccess ?? document.technicianAccess;
  const allowedTechnicianIds = normalizeAllowedTechnicians(
    project,
    technicianAccess,
    input.allowedTechnicianIds ?? document.allowedTechnicianIds
  );
  const name =
    input.name === undefined ? document.name : normalizeDocumentName(input.name);
  const description =
    input.description === undefined
      ? document.description
      : input.description?.trim() || undefined;

  await ctx.db.patch("projectDocuments", input.documentId, {
    name,
    description,
    technicianAccess,
    allowedTechnicianIds,
    updatedAt: Date.now(),
  });

  await logAudit(ctx, user, {
    action: "update",
    tableName: "projectDocuments",
    recordId: input.documentId,
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

  // N8 também quando o acesso passa a incluir alguém.
  const before = new Set(
    fieldViewers(project, document.technicianAccess, document.allowedTechnicianIds)
  );
  const gained = fieldViewers(project, technicianAccess, allowedTechnicianIds).filter(
    (id) => !before.has(id)
  );
  await notifyNewDocument(ctx, user, gained, project, input.documentId, name);
}

/** Remove o documento e, quando possível, o PDF do storage. */
export async function removeProjectDocument(
  ctx: MutationCtx,
  user: Doc<"users">,
  documentId: Id<"projectDocuments">
): Promise<void> {
  const document = await requireDocument(ctx, documentId);
  const project = await ctx.db.get("projects", document.projectId);

  await ctx.db.delete("projectDocuments", documentId);
  try {
    await ctx.storage.delete(document.storageId);
  } catch {
    // O arquivo pode já ter sido removido; o registro é o que importa.
  }

  await logAudit(ctx, user, {
    action: "delete",
    tableName: "projectDocuments",
    recordId: documentId,
    entityLabel: document.name,
    details: project ? `Obra ${project.name}` : undefined,
    snapshotBefore: document,
  });
}

/** Documentos da obra para o escritório, com técnicos liberados e autor. */
export async function listOfficeDocuments(
  ctx: QueryCtx,
  projectId: Id<"projects">
) {
  const documents = await ctx.db
    .query("projectDocuments")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
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
}

/**
 * Apaga um arquivo recém-enviado cujo cadastro falhou. Só remove arquivos
 * ainda não vinculados a um documento.
 */
export async function discardDocumentUpload(
  ctx: MutationCtx,
  storageId: Id<"_storage">
): Promise<void> {
  const referenced = await ctx.db
    .query("projectDocuments")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();
  if (referenced) throw new Error("Este arquivo pertence a um documento");
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // Já removido (ou nunca existiu): nada a fazer.
  }
}
