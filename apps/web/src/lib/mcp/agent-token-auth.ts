import type { AuthInfo } from "@modelcontextprotocol/server";

import {
  AGENT_TOKEN_PREFIX,
  AGENT_TOKEN_VERIFY_CACHE_MS,
  AGENT_WRITE_SCOPE,
  ENGINEERING_READ_SCOPE,
} from "./constants";

/**
 * Autenticação do `/mcp` por token de agente (`Authorization: Bearer rlp_…`).
 *
 * O token é criado na página Agentes do app e guardado com hash no Convex.
 * Aqui ele só é repassado ao endpoint `POST /agent-tokens/verify` do próprio
 * deployment (packages/backend http.ts), que responde com o dono e a
 * permissão. O resultado vira um `AuthInfo` com o mesmo formato que o fluxo
 * OAuth do Clerk produz, mais `extra.agentToken`, para que o resto do servidor
 * não precise saber qual caminho autenticou a conexão.
 */

export type AgentTokenPermission = "full_access" | "read_only";

export type AgentTokenInfo = {
  id: string;
  name: string;
  prefix: string;
  permission: AgentTokenPermission;
};

export type AgentTokenUser = {
  id: string;
  clerkId: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  department: string | null;
};

export type VerifiedAgentToken = {
  token: AgentTokenInfo;
  user: AgentTokenUser;
};

type VerifyResponse = {
  token: {
    _id: string;
    name: string;
    tokenPrefix: string;
    permission: AgentTokenPermission;
    expiresAt: number | null;
  };
  user: {
    _id: string;
    clerkId: string;
    name: string;
    email: string | null;
    username: string | null;
    role: string;
    department: string | null;
  };
};

export function isAgentTokenBearer(bearer: string | undefined): bearer is string {
  return (
    typeof bearer === "string" &&
    bearer.startsWith(AGENT_TOKEN_PREFIX) &&
    bearer.length > AGENT_TOKEN_PREFIX.length + 8
  );
}

export type VerifyAgentTokenOptions = {
  /** `https://<deployment>.convex.site` */
  convexSiteUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type CacheEntry = { value: VerifiedAgentToken | null; expiresAt: number };

const verifyCache = new Map<string, CacheEntry>();

export function resetAgentTokenCacheForTests(): void {
  verifyCache.clear();
}

/**
 * Pergunta ao Convex a quem o token pertence. `null` para token inválido,
 * revogado ou expirado. Falhas de rede/5xx lançam, para que o cliente receba
 * um erro em vez de um 401 enganoso.
 */
export async function verifyAgentToken(
  bearer: string,
  options: VerifyAgentTokenOptions
): Promise<VerifiedAgentToken | null> {
  const now = options.now?.() ?? Date.now();
  const cached = verifyCache.get(bearer);
  if (cached && cached.expiresAt > now) return cached.value;

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${options.convexSiteUrl.replace(/\/+$/, "")}/agent-tokens/verify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    }
  );

  let value: VerifiedAgentToken | null;
  if (response.status === 401) {
    value = null;
  } else if (!response.ok) {
    throw new Error(
      `Agent token verification failed (${response.status} ${response.statusText})`
    );
  } else {
    const body = (await response.json()) as VerifyResponse;
    value = {
      token: {
        id: body.token._id,
        name: body.token.name,
        prefix: body.token.tokenPrefix,
        permission: body.token.permission,
      },
      user: {
        id: body.user._id,
        clerkId: body.user.clerkId,
        name: body.user.name,
        email: body.user.email,
        username: body.user.username,
        role: body.user.role,
        department: body.user.department,
      },
    };
  }

  // Revogação continua valendo na hora no Convex (política em requireAuth);
  // o cache só poupa uma ida ao backend por requisição MCP.
  verifyCache.set(bearer, { value, expiresAt: now + AGENT_TOKEN_VERIFY_CACHE_MS });
  if (verifyCache.size > 1000) {
    for (const [key, entry] of verifyCache) {
      if (entry.expiresAt <= now) verifyCache.delete(key);
    }
  }
  return value;
}

export function agentTokenAuthInfo(
  bearer: string,
  verified: VerifiedAgentToken
): AuthInfo {
  const scopes =
    verified.token.permission === "full_access"
      ? [ENGINEERING_READ_SCOPE, AGENT_WRITE_SCOPE]
      : [ENGINEERING_READ_SCOPE];
  return {
    token: bearer,
    clientId: "agent-token",
    scopes,
    extra: {
      userId: verified.user.clerkId,
      agentToken: verified.token,
      user: verified.user,
    },
  };
}
