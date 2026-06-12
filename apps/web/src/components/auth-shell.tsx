import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";

import { ConvexUnauthRedirect } from "@/components/convex-unauth-redirect";

/**
 * Shell padrão das páginas autenticadas: renderiza o conteúdo quando logado,
 * redireciona para a home quando deslogado e mostra loading enquanto resolve.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <ConvexUnauthRedirect />
      </Unauthenticated>
      <AuthLoading>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLoading>
    </>
  );
}
