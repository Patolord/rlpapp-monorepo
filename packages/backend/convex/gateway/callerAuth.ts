import type { Role } from "@rlpapp/shared/auth/permissions";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  AGENT_TOKEN_DISPLAY_PREFIX_LENGTH,
  AGENT_TOKEN_PREFIX,
  hashAgentToken,
  looksLikeAgentToken,
  type AgentTokenPermission,
} from "../lib/agentTokens";
import {
  API_TOKEN_TTL_SECONDS,
  isApiTokenSigningConfigured,
  signApiToken,
} from "../lib/apiCrypto";
import { ApiError } from "./responses";

// Autenticação do chamador da API /api/v1: token de agente → dono, JWT curto.

export interface AuthenticatedCaller {
  token: {
    _id: Id<"agentTokens">;
    name: string;
    tokenPrefix: string;
    permission: AgentTokenPermission;
    expiresAt: number | null;
  };
  user: {
    _id: Id<"users">;
    clerkId: string;
    name: string;
    email: string | null;
    username: string | null;
    roles: Role[];
  };
}

/**
 * Estado de auditoria da requisição. Os handlers preenchem conforme descobrem
 * quem chama e o que pediu; `guarded` grava depois que a resposta existe.
 */
export interface RequestAudit {
  route: string;
  caller?: AuthenticatedCaller;
  functionPath?: string;
}

export function readBearer(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

export async function authenticate(
  ctx: ActionCtx,
  request: Request,
  audit: RequestAudit
): Promise<AuthenticatedCaller> {
  const presented = readBearer(request);
  if (!presented) {
    throw new ApiError(
      "UNAUTHENTICATED",
      `Missing credentials. Send your agent token as \`Authorization: Bearer ${AGENT_TOKEN_PREFIX}...\`.`,
      undefined,
      { "WWW-Authenticate": 'Bearer realm="api"' }
    );
  }
  if (!looksLikeAgentToken(presented)) {
    throw new ApiError(
      "UNAUTHENTICATED",
      `This endpoint expects an agent token (${AGENT_TOKEN_PREFIX}...), created at /conta/agentes. If you already hold a JWT from /api/v1/auth/token, call the deployment's Functions API directly with it.`
    );
  }

  const now = Date.now();
  const verified = await ctx.runQuery(internal.agentTokens.verify, {
    tokenHash: await hashAgentToken(presented),
    now,
  });
  if (!verified) {
    throw new ApiError(
      "UNAUTHENTICATED",
      "Invalid, expired or revoked agent token.",
      { tokenPrefix: presented.slice(0, AGENT_TOKEN_DISPLAY_PREFIX_LENGTH) }
    );
  }

  audit.caller = verified;
  await ctx.runMutation(internal.agentTokens.touch, { id: verified.token._id, now });
  return verified;
}

export interface MintedToken {
  token: string;
  expiresAt: number;
}

export async function mintToken(caller: AuthenticatedCaller): Promise<MintedToken> {
  if (!isApiTokenSigningConfigured()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "API token signing is not configured on this deployment (API_JWT_PRIVATE_KEY)."
    );
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  let expiresAt = issuedAt + API_TOKEN_TTL_SECONDS;
  if (caller.token.expiresAt !== null) {
    expiresAt = Math.min(expiresAt, Math.floor(caller.token.expiresAt / 1000));
  }
  const token = await signApiToken({
    subject: caller.user.clerkId,
    email: caller.user.email ?? undefined,
    agentTokenId: caller.token._id,
    permission: caller.token.permission,
    issuedAt,
    expiresAt,
  });
  return { token, expiresAt };
}

export function describeCaller(caller: AuthenticatedCaller) {
  return {
    user: {
      id: caller.user._id,
      name: caller.user.name,
      email: caller.user.email,
      username: caller.user.username,
      roles: caller.user.roles,
    },
    agent_token: {
      id: caller.token._id,
      name: caller.token.name,
      token_prefix: caller.token.tokenPrefix,
      permission: caller.token.permission,
      expires_at:
        caller.token.expiresAt !== null
          ? new Date(caller.token.expiresAt).toISOString()
          : null,
    },
  };
}
