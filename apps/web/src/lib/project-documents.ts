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

/** Nome sugerido para o documento a partir do arquivo (sem a extensão). */
export function suggestDocumentName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
}

/** Sobe um PDF para o Convex Storage e devolve o storage ID. */
export async function uploadPdf(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<Id<"_storage">> {
  const url = await generateUploadUrl();
  const result = await fetch(url, {
    method: "POST",
    // Força o tipo: o backend valida o contentType gravado pelo storage.
    headers: { "Content-Type": "application/pdf" },
    body: file,
  });
  if (!result.ok) {
    throw new Error(`Falha no upload do PDF (${result.status})`);
  }
  const { storageId } = (await result.json()) as { storageId: string };
  return storageId as Id<"_storage">;
}

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

/** Baixa o arquivo remoto como Blob (usado para download e cache offline). */
export async function fetchPdfBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível baixar o arquivo (${response.status})`);
  }
  const blob = await response.blob();
  return blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });
}
