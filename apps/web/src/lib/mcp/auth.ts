import { auth } from "@clerk/tanstack-react-start/server";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { deriveConvexSiteUrl, getMcpEnv } from "@rlpapp/env/mcp";

import {
  agentTokenAuthInfo,
  isAgentTokenBearer,
  verifyAgentToken,
  type AgentTokenInfo,
  type AgentTokenUser,
} from "./agent-token-auth";
import { AGENT_WRITE_SCOPE } from "./constants";

export async function verifyMcpOAuthToken(
  _request: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  try {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    if (
      clerkAuth.tokenType !== "oauth_token" ||
      !clerkAuth.isAuthenticated ||
      typeof clerkAuth.subject !== "string" ||
      clerkAuth.subject.length === 0
    ) {
      return undefined;
    }

    return {
      token: bearerToken,
      clientId: clerkAuth.id ?? "clerk",
      scopes: clerkAuth.scopes ?? [],
      extra: { userId: clerkAuth.subject },
    };
  } catch {
    return undefined;
  }
}

/**
 * Autenticação do `/mcp`: tokens de agente (`rlp_…`) são verificados no
 * Convex; qualquer outro bearer segue o fluxo OAuth do Clerk.
 */
export async function verifyMcpToken(
  request: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  if (isAgentTokenBearer(bearerToken)) {
    const verified = await verifyAgentToken(bearerToken, {
      convexSiteUrl: deriveConvexSiteUrl(getMcpEnv()),
    });
    return verified ? agentTokenAuthInfo(bearerToken, verified) : undefined;
  }
  return await verifyMcpOAuthToken(request, bearerToken);
}

/** Quem está do outro lado da conexão, nos termos que as ferramentas usam. */
export type McpPrincipal = {
  /** Clerk user id do dono (o `sub` do JWT de delegação). */
  userId: string;
  /** Escopos concedidos à credencial (OAuth do Clerk ou derivados do token). */
  scopes: string[];
  /** Presente quando a conexão autenticou com token de agente. */
  agentToken?: AgentTokenInfo;
  user?: AgentTokenUser;
};

/**
 * Se a conexão só pode ler. Token de agente: pela permissão gravada. OAuth:
 * só há o escopo de leitura hoje, então é somente-leitura a menos que um
 * escopo de escrita tenha sido concedido.
 */
export function isReadOnlyPrincipal(principal: McpPrincipal): boolean {
  if (principal.agentToken) return principal.agentToken.permission === "read_only";
  return !principal.scopes.includes(AGENT_WRITE_SCOPE);
}

export function getAuthUserId(
  authInfo: AuthInfo | undefined
): string | undefined {
  const userId = authInfo?.extra?.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : undefined;
}

export function getPrincipal(
  authInfo: AuthInfo | undefined
): McpPrincipal | undefined {
  const userId = getAuthUserId(authInfo);
  if (!userId) return undefined;
  const agentToken = authInfo?.extra?.agentToken as AgentTokenInfo | undefined;
  const user = authInfo?.extra?.user as AgentTokenUser | undefined;
  return {
    userId,
    scopes: authInfo?.scopes ?? [],
    ...(agentToken ? { agentToken } : {}),
    ...(user ? { user } : {}),
  };
}

export function readBearer(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}
