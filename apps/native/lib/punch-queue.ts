/**
 * Fila offline das marcações de ponto. Sem internet, a marcação fica aqui com
 * a foto como URI local e sobe quando a conexão volta (`OfflineSync`). O
 * `clientPunchId` torna o reenvio idempotente no servidor.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PendingPunch {
  clientPunchId: string;
  /** Relógio do aparelho no toque em "Registrar ponto". */
  capturedAt: number;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  /** URI local da foto (file://). */
  photoUri?: string;
  photoCapturedAt?: number;
  deviceModel?: string;
  appVersion?: string;
  error?: string;
}

const QUEUE_KEY = "rlp-punch-queue";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribePunchQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export function newClientPunchId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function read(): Promise<PendingPunch[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingPunch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write(records: PendingPunch[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(records));
}

export async function listPendingPunches(): Promise<PendingPunch[]> {
  const records = await read();
  return records.sort((a, b) => a.capturedAt - b.capturedAt);
}

export async function addPendingPunch(record: PendingPunch): Promise<void> {
  const records = await read();
  const next = records.filter((r) => r.clientPunchId !== record.clientPunchId);
  next.push(record);
  await write(next);
  notify();
}

export async function removePendingPunch(clientPunchId: string): Promise<void> {
  const records = await read();
  await write(records.filter((r) => r.clientPunchId !== clientPunchId));
  notify();
}

export async function setPendingPunchError(
  clientPunchId: string,
  error: string
): Promise<void> {
  const records = await read();
  await write(
    records.map((r) => (r.clientPunchId === clientPunchId ? { ...r, error } : r))
  );
  notify();
}

/** Pede ao sincronizador uma nova tentativa de envio. */
export function requestPunchSync(): void {
  notify();
}
