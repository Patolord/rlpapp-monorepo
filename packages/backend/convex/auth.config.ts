import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Production: custom domain
      domain: "https://clerk.rlpeng.com.br",
      applicationID: "convex",
    },
    {
      // Production: Clerk's hosted domain (backup)
      domain: "https://mature-jaguar-60.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
