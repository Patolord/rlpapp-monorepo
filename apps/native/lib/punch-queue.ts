/**
 * Fila offline das marcações de ponto. Sem internet, a marcação fica aqui com
 * a foto copiada para o diretório de documentos do app (o cache da câmera
 * pode ser apagado pelo sistema) e sobe quando a conexão volta
 * (`OfflineSync`). O `clientPunchId` torna o reenvio idempotente no servidor.
 *
 * Cada item guarda o usuário (Clerk) que o criou: a fila é do aparelho, e um
 * usuário nunca envia a marcação de outro.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

export interface PendingPunch {
  clientPunchId: string;
  /** Usuário (Clerk `userId`) que fez a marcação. */
  userId: string;
  /** Relógio do aparelho no toque em "Registrar ponto". */
  capturedAt: number;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  /** URI local da foto (file://), já copiada para o diretório da fila. */
  photoUri?: string;
  photoCapturedAt?: number;
  /** Preenchido após o upload, para não subir a foto de novo a cada tentativa. */
  photoStorageId?: string;
  deviceModel?: string;
  appVersion?: string;
  error?: string;
}

const QUEUE_KEY = "rlp-punch-queue";
const PHOTO_DIR = "punch-queue";

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

// Serializa leitura-modificação-escrita: duas operações simultâneas (tela e
// sincronizador) não podem sobrescrever uma à outra.
let chain: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
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

/** Copia a foto da câmera (cache) para o diretório da fila. Falhando, mantém a URI original. */
export function persistPunchPhoto(uri: string, clientPunchId: string): string {
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const destination = new File(dir, `${clientPunchId}.jpg`);
    if (destination.exists) destination.delete();
    new File(uri).copy(destination);
    return destination.uri;
  } catch (error) {
    console.warn("Não foi possível copiar a foto da marcação", error);
    return uri;
  }
}

function deleteQueuedPhoto(uri: string | undefined): void {
  if (!uri || !uri.includes(`/${PHOTO_DIR}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Melhor esforço: um arquivo órfão no cache não bloqueia a fila.
  }
}

/** Marcações pendentes, opcionalmente só as de um usuário. */
export async function listPendingPunches(userId?: string): Promise<PendingPunch[]> {
  const records = await read();
  return records
    .filter((r) => (userId ? r.userId === userId : true))
    .sort((a, b) => a.capturedAt - b.capturedAt);
}

export function addPendingPunch(record: PendingPunch): Promise<void> {
  return withQueueLock(async () => {
    const records = await read();
    const next = records.filter((r) => r.clientPunchId !== record.clientPunchId);
    next.push(record);
    await write(next);
    notify();
  });
}

export function removePendingPunch(clientPunchId: string): Promise<void> {
  return withQueueLock(async () => {
    const records = await read();
    const removed = records.find((r) => r.clientPunchId === clientPunchId);
    await write(records.filter((r) => r.clientPunchId !== clientPunchId));
    deleteQueuedPhoto(removed?.photoUri);
    notify();
  });
}

function patchPendingPunch(
  clientPunchId: string,
  patch: Partial<PendingPunch>
): Promise<void> {
  return withQueueLock(async () => {
    const records = await read();
    await write(
      records.map((r) => (r.clientPunchId === clientPunchId ? { ...r, ...patch } : r))
    );
    notify();
  });
}

export function setPendingPunchError(clientPunchId: string, error: string): Promise<void> {
  return patchPendingPunch(clientPunchId, { error });
}

/** Guarda o id da foto já enviada ao Storage, para a próxima tentativa pular o upload. */
export function setPendingPunchPhotoStorageId(
  clientPunchId: string,
  photoStorageId: string
): Promise<void> {
  return patchPendingPunch(clientPunchId, { photoStorageId });
}

/** Pede ao sincronizador uma nova tentativa de envio. */
export function requestPunchSync(): void {
  notify();
}
