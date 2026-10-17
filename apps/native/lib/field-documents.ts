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
 * `File.downloadFileAsync` rejeita respostas fora de 2xx com
 * "response has status 403" (iOS) / "response has status: 403" (Android).
 * É a única forma de saber o código HTTP sem um segundo pedido.
 */
export function statusFromDownloadError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /status:?\s*(\d{3})\b/i.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Baixa o PDF para `destination` com o JWT da sessão Clerk (template "convex",
 * o mesmo usado pelo cliente Convex). O acesso é reavaliado a cada pedido.
 * Um único GET: o endpoint devolve o arquivo inteiro (ignora Range), então
 * qualquer pedido de "sondagem" custaria o PDF completo.
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
      if (destination.exists) destination.delete();
      try {
        return await File.downloadFileAsync(url, destination, {
          headers: { Authorization: `Bearer ${token}` },
          idempotent: true,
        });
      } catch (error) {
        const status = statusFromDownloadError(error);
        if (status !== null) {
          throw new DocumentFetchError(messageForStatus(status), status);
        }
        throw error;
      }
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

/**
 * Serializa as operações ler-modificar-gravar do índice por usuário. Sem isso,
 * dois "Salvar offline" simultâneos liam o mesmo índice e o segundo a gravar
 * apagava a entrada do primeiro.
 */
const indexLocks = new Map<string, Promise<unknown>>();

function withIndexLock<T>(ownerId: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexLocks.get(ownerId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  indexLocks.set(ownerId, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (indexLocks.get(ownerId) === next) indexLocks.delete(ownerId);
    });
  return next;
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

function offlineDir(ownerId: string, projectId: string): Directory {
  return new Directory(Paths.document, "field-docs", ownerId, projectId);
}

export function offlineFile(ownerId: string, projectId: Id<"projects">, documentId: Id<"projectDocuments">): File {
  const dir = offlineDir(ownerId, projectId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${documentId}.pdf`);
}

function deleteFileIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export async function listOfflineDocuments(ownerId: string, projectId: string): Promise<CachedDocumentMeta[]> {
  const items = await readIndex(ownerId);
  return items.filter((item) => item.projectId === projectId && new File(item.uri).exists);
}

export function getOfflineDocument(
  ownerId: string,
  documentId: Id<"projectDocuments">
): Promise<{ meta: CachedDocumentMeta; file: File } | null> {
  return withIndexLock(ownerId, async () => {
    const items = await readIndex(ownerId);
    const meta = items.find((item) => item.documentId === documentId);
    if (!meta) return null;
    const file = new File(meta.uri);
    if (!file.exists) {
      await writeIndex(ownerId, items.filter((item) => item.documentId !== documentId));
      return null;
    }
    return { meta, file };
  });
}

export function registerOfflineDocument(ownerId: string, meta: CachedDocumentMeta): Promise<void> {
  return withIndexLock(ownerId, async () => {
    const items = (await readIndex(ownerId)).filter((item) => item.documentId !== meta.documentId);
    await writeIndex(ownerId, [...items, meta]);
  });
}

export function removeOfflineDocument(ownerId: string, documentId: Id<"projectDocuments">): Promise<void> {
  return withIndexLock(ownerId, async () => {
    const items = await readIndex(ownerId);
    const meta = items.find((item) => item.documentId === documentId);
    if (meta) deleteFileIfExists(meta.uri);
    await writeIndex(ownerId, items.filter((item) => item.documentId !== documentId));
  });
}

/** Descarta PDFs salvos que não estão mais na lista ao vivo (removidos ou acesso revogado). */
export function pruneOfflineDocuments(
  ownerId: string,
  projectId: string,
  keepIds: Id<"projectDocuments">[]
): Promise<void> {
  return withIndexLock(ownerId, async () => {
    const keep = new Set<string>(keepIds);
    const items = await readIndex(ownerId);
    const stale = items.filter((item) => item.projectId === projectId && !keep.has(item.documentId));
    if (stale.length === 0) return;
    for (const item of stale) deleteFileIfExists(item.uri);
    await writeIndex(ownerId, items.filter((item) => !stale.includes(item)));
  });
}

/** Remove tudo de uma obra (obra arquivada ou acesso revogado). */
export function forgetProject(ownerId: string, projectId: string): Promise<void> {
  return withIndexLock(ownerId, async () => {
    const items = await readIndex(ownerId);
    const dir = offlineDir(ownerId, projectId);
    if (dir.exists) dir.delete();
    const remaining = items.filter((item) => item.projectId !== projectId);
    if (remaining.length !== items.length) await writeIndex(ownerId, remaining);
  });
}

/**
 * Mantém só as obras ainda liberadas para o usuário (lista ao vivo de
 * `listMyProjects`). Cobre arquivamento e revogação sem depender de o técnico
 * abrir cada obra de novo.
 */
export function pruneOfflineProjects(ownerId: string, keepProjectIds: string[]): Promise<void> {
  return withIndexLock(ownerId, async () => {
    const keep = new Set(keepProjectIds);
    const items = await readIndex(ownerId);
    const staleProjects = new Set(items.map((item) => item.projectId).filter((id) => !keep.has(id)));
    if (staleProjects.size === 0) return;
    for (const projectId of staleProjects) {
      const dir = offlineDir(ownerId, projectId);
      if (dir.exists) dir.delete();
    }
    await writeIndex(ownerId, items.filter((item) => !staleProjects.has(item.projectId)));
  });
}

/** Documentos salvos offline desta obra, reativo a mudanças. */
export function useOfflineDocuments(ownerId: string | null, projectId: string | null) {
  const [docs, setDocs] = useState<Map<string, CachedDocumentMeta>>(new Map());

  useEffect(() => {
    if (!ownerId || !projectId) {
      setDocs(new Map());
      return;
    }
    let alive = true;
    const refresh = () => {
      void listOfflineDocuments(ownerId, projectId).then((items) => {
        if (alive) setDocs(new Map(items.map((item) => [item.documentId, item])));
      });
    };
    refresh();
    const unsubscribe = subscribeOfflineDocuments(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [ownerId, projectId]);

  return docs;
}
