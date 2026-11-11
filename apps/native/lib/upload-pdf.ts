import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const INVALID_PDF_MESSAGE = "O arquivo não é um PDF válido. Verifique o arquivo e tente novamente.";

const PDF_SIGNATURE = "%PDF-";

export function suggestDocumentName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
}

export function isPdfName(fileName: string, mimeType?: string | null): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(fileName.trim());
}

/** Confere a assinatura `%PDF-` sem depender do MIME do sistema. */
export async function hasPdfSignature(uri: string): Promise<boolean> {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < PDF_SIGNATURE.length) return false;
  const head = new TextDecoder().decode(buffer.slice(0, PDF_SIGNATURE.length));
  return head === PDF_SIGNATURE;
}

/** Sobe um PDF local para o Convex Storage e devolve o storage ID. */
export async function uploadPdf(
  generateUploadUrl: () => Promise<string>,
  uri: string
): Promise<Id<"_storage">> {
  if (!(await hasPdfSignature(uri))) {
    throw new Error(INVALID_PDF_MESSAGE);
  }
  const uploadUrl = await generateUploadUrl();
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: blob,
  });
  if (!result.ok) {
    throw new Error(`Falha no upload do PDF (${result.status})`);
  }
  const { storageId } = (await result.json()) as { storageId: string };
  return storageId as Id<"_storage">;
}
