import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { api } from "@rlpapp/backend/convex/_generated/api";
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { env } from "@rlpapp/env/web";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { lazy, useEffect, useRef } from "react";

// Devtools só em desenvolvimento — excluído do bundle de produção
const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import("@tanstack/react-router-devtools").then((mod) => ({
        default: mod.TanStackRouterDevtools,
      }))
    );

import { FieldCacheSessionGuard } from "@/components/field-cache-session-guard";
import { OfflineSync } from "@/components/offline-sync";
import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { recallLastUserId, rememberLastUserId } from "@/lib/last-user";
import appCss from "../index.css?url";

type ClerkAuthSnapshot = {
  userId: string | null;
  token: string | null;
  /**
   * `true` quando o Clerk não pôde ser consultado (erro transitório). Nesse
   * caso `userId: null` NÃO significa "saiu da conta" e a última sessão
   * conhecida não deve ser descartada.
   */
  unavailable: boolean;
};

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClerkAuthSnapshot> => {
    let clerkAuth: Awaited<ReturnType<typeof auth>>;
    try {
      clerkAuth = await auth();
    } catch (error) {
      console.error("[fetchClerkAuth] Error:", error);
      return { userId: null, token: null, unavailable: true };
    }
    try {
      const token = await clerkAuth.getToken({ template: "convex" });
      return { userId: clerkAuth.userId, token, unavailable: false };
    } catch (error) {
      // Sessão conhecida, mas sem token agora: a página ainda renderiza e o
      // cliente Convex autentica pelo Clerk no navegador.
      console.error("[fetchClerkAuth] getToken error:", error);
      return { userId: clerkAuth.userId, token: null, unavailable: false };
    }
  }
);

let lastKnownAuth: ClerkAuthSnapshot | null = null;

/**
 * Guarda a última sessão conhecida para a navegação continuar funcionando
 * sem rede (PWA de campo): só o id do usuário é persistido — nunca o token.
 * Sair da conta (online) limpa o registro; uma falha transitória do Clerk não.
 */
function rememberAuth(auth: ClerkAuthSnapshot) {
  if (auth.unavailable) return;
  lastKnownAuth = auth;
  rememberLastUserId(auth.userId);
}

function recallAuth(): ClerkAuthSnapshot {
  if (lastKnownAuth) return lastKnownAuth;
  return { userId: recallLastUserId(), token: null, unavailable: true };
}

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "RLP Engenharia",
      },
      {
        name: "description",
        content:
          "Registro de instalação e manutenção de equipamentos em campo",
      },
      {
        name: "theme-color",
        content: "#0f172a",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "RLP",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon.png",
      },
      {
        rel: "apple-touch-icon",
        href: "/pwa-192.png",
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&display=swap",
      },
    ],
  }),

  shellComponent: RootDocument,
  beforeLoad: async (ctx) => {
    let auth: ClerkAuthSnapshot;
    try {
      auth = await fetchClerkAuth();
      rememberAuth(auth);
      // Clerk indisponível no servidor: no cliente, segue com a última sessão
      // conhecida em vez de tratar como "saiu da conta".
      if (auth.unavailable && typeof window !== "undefined") {
        auth = recallAuth();
      }
    } catch (error) {
      // No cliente, a server function falha sem rede. Em vez de derrubar a
      // navegação (e o fluxo offline do técnico), segue com a última sessão
      // conhecida; o acesso aos dados continua protegido pelo Convex/Clerk e
      // a cache local é separada por conta.
      if (typeof window === "undefined") throw error;
      auth = recallAuth();
    }
    if (auth.token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(auth.token);
    }
    return { userId: auth.userId, token: auth.token };
  },
});

function EnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);
  const called = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !called.current) {
      called.current = true;
      const fromQr =
        sessionStorage.getItem("qr_login_token") !== null ||
        window.location.pathname.startsWith("/q/");
      sessionStorage.removeItem("qr_login_token");
      ensureUser(fromQr ? { origin: "qr" } : {}).catch(console.error);
    }
  }, [isAuthenticated, ensureUser]);

  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const context = useRouteContext({ from: Route.id });
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider
          publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}
          signInUrl="/"
          signUpUrl="/"
          afterSignOutUrl="/"
          signInFallbackRedirectUrl="/app"
          signUpFallbackRedirectUrl="/app"
        >
          <ConvexProviderWithClerk client={context.convexQueryClient.convexClient} useAuth={useAuth}>
            <EnsureUser />
            <FieldCacheSessionGuard />
            <PwaRegister />
            <OfflineSync />
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster richColors />
          </ConvexProviderWithClerk>
        </ClerkProvider>
        <TanStackRouterDevtools position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
