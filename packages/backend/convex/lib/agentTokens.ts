import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Tokens de agente (MCP / acesso programático). Ver README → "MCP".
 *
 * Um token é uma credencial de longa duração que age em nome do usuário dono,
 * com a mesma role e as mesmas permissões. O servidor MCP (apps/web, rota
 * `/mcp`) valida o token em `POST /agent-tokens/verify` (http.ts) e emite um
 * JWT de delegação curto cujo `sub` é o clerkId do dono e que carrega as
 * claims `agent_token.id` / `agent_token.permission`. Toda função existente
 * continua resolvendo o mesmo usuário que o app resolveria.
 *
 * Este módulo reúne:
 * - primitivas de criptografia (WebCrypto, funciona no runtime padrão do
 *   Convex em actions e HTTP actions, sem "use node");
 * - a política aplicada centralmente em `requireAuth` (lib/auth.ts): token
 *   revogado é rejeitado na hora e token `read_only` não executa mutations.
 */

export const AGENT_TOKEN_PREFIX = "rlp_";
/** Caracteres do token mantidos em texto puro para exibição (`rlp_` + 8). */
export const AGENT_TOKEN_DISPLAY_PREFIX_LENGTH = AGENT_TOKEN_PREFIX.length + 8;

export type AgentTokenPermission = "full_access" | "read_only";

export const READ_ONLY_AGENT_TOKEN_MESSAGE =
  "Token de agente somente leitura: crie um token com acesso total para gravar";
export const REVOKED_AGENT_TOKEN_MESSAGE = "Token de agente revogado";

// ---------------------------------------------------------------------------
// Criptografia
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Token aleatório de 256 bits: `rlp_` + 43 caracteres base64url. */
export function generateAgentToken(): { token: string; tokenPrefix: string } {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = `${AGENT_TOKEN_PREFIX}${bytesToBase64Url(random)}`;
  return {
    token,
    tokenPrefix: token.slice(0, AGENT_TOKEN_DISPLAY_PREFIX_LENGTH),
  };
}

export function looksLikeAgentToken(value: string): boolean {
  return (
    value.startsWith(AGENT_TOKEN_PREFIX) &&
    value.length > AGENT_TOKEN_DISPLAY_PREFIX_LENGTH
  );
}

export async function hashAgentToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return bytesToHex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Política (identidades vindas de um JWT de delegação com token de agente)
// ---------------------------------------------------------------------------

export type AgentTokenClaims = {
  tokenId: string;
  permission: AgentTokenPermission;
};

/**
 * Claims aninhadas em `agent_token` no JWT de delegação (ver
 * apps/web/src/lib/mcp/delegation.ts). O Convex as expõe achatadas como
 * `identity["agent_token.id"]`. Um JWT do Clerk nunca as carrega, então a
 * ausência significa "sessão normal" e a política não se aplica.
 */
export function getAgentTokenClaims(
  identity: UserIdentity
): AgentTokenClaims | null {
  const tokenId = identity["agent_token.id"];
  const permission = identity["agent_token.permission"];
  if (typeof tokenId !== "string" || tokenId.length === 0) return null;
  if (permission !== "full_access" && permission !== "read_only") return null;
  return { tokenId, permission };
}

/**
 * Só mutations recebem `insert`/`patch`/`replace`/`delete` no `ctx.db`, o que
 * distingue mutation de query em tempo de execução sem passar uma flag por
 * todos os chamadores de `requireAuth`.
 */
export function isWriteContext(ctx: QueryCtx | MutationCtx): boolean {
  return (
    typeof (ctx.db as unknown as { insert?: unknown }).insert === "function"
  );
}

/**
 * Para actions: elas não leem o banco, então só a claim (assinada) é
 * verificada. Revogação é aplicada por qualquer query/mutation que a action
 * venha a executar.
 */
export function rejectReadOnlyAgentTokenInAction(identity: UserIdentity): void {
  if (getAgentTokenClaims(identity)?.permission === "read_only") {
    throw new Error(READ_ONLY_AGENT_TOKEN_MESSAGE);
  }
}

/**
 * Chamado por `requireAuth` logo após ler a identidade. No-op para sessões do
 * Clerk. Para tokens de agente: rejeita token revogado/expirado/inexistente e
 * rejeita token `read_only` em contexto de escrita. A permissão gravada no
 * banco prevalece sobre a claim, para que um rebaixamento futuro valha sem
 * esperar o JWT expirar.
 */
export async function enforceAgentTokenPolicy(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity
): Promise<void> {
  const claims = getAgentTokenClaims(identity);
  if (!claims) return;

  const tokenId = ctx.db.normalizeId("agentTokens", claims.tokenId);
  const token = tokenId ? await ctx.db.get("agentTokens", tokenId) : null;
  if (
    !token ||
    token.revokedAt !== undefined ||
    (token.expiresAt !== undefined && token.expiresAt <= Date.now())
  ) {
    throw new Error(REVOKED_AGENT_TOKEN_MESSAGE);
  }
  if (token.permission === "read_only" && isWriteContext(ctx)) {
    throw new Error(READ_ONLY_AGENT_TOKEN_MESSAGE);
  }
}
