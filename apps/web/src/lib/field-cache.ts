/**
 * Cache offline do fluxo de campo (técnico).
 *
 * - `kv`: último resultado conhecido de consultas (lista de obras, documentos
 *   de uma obra…) para a tela continuar útil sem internet.
 * - `documents`: PDFs salvos explicitamente pelo técnico ("Salvar offline"),
 *   guardados como Blob para abrir/baixar sem rede.
 *
 * Tudo é melhor esforço: falhas de IndexedDB nunca quebram o fluxo online.
 */

const DB_NAME = "rlp-field-cache";
const DB_VERSION = 1;
const KV_STORE = "kv";
const DOCUMENTS_STORE = "documents";

export const FIELD_CACHE_CHANGED_EVENT = "rlp-field-cache-changed";

export interface CachedValue<T> {
  key: string;
  value: T;
  cachedAt: number;
}

export interface CachedDocument {
  documentId: string;
  projectId: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  blob: Blob;
  cachedAt: number;
}

export type CachedDocumentMeta = Omit<CachedDocument, "blob">;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const store = db.createObjectStore(DOCUMENTS_STORE, {
          keyPath: "documentId",
        });
        store.createIndex("by_project", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FIELD_CACHE_CHANGED_EVENT));
  }
}

async function withDb<T>(
  run: (db: IDBDatabase) => Promise<T>,
  fallback: T
): Promise<T> {
  if (!hasIndexedDb()) return fallback;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    return await run(db);
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}

// --- kv: último resultado conhecido -----------------------------------------

export async function readCachedValue<T>(
  key: string
): Promise<CachedValue<T> | null> {
  return withDb(async (db) => {
    const tx = db.transaction(KV_STORE, "readonly");
    const entry = await requestToPromise(
      tx.objectStore(KV_STORE).get(key) as IDBRequest<CachedValue<T> | undefined>
    );
    return entry ?? null;
  }, null);
}

export async function writeCachedValue<T>(key: string, value: T): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).put({
      key,
      value,
      cachedAt: Date.now(),
    } satisfies CachedValue<T>);
    await txDone(tx);
  }, undefined);
}

// --- documents: PDFs salvos para uso offline --------------------------------

export async function saveDocumentOffline(
  entry: Omit<CachedDocument, "cachedAt">
): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    tx.objectStore(DOCUMENTS_STORE).put({
      ...entry,
      cachedAt: Date.now(),
    } satisfies CachedDocument);
    await txDone(tx);
  }, undefined);
  notifyChanged();
}

export async function removeOfflineDocument(documentId: string): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    tx.objectStore(DOCUMENTS_STORE).delete(documentId);
    await txDone(tx);
  }, undefined);
  notifyChanged();
}

export async function getOfflineDocument(
  documentId: string
): Promise<CachedDocument | null> {
  return withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const entry = await requestToPromise(
      tx.objectStore(DOCUMENTS_STORE).get(documentId) as IDBRequest<
        CachedDocument | undefined
      >
    );
    return entry ?? null;
  }, null);
}

/** Metadados (sem o Blob) dos PDFs salvos de uma obra. */
export async function listOfflineDocuments(
  projectId: string
): Promise<CachedDocumentMeta[]> {
  return withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const entries = await requestToPromise(
      tx
        .objectStore(DOCUMENTS_STORE)
        .index("by_project")
        .getAll(projectId) as IDBRequest<CachedDocument[]>
    );
    return entries.map(({ blob: _blob, ...meta }) => meta);
  }, []);
}

/** Remove da cache PDFs que não existem mais (ou perderam acesso) na obra. */
export async function pruneOfflineDocuments(
  projectId: string,
  keepDocumentIds: Iterable<string>
): Promise<void> {
  const keep = new Set(keepDocumentIds);
  const cached = await listOfflineDocuments(projectId);
  const stale = cached.filter((doc) => !keep.has(doc.documentId));
  if (stale.length === 0) return;
  await withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    for (const doc of stale) {
      tx.objectStore(DOCUMENTS_STORE).delete(doc.documentId);
    }
    await txDone(tx);
  }, undefined);
  notifyChanged();
}
