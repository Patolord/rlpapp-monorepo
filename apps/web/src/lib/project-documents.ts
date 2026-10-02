import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export type TechnicianAccess = "none" | "all" | "selected";

export const TECHNICIAN_ACCESS_OPTIONS: Array<{
  value: TechnicianAccess;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "Todos os técnicos",
    description: "Qualquer técnico atribuído à obra pode ver e baixar.",
  },
  {
    value: "selected",
    label: "Técnicos escolhidos",
    description: "Somente os técnicos marcados abaixo.",
  },
  {
    value: "none",
    label: "Só escritório",
    description: "Visível apenas aqui na engenharia.",
  },
];

export const TECHNICIAN_ACCESS_LABELS: Record<TechnicianAccess, string> = {
  all: "Todos os técnicos",
  selected: "Técnicos escolhidos",
  none: "Só escritório",
};

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || /\.pdf$/i.test(file.name.trim())
  );
}

const PDF_SIGNATURE = "%PDF-";

/**
 * Confere a assinatura do arquivo (`%PDF-`): extensão e MIME vêm do sistema
 * de arquivos e não provam que o conteúdo é um PDF.
 */
export async function hasPdfSignature(file: File): Promise<boolean> {
  if (file.size < PDF_SIGNATURE.length) return false;
  const head = await file.slice(0, PDF_SIGNATURE.length).text();
  return head === PDF_SIGNATURE;
}

export const INVALID_PDF_MESSAGE =
  "O arquivo não é um PDF válido. Verifique o arquivo e tente novamente.";

/** Nome sugerido para o documento a partir do arquivo (sem a extensão). */
export function suggestDocumentName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
}

/** Sobe um PDF para o Convex Storage e devolve o storage ID. */
export async function uploadPdf(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<Id<"_storage">> {
  if (!(await hasPdfSignature(file))) {
    throw new Error(INVALID_PDF_MESSAGE);
  }
  const url = await generateUploadUrl();
  const result = await fetch(url, {
    method: "POST",
    // O backend exige exatamente este contentType gravado pelo storage.
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!result.ok) {
    throw new Error(`Falha no upload do PDF (${result.status})`);
  }
  const { storageId } = (await result.json()) as { storageId: string };
  return storageId as Id<"_storage">;
}

// --- Download autenticado ----------------------------------------------------

/**
 * Base das HTTP actions do Convex (`*.convex.site`), derivada da URL do
 * deployment (`*.convex.cloud`). Em dev local (`127.0.0.1:3210`) o site fica
 * na porta seguinte.
 */
export function convexSiteUrl(convexUrl: string): string {
  const url = new URL(convexUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  } else if (url.port === "3210") {
    url.port = "3211";
  }
  return url.origin;
}

/** URL do endpoint autenticado que serve o PDF (reavalia o acesso a cada pedido). */
export function projectDocumentUrl(
  convexUrl: string,
  documentId: Id<"projectDocuments">,
  options: { download?: boolean } = {}
): string {
  const url = new URL(`/project-documents/${documentId}`, convexSiteUrl(convexUrl));
  if (options.download) url.searchParams.set("download", "1");
  return url.toString();
}

export class DocumentFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DocumentFetchError";
  }
}

/**
 * Baixa o PDF pelo endpoint autenticado. `getToken` vem da sessão Clerk
 * (template "convex"), o mesmo JWT que o cliente Convex usa.
 */
export async function fetchDocumentBlob(
  convexUrl: string,
  documentId: Id<"projectDocuments">,
  getToken: () => Promise<string | null>
): Promise<Blob> {
  const token = await getToken();
  if (!token) {
    throw new DocumentFetchError("Sessão expirada. Entre novamente.", 401);
  }
  const response = await fetch(projectDocumentUrl(convexUrl, documentId), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const message =
      response.status === 401
        ? "Sessão expirada. Entre novamente."
        : response.status === 403
          ? "Você não tem mais acesso a este documento."
          : response.status === 404
            ? "Documento não encontrado ou removido."
            : `Não foi possível baixar o arquivo (${response.status})`;
    throw new DocumentFetchError(message, response.status);
  }
  const blob = await response.blob();
  return blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });
}

// --- Abrir / baixar no navegador --------------------------------------------

/** Dispara o download de um Blob com o nome informado. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Dá tempo ao navegador de iniciar o download antes de revogar a URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Abre um PDF (carregado de forma assíncrona) em nova aba. A aba é aberta
 * de forma síncrona — ainda dentro do gesto do usuário — para não cair no
 * bloqueador de pop-ups; se o carregamento falhar, a aba em branco é fechada.
 * Sem permissão para abrir abas, cai para download.
 */
export async function openPdfInNewTab(
  load: () => Promise<Blob>,
  fileName: string
): Promise<void> {
  const tab = window.open("", "_blank");
  let blob: Blob;
  try {
    blob = await load();
  } catch (error) {
    tab?.close();
    throw error;
  }
  const objectUrl = URL.createObjectURL(blob);
  if (tab) {
    tab.location.href = objectUrl;
  } else {
    downloadBlob(blob, fileName);
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
