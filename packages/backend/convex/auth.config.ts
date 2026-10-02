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

// Convex evaluates this file at push time and fails the whole push when an
// *unset* variable is read via `process.env.NAME` ("used in auth config file
// but its value was not set"). The MCP provider is optional, so probe for the
// key before reading it; otherwise every deployment without MCP configured
// (local, dev, prod) would stop deploying.
const env: Record<string, string | undefined> = process.env;
const readOptional = (name: string): string | undefined =>
  name in env ? env[name] : undefined;
const mcpIssuer = readOptional("MCP_JWT_ISSUER");
const mcpJwks = readOptional("MCP_JWT_JWKS");
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
