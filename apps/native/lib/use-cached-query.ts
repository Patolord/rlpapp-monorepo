import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { useEffect, useState } from "react";

/**
 * `useQuery` com cópia local (AsyncStorage) por chave: devolve o último
 * resultado salvo enquanto o Convex não responde (ex.: sem conexão).
 *
 * `fromCache` indica que o valor veio do aparelho e pode estar desatualizado;
 * `cacheChecked` indica que a leitura local já terminou (evita piscar o
 * estado "vazio" antes de saber se há cópia).
 */
export function useCachedQuery<Query extends FunctionReference<"query">>(
  cacheKey: string | null,
  query: Query,
  ...args: OptionalRestArgs<Query>
): {
  data: FunctionReturnType<Query> | undefined;
  fromCache: boolean;
  cacheChecked: boolean;
} {
  const live = useQuery(query, ...args);
  const [cached, setCached] = useState<FunctionReturnType<Query> | undefined>(undefined);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    if (!cacheKey) {
      setCacheChecked(true);
      return;
    }
    let alive = true;
    setCacheChecked(false);
    AsyncStorage.getItem(`cq:${cacheKey}`)
      .then((raw) => {
        if (!alive) return;
        if (raw) setCached(JSON.parse(raw) as FunctionReturnType<Query>);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCacheChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (live === undefined || !cacheKey) return;
    AsyncStorage.setItem(`cq:${cacheKey}`, JSON.stringify(live)).catch(() => undefined);
  }, [live, cacheKey]);

  if (live !== undefined) return { data: live, fromCache: false, cacheChecked: true };
  return { data: cached, fromCache: cached !== undefined, cacheChecked };
}

/** Apaga a cópia local de uma chave (obra arquivada, acesso revogado). */
export async function forgetCachedQuery(cacheKey: string): Promise<void> {
  await AsyncStorage.removeItem(`cq:${cacheKey}`).catch(() => undefined);
}
