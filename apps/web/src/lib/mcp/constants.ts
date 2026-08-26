export const ENGINEERING_READ_SCOPE = "rlp:engineering:read";

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
