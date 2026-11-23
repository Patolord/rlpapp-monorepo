/**
 * Fila do cadastro em campo (AsyncStorage): itens contados sem sinal, ou cujo
 * envio falhou, esperando a conexão. Cada item tem um `clientId` próprio; o
 * servidor é idempotente por ele, então reenviar nunca conta duas vezes.
 * A foto fica como URI local até subir (o storageId é guardado na primeira
 * subida, para não repetir o upload).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

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
  /**
   * Outros jeitos de reconhecer o mesmo item (material, códigos, nome) para
   * manter a ordem na fila; sem o local, que a sincronização acrescenta.
   */
  orderKeys?: string[];
  /** Rótulo para a lista ("Disjuntor — 10A"). */
  label: string;
  unit?: string | null;
  capturedAt: number;
  error?: string;
}

const QUEUE_KEY = "rlp-capture-queue";
const PHOTO_DIR = "capture-queue";
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

// Uma operação de leitura+escrita por vez: sem isso, salvar um item enquanto
// a sincronização remove outro pode apagar o recém-salvo.
let chain: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Copia a foto da câmera (cache, que o sistema pode apagar) para o diretório
 * da fila. Falhando, mantém a URI original.
 */
export function persistCapturePhoto(uri: string, clientId: string): string {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const destination = new File(dir, `${clientId}.jpg`);
    if (destination.exists) destination.delete();
    new File(uri).copy(destination);
    return destination.uri;
  } catch (error) {
    console.warn("Não foi possível copiar a foto do cadastro", error);
    return uri;
  }
}

/** A foto ainda existe no aparelho? (Sem ela, o item sobe sem foto.) */
export function capturePhotoExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

function deleteQueuedPhoto(uri: string | undefined): void {
  if (!uri || !uri.includes(`/${PHOTO_DIR}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Melhor esforço: um arquivo órfão não bloqueia a fila.
  }
}

export function addPendingCapture(record: PendingCapture): Promise<void> {
  return withQueueLock(async () => {
    const records = await readQueue();
    await writeQueue([...records.filter((r) => r.clientId !== record.clientId), record]);
    notify();
  });
}

export async function listPendingCaptures(userId: string): Promise<PendingCapture[]> {
  const records = await readQueue();
  return records.filter((r) => r.userId === userId).sort((a, b) => a.capturedAt - b.capturedAt);
}

/** clientIds ainda na fila (de qualquer usuário do aparelho). */
export async function listQueuedClientIds(): Promise<Set<string>> {
  return new Set((await readQueue()).map((r) => r.clientId));
}

export function removePendingCapture(clientId: string): Promise<void> {
  return withQueueLock(async () => {
    const records = await readQueue();
    const removed = records.find((r) => r.clientId === clientId);
    await writeQueue(records.filter((r) => r.clientId !== clientId));
    deleteQueuedPhoto(removed?.photoUri);
    notify();
  });
}

export function updatePendingCapture(
  clientId: string,
  patch: Partial<Pick<PendingCapture, "error" | "photoStorageId" | "photoUri">>
): Promise<void> {
  return withQueueLock(async () => {
    const records = await readQueue();
    await writeQueue(records.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
    notify();
  });
}
