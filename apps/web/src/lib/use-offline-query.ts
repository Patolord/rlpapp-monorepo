import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";

import { readCachedValue, writeCachedValue } from "@/lib/field-cache";
import { useFieldCacheOwner } from "@/lib/use-field-cache-owner";

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
 * conhecido para a mesma chave **da conta atual**. Assim que a resposta
 * chega, ela é persistida.
 */
export function useOfflineQuery<Query extends FunctionReference<"query">>(
  cacheKey: string,
  query: Query,
  ...args: OptionalRestArgs<Query>
): OfflineQueryResult<FunctionReturnType<Query>> {
  type Data = FunctionReturnType<Query>;
  const live = useQuery(query, ...args);
  const { ownerId, ready } = useFieldCacheOwner();
  const scope = ready && ownerId ? `${ownerId}::${cacheKey}` : null;

  const [cached, setCached] = useState<{
    scope: string;
    value: Data;
    cachedAt: number;
  } | null>(null);
  const [checkedScope, setCheckedScope] = useState<string | null>(null);

  useEffect(() => {
    if (!scope || !ownerId) return;
    let alive = true;
    void readCachedValue<Data>(ownerId, cacheKey).then((entry) => {
      if (!alive) return;
      setCached(
        entry ? { scope, value: entry.value, cachedAt: entry.cachedAt } : null
      );
      setCheckedScope(scope);
    });
    return () => {
      alive = false;
    };
  }, [scope, ownerId, cacheKey]);

  useEffect(() => {
    if (live === undefined || !scope || !ownerId) return;
    void writeCachedValue(ownerId, cacheKey, live);
  }, [live, scope, ownerId, cacheKey]);

  if (live !== undefined) {
    return { data: live, fromCache: false, cachedAt: null, cacheChecked: true };
  }
  // Sem conta conhecida não há cache a consultar.
  if (ready && !ownerId) {
    return { data: undefined, fromCache: false, cachedAt: null, cacheChecked: true };
  }
  const usable = cached && cached.scope === scope ? cached : null;
  return {
    data: usable?.value,
    fromCache: usable !== null,
    cachedAt: usable?.cachedAt ?? null,
    cacheChecked: scope !== null && checkedScope === scope,
  };
}
