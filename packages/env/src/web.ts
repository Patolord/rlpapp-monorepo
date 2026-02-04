import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
  },
  runtimeEnv: {
    // Client vars from Vite
    VITE_CONVEX_URL: (import.meta as any).env?.VITE_CONVEX_URL,
    VITE_CLERK_PUBLISHABLE_KEY: (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY,
    // Server vars from process.env (only available on server)
    CLERK_SECRET_KEY: typeof process !== "undefined" ? process.env?.CLERK_SECRET_KEY : undefined,
  },
  skipValidation: typeof window !== "undefined", // Skip server validation on client
  emptyStringAsUndefined: true,
});
