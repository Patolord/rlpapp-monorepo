/**
 * Última lista de obras e o resumo de cada obra, para o app de campo
 * continuar abrindo scan e digitação depois de um cold start sem rede.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const LIST_KEY = "rlp-field-my-obras";
const OBRA_PREFIX = "rlp-field-obra:";

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheMyObras<T>(projects: T[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIST_KEY, JSON.stringify(projects));
  } catch {
    // Cache é melhor esforço.
  }
}

export async function getCachedMyObras<T>(): Promise<T[] | null> {
  const parsed = await readJson<T[]>(LIST_KEY);
  return Array.isArray(parsed) ? parsed : null;
}

export async function cacheFieldObra<T>(identifier: string, obra: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`${OBRA_PREFIX}${identifier}`, JSON.stringify(obra));
  } catch {
    // Cache é melhor esforço.
  }
}

export async function getCachedFieldObra<T>(identifier: string): Promise<T | null> {
  return readJson<T>(`${OBRA_PREFIX}${identifier}`);
}
