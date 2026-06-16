import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";

import { resolveClerkProxyUrl } from "@/lib/clerk-config";

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [
      clerkMiddleware(({ url }) => ({
        signInUrl: "/",
        signUpUrl: "/",
        signInFallbackRedirectUrl: "/app",
        signUpFallbackRedirectUrl: "/app",
        proxyUrl: resolveClerkProxyUrl(url.origin, process.env.VITE_CLERK_PROXY_URL),
      })),
    ],
  };
});
