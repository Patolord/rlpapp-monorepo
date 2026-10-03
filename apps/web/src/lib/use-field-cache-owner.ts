import { useEffect, useState } from "react";
import { useAuth } from "@clerk/tanstack-react-start";

import {
  clearFieldCache,
  getStoredCacheOwner,
  setStoredCacheOwner,
} from "@/lib/field-cache";
import { recallLastUserId } from "@/lib/last-user";
import { useOnline } from "@/lib/use-online";

export interface FieldCacheOwner {
  /** Conta (id Clerk) dona da cache local, ou null sem sessão. */
  ownerId: string | null;
  /** `false` enquanto ainda não dá para saber de quem é a cache. */
  ready: boolean;
}

/**
 * Alinha a cache local com a sessão Clerk conhecida. Resolve com a conta que
 * pode usar a cache (ou null).
 *
 * - Com usuário: se a cache é de outra conta, apaga tudo antes de adotar.
 * - Sem usuário (saiu da conta, confirmado online): apaga tudo — num aparelho
 *   compartilhado nada da conta anterior pode ficar para trás.
 */
export async function syncFieldCacheOwner(
  userId: string | null,
  online: boolean
): Promise<string | null> {
  const stored = getStoredCacheOwner();
  if (userId) {
    if (stored && stored !== userId) await clearFieldCache();
    setStoredCacheOwner(userId);
    return userId;
  }
  if (online && stored) await clearFieldCache();
  return null;
}

/**
 * Dono da cache que pode ser usado enquanto o Clerk ainda carrega sem rede:
 * só a última conta que entrou neste aparelho (entrar exige conexão) e só se
 * a cache for mesmo dela.
 */
function offlineFallbackOwner(): string | null {
  const stored = getStoredCacheOwner();
  const last = recallLastUserId();
  return stored && last && stored === last ? stored : null;
}

/**
 * Decide de qual conta a cache de campo pode ser lida/escrita.
 *
 * - Sessão carregada: usa o usuário Clerk (ver `syncFieldCacheOwner`).
 * - Clerk ainda carregando e sem rede: usa a última conta registrada, se a
 *   cache for dela.
 * - Clerk carregando com rede: espera, para nunca mostrar a cache de outra
 *   conta enquanto a sessão atual não é conhecida.
 */
export function useFieldCacheOwner(): FieldCacheOwner {
  const { isLoaded, userId } = useAuth();
  const online = useOnline();
  const [owner, setOwner] = useState<FieldCacheOwner>({
    ownerId: null,
    ready: false,
  });

  useEffect(() => {
    if (!isLoaded) {
      if (!online) {
        setOwner({ ownerId: offlineFallbackOwner(), ready: true });
      }
      return;
    }

    let alive = true;
    void syncFieldCacheOwner(userId ?? null, online).then((ownerId) => {
      if (alive) setOwner({ ownerId, ready: true });
    });
    return () => {
      alive = false;
    };
  }, [isLoaded, userId, online]);

  return owner;
}
