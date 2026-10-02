import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { STAFF_ROLES } from "../rbac";

/** Limite por arquivo (PDF). Convex aceita arquivos maiores, mas em campo
 * o download acontece em rede móvel — manter razoável. */
export const MAX_PROJECT_DOCUMENT_BYTES = 50 * 1024 * 1024;

export const PROJECT_DOCUMENT_CONTENT_TYPE = "application/pdf";

export type TechnicianAccess = Doc<"projectDocuments">["technicianAccess"];

/**
 * Regra de visibilidade em campo. Staff sempre enxerga; técnico precisa
 * estar atribuído à obra e o documento precisa liberar o acesso.
 */
export function canUserViewDocument(
  user: Doc<"users">,
  project: Doc<"projects">,
  document: Pick<
    Doc<"projectDocuments">,
    "technicianAccess" | "allowedTechnicianIds"
  >
): boolean {
  if (STAFF_ROLES.includes(user.role)) return true;
  if (!(project.technicianIds ?? []).includes(user._id)) return false;
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
  // O backend grava contentType a partir do header do upload; quando o
  // cliente não envia (ou em testes), assume-se PDF e o tipo final é fixado.
  if (
    metadata.contentType !== undefined &&
    metadata.contentType !== PROJECT_DOCUMENT_CONTENT_TYPE
  ) {
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
