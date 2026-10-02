import { useEffect, useState } from "react";
import { useAuth } from "@clerk/tanstack-react-start";

import {
  clearFieldCache,
  getStoredCacheOwner,
  setStoredCacheOwner,
} from "@/lib/field-cache";
import { useOnline } from "@/lib/use-online";

export interface FieldCacheOwner {
  /** Conta (id Clerk) dona da cache local, ou null sem sessão. */
  ownerId: string | null;
  /** `false` enquanto ainda não dá para saber de quem é a cache. */
  ready: boolean;
}

/**
 * Decide de qual conta a cache de campo pode ser lida/escrita.
 *
 * - Sessão carregada: usa o usuário Clerk. Se for uma conta diferente da que
 *   deixou dados no aparelho, apaga tudo antes (aparelho compartilhado).
 * - Clerk ainda carregando e sem rede: usa a última conta registrada — só ela
 *   pode ter entrado neste aparelho (entrar exige conexão).
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
    let alive = true;

    if (!isLoaded) {
      if (!online) {
        setOwner({ ownerId: getStoredCacheOwner(), ready: true });
      }
      return;
    }

    if (!userId) {
      setOwner({ ownerId: null, ready: true });
      return;
    }

    const previous = getStoredCacheOwner();
    const adopt = () => {
      if (!alive) return;
      setStoredCacheOwner(userId);
      setOwner({ ownerId: userId, ready: true });
    };
    if (previous && previous !== userId) {
      void clearFieldCache().then(adopt);
    } else {
      adopt();
    }
    return () => {
      alive = false;
    };
  }, [isLoaded, userId, online]);

  return owner;
}
