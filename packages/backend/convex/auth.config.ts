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

// API HTTP para agentes (convex/gateway/v1.ts): tokens `rlp_…` são trocados
// por JWTs ES256 curtos assinados por este deployment (API_JWT_PRIVATE_KEY).
// O `sub` é o clerkId do dono, então as funções veem um usuário normal. O
// issuer é a URL *site* do deployment, que o Convex define sempre; o
// provider só é inútil (nunca valida nada) enquanto a chave não existir.
const apiTokenIssuer = readOptional("CONVEX_SITE_URL")?.replace(/\/+$/, "");
if (apiTokenIssuer) {
  providers.push({
    type: "customJwt",
    applicationID: "convex",
    issuer: apiTokenIssuer,
    jwks: `${apiTokenIssuer}/.well-known/jwks.json`,
    algorithm: "ES256",
  });
}

export default {
  providers,
} satisfies AuthConfig;
