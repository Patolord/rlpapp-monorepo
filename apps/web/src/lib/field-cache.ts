/**
 * Cache offline do fluxo de campo (técnico).
 *
 * - `kv`: último resultado conhecido de consultas (lista de obras, documentos
 *   de uma obra…) para a tela continuar útil sem internet.
 * - `documents`: PDFs salvos explicitamente pelo técnico ("Salvar offline"),
 *   guardados como Blob para abrir/baixar sem rede.
 *
 * Tudo é separado por usuário (`ownerId` = id Clerk da sessão): num aparelho
 * compartilhado, uma conta nunca lê o que outra guardou — e trocar de conta
 * apaga tudo (ver `use-field-cache-owner.ts`).
 *
 * Leituras e cache de consultas são melhor esforço (falhas de IndexedDB não
 * quebram o fluxo online). Salvar um PDF é estrito: falha é reportada ao
 * usuário, para ele não contar com um arquivo que não existe.
 */

const DB_NAME = "rlp-field-cache";
// v2: chaves passaram a incluir o dono (ownerId). Dados v1 são descartados.
const DB_VERSION = 2;
const KV_STORE = "kv";
const DOCUMENTS_STORE = "documents";
const OWNER_OBRA_INDEX = "by_owner_obra";

export const FIELD_CACHE_CHANGED_EVENT = "rlp-field-cache-changed";
const OWNER_STORAGE_KEY = "rlp-field-cache-owner";

/**
 * Chaves das consultas cacheadas em campo (sem o prefixo do dono). Tudo que
 * pertence a uma obra é indexado pelo identificador da URL (`obraSlug`), para
 * `forgetProject` conseguir apagar sem depender de nada que ainda esteja em cache.
 */
export const fieldCacheKeys = {
  myProjects: "field:my-projects",
  project: (obraSlug: string) => `field:project:${obraSlug}`,
  documents: (obraSlug: string) => `field:documents:${obraSlug}`,
} as const;

export interface CachedValue<T> {
  value: T;
  cachedAt: number;
}

interface KvRecord<T> extends CachedValue<T> {
  key: string;
}

export interface CachedDocument {
  documentId: string;
  projectId: string;
  /** Identificador da obra na URL (slug ou id) — chave de agrupamento. */
  obraSlug: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  blob: Blob;
  cachedAt: number;
}

interface DocumentRecord extends CachedDocument {
  key: string;
  ownerId: string;
}

export type CachedDocumentMeta = Omit<CachedDocument, "blob">;

const SAVE_FAILED_MESSAGE =
  "Não foi possível salvar o PDF neste aparelho (sem espaço ou armazenamento bloqueado).";

function scopedKey(ownerId: string, key: string): string {
  return `${ownerId}::${key}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore(KV_STORE, { keyPath: "key" });
      const documents = db.createObjectStore(DOCUMENTS_STORE, {
        keyPath: "key",
      });
      documents.createIndex(OWNER_OBRA_INDEX, ["ownerId", "obraSlug"], {
        unique: false,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB bloqueado"));
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

/** Executa com o banco aberto; propaga erros. */
async function withDbStrict<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  if (!hasIndexedDb()) {
    throw new Error("Este navegador não permite guardar arquivos offline.");
  }
  const db = await openDb();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

/** Executa com o banco aberto; em erro devolve `fallback`. */
async function withDb<T>(
  run: (db: IDBDatabase) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await withDbStrict(run);
  } catch {
    return fallback;
  }
}

// --- dono da cache (conta Clerk) --------------------------------------------

export function getStoredCacheOwner(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredCacheOwner(ownerId: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (ownerId) localStorage.setItem(OWNER_STORAGE_KEY, ownerId);
    else localStorage.removeItem(OWNER_STORAGE_KEY);
  } catch {
    // Sem localStorage a cache simplesmente não é reaproveitada offline.
  }
}

/**
 * Apaga tudo (todas as contas) e esquece o dono. Usado ao sair da conta e ao
 * entrar com outra conta no mesmo aparelho.
 */
export async function clearFieldCache(): Promise<void> {
  setStoredCacheOwner(null);
  await withDb(async (db) => {
    const tx = db.transaction([KV_STORE, DOCUMENTS_STORE], "readwrite");
    tx.objectStore(KV_STORE).clear();
    tx.objectStore(DOCUMENTS_STORE).clear();
    await txDone(tx);
  }, undefined);
  notifyChanged();
}

// --- kv: último resultado conhecido -----------------------------------------

export async function readCachedValue<T>(
  ownerId: string,
  key: string
): Promise<CachedValue<T> | null> {
  return withDb(async (db) => {
    const tx = db.transaction(KV_STORE, "readonly");
    const entry = await requestToPromise(
      tx.objectStore(KV_STORE).get(scopedKey(ownerId, key)) as IDBRequest<
        KvRecord<T> | undefined
      >
    );
    return entry ? { value: entry.value, cachedAt: entry.cachedAt } : null;
  }, null);
}

export async function writeCachedValue<T>(
  ownerId: string,
  key: string,
  value: T
): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).put({
      key: scopedKey(ownerId, key),
      value,
      cachedAt: Date.now(),
    } satisfies KvRecord<T>);
    await txDone(tx);
  }, undefined);
}

export async function removeCachedValue(
  ownerId: string,
  key: string
): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(KV_STORE, "readwrite");
    tx.objectStore(KV_STORE).delete(scopedKey(ownerId, key));
    await txDone(tx);
  }, undefined);
}

// --- documents: PDFs salvos para uso offline --------------------------------

/** Salva o PDF; lança erro se não conseguir gravar (quota, bloqueio…). */
export async function saveDocumentOffline(
  ownerId: string,
  entry: Omit<CachedDocument, "cachedAt">
): Promise<void> {
  try {
    await withDbStrict(async (db) => {
      const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
      tx.objectStore(DOCUMENTS_STORE).put({
        ...entry,
        key: scopedKey(ownerId, entry.documentId),
        ownerId,
        cachedAt: Date.now(),
      } satisfies DocumentRecord);
      await txDone(tx);
    });
  } catch (error) {
    throw new Error(SAVE_FAILED_MESSAGE, { cause: error });
  }
  notifyChanged();
}

export async function removeOfflineDocument(
  ownerId: string,
  documentId: string
): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    tx.objectStore(DOCUMENTS_STORE).delete(scopedKey(ownerId, documentId));
    await txDone(tx);
  }, undefined);
  notifyChanged();
}

export async function getOfflineDocument(
  ownerId: string,
  documentId: string
): Promise<CachedDocument | null> {
  return withDb(async (db) => {
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const entry = await requestToPromise(
      tx.objectStore(DOCUMENTS_STORE).get(
        scopedKey(ownerId, documentId)
      ) as IDBRequest<DocumentRecord | undefined>
    );
    if (!entry) return null;
    const { key: _key, ownerId: _owner, ...document } = entry;
    return document;
  }, null);
}

async function listOfflineRecords(
  db: IDBDatabase,
  ownerId: string,
  obraSlug: string
): Promise<DocumentRecord[]> {
  const tx = db.transaction(DOCUMENTS_STORE, "readonly");
  return requestToPromise(
    tx
      .objectStore(DOCUMENTS_STORE)
      .index(OWNER_OBRA_INDEX)
      .getAll([ownerId, obraSlug]) as IDBRequest<DocumentRecord[]>
  );
}

/** Metadados (sem o Blob) dos PDFs salvos de uma obra. */
export async function listOfflineDocuments(
  ownerId: string,
  obraSlug: string
): Promise<CachedDocumentMeta[]> {
  return withDb(async (db) => {
    const entries = await listOfflineRecords(db, ownerId, obraSlug);
    return entries.map(
      ({ blob: _blob, key: _key, ownerId: _owner, ...meta }) => meta
    );
  }, []);
}

async function deleteOfflineKeys(db: IDBDatabase, keys: string[]) {
  if (keys.length === 0) return;
  const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
  for (const key of keys) tx.objectStore(DOCUMENTS_STORE).delete(key);
  await txDone(tx);
}

/** Remove da cache PDFs que não existem mais (ou perderam acesso) na obra. */
export async function pruneOfflineDocuments(
  ownerId: string,
  obraSlug: string,
  keepDocumentIds: Iterable<string>
): Promise<void> {
  const keep = new Set(keepDocumentIds);
  const removed = await withDb(async (db) => {
    const entries = await listOfflineRecords(db, ownerId, obraSlug);
    const stale = entries.filter((doc) => !keep.has(doc.documentId));
    await deleteOfflineKeys(
      db,
      stale.map((doc) => doc.key)
    );
    return stale.length;
  }, 0);
  if (removed > 0) notifyChanged();
}

/** Apaga todos os PDFs salvos de uma obra. */
export async function removeOfflineDocumentsForObra(
  ownerId: string,
  obraSlug: string
): Promise<void> {
  await withDb(async (db) => {
    const entries = await listOfflineRecords(db, ownerId, obraSlug);
    await deleteOfflineKeys(
      db,
      entries.map((doc) => doc.key)
    );
  }, undefined);
  notifyChanged();
}

/**
 * Esquece uma obra que deixou de estar disponível no campo (acesso revogado
 * ou obra arquivada): resumo, lista de documentos e PDFs salvos. A lista de
 * obras também é descartada para ela não reaparecer offline.
 */
export async function forgetProject(
  ownerId: string,
  obraSlug: string
): Promise<void> {
  await removeOfflineDocumentsForObra(ownerId, obraSlug);
  await removeCachedValue(ownerId, fieldCacheKeys.documents(obraSlug));
  await removeCachedValue(ownerId, fieldCacheKeys.project(obraSlug));
  await removeCachedValue(ownerId, fieldCacheKeys.myProjects);
  notifyChanged();
}
