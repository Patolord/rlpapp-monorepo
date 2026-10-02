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

import { OfflineSync } from "@/components/offline-sync";
import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "../index.css?url";

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const clerkAuth = await auth();
    const token = await clerkAuth.getToken({ template: "convex" });
    return { userId: clerkAuth.userId, token };
  } catch (error) {
    console.error("[fetchClerkAuth] Error:", error);
    // Return null values to allow page to render without auth
    return { userId: null, token: null };
  }
});

type ClerkAuthSnapshot = { userId: string | null; token: string | null };

const LAST_USER_ID_KEY = "rlp-last-user-id";
let lastKnownAuth: ClerkAuthSnapshot | null = null;

/**
 * Guarda a última sessão conhecida para a navegação continuar funcionando
 * sem rede (PWA de campo): só o id do usuário é persistido — nunca o token.
 * Sair da conta (online) limpa o registro.
 */
function rememberAuth(auth: ClerkAuthSnapshot) {
  lastKnownAuth = auth;
  if (typeof localStorage === "undefined") return;
  try {
    if (auth.userId) localStorage.setItem(LAST_USER_ID_KEY, auth.userId);
    else localStorage.removeItem(LAST_USER_ID_KEY);
  } catch {
    // Sem localStorage, o fallback fica só em memória.
  }
}

function recallAuth(): ClerkAuthSnapshot {
  if (lastKnownAuth) return lastKnownAuth;
  let userId: string | null = null;
  try {
    userId = localStorage.getItem(LAST_USER_ID_KEY);
  } catch {
    userId = null;
  }
  return { userId, token: null };
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
