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
} {
  const live = useQuery(query, ...args);
  const [cached, setCached] = useState<{ key: string; value: FunctionReturnType<Query> } | undefined>(undefined);
  // Chave cuja leitura local já terminou (com ou sem cópia).
  const [checkedKey, setCheckedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheKey) return;
    let alive = true;
    AsyncStorage.getItem(`cq:${cacheKey}`)
      .then((raw) => {
        if (!alive || !raw) return;
        setCached({ key: cacheKey, value: JSON.parse(raw) as FunctionReturnType<Query> });
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
    AsyncStorage.setItem(`cq:${cacheKey}`, JSON.stringify(live)).catch(() => undefined);
  }, [live, cacheKey]);

  if (live !== undefined) return { data: live, fromCache: false, cacheChecked: true };
  if (!cacheKey) return { data: undefined, fromCache: false, cacheChecked: true };
  const value = cached?.key === cacheKey ? cached.value : undefined;
  return { data: value, fromCache: value !== undefined, cacheChecked: checkedKey === cacheKey };
}

/** Apaga a cópia local de uma chave (obra arquivada, acesso revogado). */
export async function forgetCachedQuery(cacheKey: string): Promise<void> {
  await AsyncStorage.removeItem(`cq:${cacheKey}`).catch(() => undefined);
}
