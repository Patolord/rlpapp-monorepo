/**
 * Documentos de obra (PDF) no campo: download autenticado pelo endpoint HTTP
 * do Convex e cópia offline por usuário no armazenamento do aparelho.
 */
import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import { env } from "@rlpapp/env/native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useState } from "react";

// --- Endpoint -----------------------------------------------------------------

/** `*.convex.cloud` → `*.convex.site` (HTTP actions); dev local usa a porta seguinte. */
export function convexSiteUrl(convexUrl: string): string {
  const url = new URL(convexUrl);
  if (url.hostname.endsWith(".convex.cloud")) {
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  } else if (url.port === "3210") {
    url.port = "3211";
  }
  return url.origin;
}

export function projectDocumentUrl(documentId: Id<"projectDocuments">): string {
  return `${convexSiteUrl(env.EXPO_PUBLIC_CONVEX_URL)}/project-documents/${documentId}`;
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

function messageForStatus(status: number): string {
  if (status === 401) return "Sessão expirada. Entre novamente.";
  if (status === 403) return "Você não tem mais acesso a este documento.";
  if (status === 404) return "Documento não encontrado ou removido.";
  return `Não foi possível baixar o arquivo (${status})`;
}

/**
 * Baixa o PDF para `destination` com o JWT da sessão Clerk (template "convex",
 * o mesmo usado pelo cliente Convex). O acesso é reavaliado a cada pedido.
 */
export function useDocumentDownloader(): (
  documentId: Id<"projectDocuments">,
  destination: File
) => Promise<File> {
  const { getToken } = useAuth();
  return useCallback(
    async (documentId, destination) => {
      const token = await getToken({ template: "convex" });
      if (!token) throw new DocumentFetchError(messageForStatus(401), 401);
      const url = projectDocumentUrl(documentId);
      // Confere o status antes de gravar: downloadFileAsync não expõe o código HTTP.
      const probe = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-0" } });
      if (!probe.ok && probe.status !== 206) {
        throw new DocumentFetchError(messageForStatus(probe.status), probe.status);
      }
      if (destination.exists) destination.delete();
      return await File.downloadFileAsync(url, destination, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: true,
      });
    },
    [getToken]
  );
}

// --- Abrir ----------------------------------------------------------------------

/** Abre o PDF pelo seletor do sistema ("Abrir com…" / Quick Look). */
export async function openPdf(file: File, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Este aparelho não permite abrir arquivos a partir do app.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: title,
  });
}

/** Arquivo temporário (cache do sistema) para abrir sem salvar offline. */
export function tempPdfFile(documentId: Id<"projectDocuments">): File {
  const dir = new Directory(Paths.cache, "field-docs-tmp");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${documentId}.pdf`);
}

// --- Cache offline por usuário -------------------------------------------------

export type CachedDocumentMeta = {
  documentId: Id<"projectDocuments">;
  projectId: Id<"projects">;
  obraSlug: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  savedAt: number;
  uri: string;
};

const INDEX_KEY = (ownerId: string) => `field-docs:index:${ownerId}`;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeOfflineDocuments(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readIndex(ownerId: string): Promise<CachedDocumentMeta[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY(ownerId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CachedDocumentMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(ownerId: string, items: CachedDocumentMeta[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY(ownerId), JSON.stringify(items));
  emit();
}

function offlineDir(ownerId: string, obraSlug: string): Directory {
  return new Directory(Paths.document, "field-docs", ownerId, obraSlug);
}

export function offlineFile(ownerId: string, obraSlug: string, documentId: Id<"projectDocuments">): File {
  const dir = offlineDir(ownerId, obraSlug);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${documentId}.pdf`);
}

export async function listOfflineDocuments(ownerId: string, obraSlug: string): Promise<CachedDocumentMeta[]> {
  const items = await readIndex(ownerId);
  return items.filter((item) => item.obraSlug === obraSlug && new File(item.uri).exists);
}

export async function getOfflineDocument(
  ownerId: string,
  documentId: Id<"projectDocuments">
): Promise<{ meta: CachedDocumentMeta; file: File } | null> {
  const items = await readIndex(ownerId);
  const meta = items.find((item) => item.documentId === documentId);
  if (!meta) return null;
  const file = new File(meta.uri);
  if (!file.exists) {
    await writeIndex(ownerId, items.filter((item) => item.documentId !== documentId));
    return null;
  }
  return { meta, file };
}

export async function registerOfflineDocument(ownerId: string, meta: CachedDocumentMeta): Promise<void> {
  const items = (await readIndex(ownerId)).filter((item) => item.documentId !== meta.documentId);
  await writeIndex(ownerId, [...items, meta]);
}

export async function removeOfflineDocument(ownerId: string, documentId: Id<"projectDocuments">): Promise<void> {
  const items = await readIndex(ownerId);
  const meta = items.find((item) => item.documentId === documentId);
  if (meta) {
    const file = new File(meta.uri);
    if (file.exists) file.delete();
  }
  await writeIndex(ownerId, items.filter((item) => item.documentId !== documentId));
}

/** Descarta PDFs salvos que não estão mais na lista ao vivo (removidos ou acesso revogado). */
export async function pruneOfflineDocuments(
  ownerId: string,
  obraSlug: string,
  keepIds: Id<"projectDocuments">[]
): Promise<void> {
  const keep = new Set<string>(keepIds);
  const items = await readIndex(ownerId);
  const stale = items.filter((item) => item.obraSlug === obraSlug && !keep.has(item.documentId));
  if (stale.length === 0) return;
  for (const item of stale) {
    const file = new File(item.uri);
    if (file.exists) file.delete();
  }
  await writeIndex(ownerId, items.filter((item) => !stale.includes(item)));
}

/** Remove tudo de uma obra (obra arquivada ou acesso revogado). */
export async function forgetProject(ownerId: string, obraSlug: string): Promise<void> {
  const items = await readIndex(ownerId);
  const dir = offlineDir(ownerId, obraSlug);
  if (dir.exists) dir.delete();
  await writeIndex(ownerId, items.filter((item) => item.obraSlug !== obraSlug));
}

/** Documentos salvos offline desta obra, reativo a mudanças. */
export function useOfflineDocuments(ownerId: string | null, obraSlug: string) {
  const [docs, setDocs] = useState<Map<string, CachedDocumentMeta>>(new Map());

  useEffect(() => {
    if (!ownerId) {
      setDocs(new Map());
      return;
    }
    let alive = true;
    const refresh = () => {
      void listOfflineDocuments(ownerId, obraSlug).then((items) => {
        if (alive) setDocs(new Map(items.map((item) => [item.documentId, item])));
      });
    };
    refresh();
    const unsubscribe = subscribeOfflineDocuments(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [ownerId, obraSlug]);

  return docs;
}
