export const ENGINEERING_READ_SCOPE = "rlp:engineering:read";
/** Escopo informativo atribuído a tokens de agente com acesso total. */
export const AGENT_WRITE_SCOPE = "rlp:write";

export const MCP_SERVER_NAME = "rlp-engineering";
export const MCP_SERVER_VERSION = "1.0.0";

export const OAUTH_SCOPES_SUPPORTED = [
  "openid",
  "profile",
  "email",
  ENGINEERING_READ_SCOPE,
] as const;

export const RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource/mcp";

export const CONVEX_JWT_AUDIENCE = "convex";
export const DELEGATION_TTL_SECONDS = 120;

/** Tokens de agente começam com este prefixo (packages/backend lib/agentTokens.ts). */
export const AGENT_TOKEN_PREFIX = "rlp_";
/** Resultado de verificação de um token fica em cache por este tempo. */
export const AGENT_TOKEN_VERIFY_CACHE_MS = 30_000;
/** Limite para a chamada de verificação do token no Convex. */
export const AGENT_TOKEN_VERIFY_TIMEOUT_MS = 5_000;
/** Catálogo de funções por usuário fica em cache por este tempo. */
export const CATALOG_CACHE_MS = 60_000;
/** Resultados maiores que isto são truncados para não inundar o contexto. */
export const MAX_TOOL_RESULT_CHARS = 120_000;
