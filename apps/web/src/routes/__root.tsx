import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
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

import Header from "../components/header";
import appCss from "../index.css?url";

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const clerkAuth = await auth();
  const token = await clerkAuth.getToken({ template: "convex" });
  return { userId: clerkAuth.userId, token };
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
        title: "My App",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
    <ClerkProvider>
      <ConvexProviderWithClerk client={context.convexQueryClient.convexClient} useAuth={useAuth}>
        <html lang="en" className="dark">
          <head>
            <HeadContent />
          </head>
          <body>
            <div className="grid h-svh grid-rows-[auto_1fr]">
              <Header />
              <Outlet />
            </div>
            <Toaster richColors />
            <TanStackRouterDevtools position="bottom-left" />
            <Scripts />
          </body>
        </html>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
