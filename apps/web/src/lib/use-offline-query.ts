import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";

import { readCachedValue, writeCachedValue } from "@/lib/field-cache";

export interface OfflineQueryResult<T> {
  /** Resultado ao vivo ou, sem rede, o último resultado salvo. */
  data: T | undefined;
  /** `true` quando `data` veio da cache local (ainda sem resposta do servidor). */
  fromCache: boolean;
  /** Quando o valor em cache foi salvo (apenas se `fromCache`). */
  cachedAt: number | null;
  /** Já tentou ler a cache local — evita "piscar" o estado de carregamento. */
  cacheChecked: boolean;
}

/**
 * `useQuery` com fallback em IndexedDB para o fluxo de campo: enquanto o
 * servidor não responde (offline, rede lenta), devolve o último resultado
 * conhecido para a mesma chave. Assim que a resposta chega, ela é persistida.
 */
export function useOfflineQuery<Query extends FunctionReference<"query">>(
  cacheKey: string,
  query: Query,
  ...args: OptionalRestArgs<Query>
): OfflineQueryResult<FunctionReturnType<Query>> {
  type Data = FunctionReturnType<Query>;
  const live = useQuery(query, ...args);
  const [cached, setCached] = useState<{
    key: string;
    value: Data;
    cachedAt: number;
  } | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void readCachedValue<Data>(cacheKey).then((entry) => {
      if (!alive) return;
      setCached(
        entry
          ? { key: cacheKey, value: entry.value, cachedAt: entry.cachedAt }
          : null
      );
      setCheckedKey(cacheKey);
    });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (live === undefined) return;
    void writeCachedValue(cacheKey, live);
  }, [cacheKey, live]);

  if (live !== undefined) {
    return { data: live, fromCache: false, cachedAt: null, cacheChecked: true };
  }
  const usable = cached && cached.key === cacheKey ? cached : null;
  return {
    data: usable?.value,
    fromCache: usable !== null,
    cachedAt: usable?.cachedAt ?? null,
    cacheChecked: checkedKey === cacheKey,
  };
}
