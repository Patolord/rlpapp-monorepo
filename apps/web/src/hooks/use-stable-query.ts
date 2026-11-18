import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useRef } from "react";

/**
 * `useQuery` para consultas com `now` que muda a cada minuto (useNow): enquanto
 * a resposta com o `now` novo não chega, devolve a anterior em vez de
 * `undefined`, para a tela não voltar a "Carregando…" a cada minuto. Só reusa
 * a resposta anterior quando os demais argumentos são os mesmos (outra semana
 * ou outro material carregam do zero).
 */
export function useStableQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: (FunctionArgs<Query> & { now: number }) | "skip"
): FunctionReturnType<Query> | undefined {
  const result = useQuery(query, args);
  const identity = args === "skip" ? "skip" : JSON.stringify({ ...args, now: undefined });
  const last = useRef<{ identity: string; value: FunctionReturnType<Query> } | null>(null);
  if (result !== undefined) {
    last.current = { identity, value: result };
    return result;
  }
  return last.current?.identity === identity ? last.current.value : undefined;
}
