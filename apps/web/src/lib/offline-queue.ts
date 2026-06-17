/**
 * Fila offline em IndexedDB para registros de campo feitos sem internet.
 * Guarda os dados do formulário e as fotos como Blob; o sincronizador
 * envia tudo ao Convex quando a conexão volta.
 */

export type EquipmentStatus = "installing" | "operational" | "warning" | "error";

export interface PendingEquipment {
  id: string;
  kind: "equipment";
  qrToken: string;
  description: string;
  status: EquipmentStatus;
  photos: Blob[];
  createdAt: number;
  error?: string;
}

export interface PendingLog {
  id: string;
  kind: "log";
  qrToken: string;
  logType: "installation" | "maintenance";
  status: EquipmentStatus;
  tags: string[];
  notes?: string;
  tests: {
    vacuum: boolean;
    pressure: boolean;
    communication: boolean;
    gas: boolean;
  };
  photos: Blob[];
  createdAt: number;
  error?: string;
}

export type PendingRecord = PendingEquipment | PendingLog;

export interface CachedEquipment {
  token: string;
  cachedAt: number;
  equipment: {
    description?: string;
    status: EquipmentStatus;
    createdAt: number;
  } | null;
}

const DB_NAME = "rlp-offline";
const DB_VERSION = 1;
const QUEUE_STORE = "pendingRecords";
const CACHE_STORE = "equipmentCache";

export const QUEUE_CHANGED_EVENT = "rlp-offline-queue-changed";

function notifyQueueChanged() {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "token" });
      }
    };
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

export function newPendingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addPendingRecord(record: PendingRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).put(record);
  await txDone(tx);
  db.close();
  notifyQueueChanged();
}

export async function listPendingRecords(): Promise<PendingRecord[]> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readonly");
  const store = tx.objectStore(QUEUE_STORE);
  const records = await new Promise<PendingRecord[]>((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as PendingRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingRecord(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).delete(id);
  await txDone(tx);
  db.close();
  notifyQueueChanged();
}

export async function setPendingRecordError(
  id: string,
  error: string
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(QUEUE_STORE, "readwrite");
  const store = tx.objectStore(QUEUE_STORE);
  const record = await new Promise<PendingRecord | undefined>(
    (resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as PendingRecord);
      request.onerror = () => reject(request.error);
    }
  );
  if (record) {
    record.error = error;
    store.put(record);
  }
  await txDone(tx);
  db.close();
  notifyQueueChanged();
}

// --- Cache de leitura: último estado conhecido de cada QR/equipamento ---

export async function cacheEquipment(entry: CachedEquipment): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put(entry);
    await txDone(tx);
    db.close();
  } catch {
    // Cache é melhor esforço; nunca quebrar o fluxo por causa dele.
  }
}

export async function getCachedEquipment(
  token: string
): Promise<CachedEquipment | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(CACHE_STORE, "readonly");
    const store = tx.objectStore(CACHE_STORE);
    const entry = await new Promise<CachedEquipment | undefined>(
      (resolve, reject) => {
        const request = store.get(token);
        request.onsuccess = () => resolve(request.result as CachedEquipment);
        request.onerror = () => reject(request.error);
      }
    );
    db.close();
    return entry ?? null;
  } catch {
    return null;
  }
}
