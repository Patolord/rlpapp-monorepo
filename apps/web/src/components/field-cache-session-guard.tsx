import { useEffect } from "react";
import { useAuth } from "@clerk/tanstack-react-start";

import { syncFieldCacheOwner } from "@/lib/use-field-cache-owner";
import { useOnline } from "@/lib/use-online";

/**
 * Montado na raiz: garante que sair da conta (ou entrar com outra) apaga a
 * cache de campo mesmo fora das telas do técnico — o sign-out redireciona
 * para "/" antes de qualquer componente de campo reagir.
 */
export function FieldCacheSessionGuard() {
  const { isLoaded, userId } = useAuth();
  const online = useOnline();

  useEffect(() => {
    if (!isLoaded) return;
    void syncFieldCacheOwner(userId ?? null, online);
  }, [isLoaded, userId, online]);

  return null;
}
