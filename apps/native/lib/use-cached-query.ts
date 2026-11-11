import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

/**
 * `useQuery` com cópia local (AsyncStorage) por chave: devolve o último
 * resultado salvo enquanto o Convex não responde (ex.: sem conexão).
 *
 * `fromCache` indica que o valor veio do aparelho e pode estar desatualizado;
 * `cacheChecked` indica que a leitura local já terminou (evita piscar o
 * estado "vazio" antes de saber se há cópia).
 *
 * A cópia fica amarrada à chave que a produziu: ao trocar de chave (outra
 * obra, outro usuário) o hook volta a `undefined` até ler a nova entrada, em
 * vez de mostrar os dados da chave anterior.
 */
export function useCachedQuery<Query extends FunctionReference<"query">>(
  cacheKey: string | null,
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): {
  data: FunctionReturnType<Query> | undefined;
  fromCache: boolean;
  cacheChecked: boolean;
  /** Quando a cópia do aparelho foi salva (para "dados de 14:05"); null se não se sabe. */
  cachedAt: number | null;
} {
  const live = useQuery(query, ...args);
  const [cached, setCached] = useState<{ key: string; value: FunctionReturnType<Query>; at: number | null } | undefined>(undefined);
  // Chave cuja leitura local já terminou (com ou sem cópia).
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheKey) return;
    let alive = true;
    AsyncStorage.getItem(`cq:${cacheKey}`)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        // Formato atual: { v, t }. Cópias antigas guardavam só o valor.
        if (parsed && typeof parsed === "object" && "v" in parsed && "t" in parsed) {
          const entry = parsed as { v: FunctionReturnType<Query>; t: number };
          setCached({ key: cacheKey, value: entry.v, at: entry.t });
        } else {
          setCached({ key: cacheKey, value: parsed as FunctionReturnType<Query>, at: null });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCheckedKey(cacheKey);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (live === undefined || !cacheKey) return;
    AsyncStorage.setItem(`cq:${cacheKey}`, JSON.stringify({ v: live, t: Date.now() })).catch(() => undefined);
  }, [live, cacheKey]);

  if (live !== undefined) return { data: live, fromCache: false, cacheChecked: true, cachedAt: null };
  if (!cacheKey) return { data: undefined, fromCache: false, cacheChecked: true, cachedAt: null };
  const hit = cached?.key === cacheKey ? cached : undefined;
  return { data: hit?.value, fromCache: hit !== undefined, cacheChecked: checkedKey === cacheKey, cachedAt: hit?.at ?? null };
}

export function cacheTimeLabel(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Apaga a cópia local de uma chave (obra arquivada, acesso revogado). */
export async function forgetCachedQuery(cacheKey: string): Promise<void> {
  await AsyncStorage.removeItem(`cq:${cacheKey}`).catch(() => undefined);
}
