/**
 * Fila offline (AsyncStorage) para registros de campo feitos sem internet.
 * Diferente do web (que guarda Blobs no IndexedDB), aqui as fotos são mantidas
 * como URIs locais do aparelho — o sincronizador faz upload quando a conexão
 * volta. Também mantém um cache de leitura do último estado de cada QR.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type EquipmentStatus =
  | "installing"
  | "operational"
  | "warning"
  | "error";

export interface PendingEquipment {
  id: string;
  kind: "equipment";
  qrToken: string;
  description: string;
  status: EquipmentStatus;
  photos: string[];
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
  photos: string[];
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

const QUEUE_KEY = "rlp-offline-queue";
const CACHE_PREFIX = "rlp-equipment-cache:";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyQueueChanged() {
  for (const listener of listeners) listener();
}

/**
 * Solicita uma tentativa de sincronização (e atualização de UI). O componente
 * OfflineSync escuta mudanças na fila e dispara o envio quando online.
 */
export function requestOfflineSync(): void {
  notifyQueueChanged();
}

export function newPendingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<PendingRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(records: PendingRecord[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(records));
}

export async function addPendingRecord(record: PendingRecord): Promise<void> {
  const records = await readQueue();
  const next = records.filter((r) => r.id !== record.id);
  next.push(record);
  await writeQueue(next);
  notifyQueueChanged();
}

export async function listPendingRecords(): Promise<PendingRecord[]> {
  const records = await readQueue();
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingRecord(id: string): Promise<void> {
  const records = await readQueue();
  await writeQueue(records.filter((r) => r.id !== id));
  notifyQueueChanged();
}

export async function setPendingRecordError(
  id: string,
  error: string
): Promise<void> {
  const records = await readQueue();
  const next = records.map((record) =>
    record.id === id ? { ...record, error } : record
  );
  await writeQueue(next);
  notifyQueueChanged();
}

// --- Cache de leitura: último estado conhecido de cada QR/equipamento ---

export async function cacheEquipment(entry: CachedEquipment): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}${entry.token}`,
      JSON.stringify(entry)
    );
  } catch {
    // Cache é melhor esforço; nunca quebrar o fluxo por causa dele.
  }
}

export async function getCachedEquipment(
  token: string
): Promise<CachedEquipment | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${token}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedEquipment;
  } catch {
    return null;
  }
}
