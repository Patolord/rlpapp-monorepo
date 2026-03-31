import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { env } from "@rlpapp/env/web";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { ConvexProviderWithClerk } from "convex/react-clerk";

import { Toaster } from "@/components/ui/sonner";

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
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "RLP Engenharia",
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
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap",
      },
    ],
  }),

  component: RootDocument,
  beforeLoad: async (ctx) => {
    const { userId, token } = await fetchClerkAuth();
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }
    return { userId, token };
  },
});

function RootDocument() {
  const context = useRouteContext({ from: Route.id });
  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <ConvexProviderWithClerk client={context.convexQueryClient.convexClient} useAuth={useAuth}>
        <html lang="en">
          <head>
            <HeadContent />
          </head>
          <body>
            <Outlet />
            <Toaster richColors />
            <TanStackRouterDevtools position="bottom-left" />
            <Scripts />
          </body>
        </html>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
