import type { AuthConfig } from "convex/server";

const providers: AuthConfig["providers"] = [
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
];

const mcpIssuer = process.env.MCP_JWT_ISSUER;
const mcpJwks = process.env.MCP_JWT_JWKS;
if (mcpIssuer && mcpJwks) {
  providers.push({
    type: "customJwt",
    applicationID: "convex",
    issuer: mcpIssuer,
    jwks: mcpJwks,
    algorithm: "RS256",
  });
}

export default {
  providers,
} satisfies AuthConfig;
