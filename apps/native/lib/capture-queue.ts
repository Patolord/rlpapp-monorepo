/**
 * Fila do cadastro em campo (AsyncStorage): itens contados sem sinal, ou cujo
 * envio falhou, esperando a conexão. Cada item tem um `clientId` próprio; o
 * servidor é idempotente por ele, então reenviar nunca conta duas vezes.
 * A foto fica como URI local até subir (o storageId é guardado na primeira
 * subida, para não repetir o upload).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CaptureItemData = {
  name: string;
  variantLabel?: string;
  unit?: string;
  category?: string;
  barcode?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  spec?: string;
};

export interface PendingCapture {
  clientId: string;
  /** Dono do registro (Clerk): a fila é do aparelho, o envio é de quem contou. */
  userId: string;
  projectId?: string;
  locationName: string;
  materialId?: string;
  item?: CaptureItemData;
  confirmedNew: boolean;
  quantityMode: "add" | "set";
  quantity: number;
  physicalAddress?: string;
  notes?: string;
  photoUri?: string;
  photoStorageId?: string;
  /** Rótulo para a lista ("Disjuntor — 10A"). */
  label: string;
  unit?: string | null;
  capturedAt: number;
  error?: string;
}

const QUEUE_KEY = "rlp-capture-queue";
/** Itens cadastrados sem sinal entram na cópia local do catálogo com este prefixo + clientId. */
export const PENDING_PREFIX = "pending:";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCaptureQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** Pede uma nova tentativa de envio (o OfflineSync escuta a fila). */
export function requestCaptureSync(): void {
  notify();
}

export function newCaptureClientId(): string {
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue(): Promise<PendingCapture[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingCapture[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(records: PendingCapture[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(records));
}

export async function addPendingCapture(record: PendingCapture): Promise<void> {
  const records = await readQueue();
  await writeQueue([...records.filter((r) => r.clientId !== record.clientId), record]);
  notify();
}

export async function listPendingCaptures(userId: string): Promise<PendingCapture[]> {
  const records = await readQueue();
  return records.filter((r) => r.userId === userId).sort((a, b) => a.capturedAt - b.capturedAt);
}

/** clientIds ainda na fila (de qualquer usuário do aparelho). */
export async function listQueuedClientIds(): Promise<Set<string>> {
  return new Set((await readQueue()).map((r) => r.clientId));
}

export async function removePendingCapture(clientId: string): Promise<void> {
  const records = await readQueue();
  await writeQueue(records.filter((r) => r.clientId !== clientId));
  notify();
}

export async function updatePendingCapture(
  clientId: string,
  patch: Partial<Pick<PendingCapture, "error" | "photoStorageId">>
): Promise<void> {
  const records = await readQueue();
  await writeQueue(records.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  notify();
}
