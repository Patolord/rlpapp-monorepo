import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Cache de leitura para telas que precisam abrir sem sinal (decisão 21):
// guarda o último valor de uma consulta do Convex no aparelho e o devolve
// quando a consulta não responde por falta de conexão.
// ---------------------------------------------------------------------------

type Entry<T> = { value: T; cachedAt: number };

const PREFIX = "rlp-query-cache:";

/**
 * `live` é o resultado do `useQuery` (`undefined` enquanto carrega). Com sinal,
 * devolve o valor ao vivo e o salva; sem sinal e sem resposta, devolve o
 * último valor salvo e a hora em que foi salvo.
 */
export function useCachedQuery<T>(
  key: string | null,
  live: T | undefined,
  online: boolean
): { value: T | undefined; cachedAt: number | null; fromCache: boolean } {
  const [cached, setCached] = useState<Entry<T> | null | undefined>(undefined);

  useEffect(() => {
    if (!key || live === undefined) return;
    const entry: Entry<T> = { value: live, cachedAt: Date.now() };
    void AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry)).catch(() => undefined);
  }, [key, live]);

  useEffect(() => {
    if (!key || live !== undefined || online) return;
    let alive = true;
    void AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (!alive) return;
        setCached(raw ? (JSON.parse(raw) as Entry<T>) : null);
      })
      .catch(() => alive && setCached(null));
    return () => {
      alive = false;
    };
  }, [key, live, online]);

  if (live !== undefined) return { value: live, cachedAt: null, fromCache: false };
  if (!online && cached) return { value: cached.value, cachedAt: cached.cachedAt, fromCache: true };
  return { value: undefined, cachedAt: null, fromCache: false };
}

export function cacheTimeLabel(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
