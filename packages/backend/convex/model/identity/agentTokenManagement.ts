import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  rejectAgentTokenIdentity,
  type AgentTokenPermission,
} from "../../lib/agentTokens";
import { isAdmin, requireUser, resolveRoles } from "../../lib/rbac";
import { insertToken, isActiveToken, MAX_TOKENS_PER_USER, normalizeName } from "./agentTokens";

/**
 * Gestão dos tokens de agente (página Agentes, visão administrativa) e a
 * verificação usada pelo endpoint HTTP. A gravação de um token novo está em
 * `agentTokens.ts`; o registro de chamadas, em `agentTokenCalls.ts`.
 */

/** Intervalo mínimo entre gravações de `lastUsedAt`. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/** Nunca expõe o hash nem o dono. */
function toPublicToken(token: Doc<"agentTokens">) {
  return {
    _id: token._id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    permission: token.permission,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    kind: token.kind,
  };
}

/** Rejeita identidades vindas de um JWT de delegação com token de agente. */
async function requireHumanSession(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) rejectAgentTokenIdentity(identity);
}

/**
 * O dono gerencia os próprios tokens; director/admin gerenciam qualquer um.
 * Sempre a partir de uma sessão do app: tokens não gerenciam tokens.
 */
async function getManageableToken(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"agentTokens">
) {
  await requireHumanSession(ctx);
  const token = await ctx.db.get("agentTokens", id);
  if (!token) throw new Error("Token não encontrado");
  if (token.userId !== user._id && !isAdmin(user)) {
    throw new Error("Você só pode gerenciar os seus próprios tokens");
  }
  return token;
}

async function ownerSummary(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email ?? null,
    username: user.username ?? null,
    roles: resolveRoles(user),
    isActive: user.isActive,
  };
}

/**
 * Tokens do usuário, mais recentes primeiro: todos os ativos e, do histórico
 * de revogados/vencidos, só os mais recentes.
 */
export async function listOwnAgentTokens(
  ctx: QueryCtx,
  user: Doc<"users">
) {
  const now = Date.now();
  const tokens = await ctx.db
    .query("agentTokens")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .order("desc")
    .collect();
  const active = tokens.filter((t) => isActiveToken(t, now));
  const inactive = tokens
    .filter((t) => !isActiveToken(t, now))
    .slice(0, MAX_TOKENS_PER_USER);
  return [...active, ...inactive]
    .sort((a, b) => b._creationTime - a._creationTime)
    .map(toPublicToken);
}

export async function renameAgentToken(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { id: Id<"agentTokens">; name: string }
) {
  const token = await getManageableToken(ctx, user, input.id);
  const name = normalizeName(input.name);
  await ctx.db.patch("agentTokens", token._id, { name });
  return toPublicToken({ ...token, name });
}

export async function revokeAgentToken(
  ctx: MutationCtx,
  user: Doc<"users">,
  id: Id<"agentTokens">
) {
  const token = await getManageableToken(ctx, user, id);
  if (token.revokedAt !== undefined) return toPublicToken(token);
  const revokedAt = Date.now();
  await ctx.db.patch("agentTokens", token._id, { revokedAt });
  return toPublicToken({ ...token, revokedAt });
}

/** Todos os tokens do sistema com o dono, mais recentes primeiro. */
export async function listAllAgentTokens(ctx: QueryCtx) {
  // Equipe pequena e no máximo 25 tokens ativos por pessoa; paginar se crescer.
  const tokens = await ctx.db.query("agentTokens").order("desc").take(1000);
  const ownerIds = [...new Set(tokens.map((t) => t.userId))];
  const owners = new Map(
    await Promise.all(
      ownerIds.map(async (id) => [id, await ownerSummary(ctx, id)] as const)
    )
  );
  return tokens.map((t) => ({
    ...toPublicToken(t),
    owner: owners.get(t.userId) ?? null,
  }));
}

/** Desligamento: revoga todos os tokens ativos de um usuário. */
export async function revokeAllAgentTokensForUser(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<number> {
  await requireHumanSession(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("Usuário não encontrado");
  const revokedAt = Date.now();
  let count = 0;
  // Todas as linhas do usuário: uma janela fixa deixaria tokens novos de
  // fora depois de muitos ciclos de criar/revogar.
  for await (const token of ctx.db
    .query("agentTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (token.revokedAt === undefined) {
      await ctx.db.patch("agentTokens", token._id, { revokedAt });
      count++;
    }
  }
  return count;
}

export type InsertAgentTokenInput = {
  name: string;
  permission: AgentTokenPermission;
  expiresInDays?: number;
  tokenHash: string;
  tokenPrefix: string;
};

/**
 * Grava o token criado pela action `create`, cuja autenticação a mutation
 * herda: `requireUser` aplica a política de tokens e `requireHumanSession`
 * repete a regra da action.
 */
export async function insertAgentTokenForCurrentUser(
  ctx: MutationCtx,
  input: InsertAgentTokenInput
) {
  await requireHumanSession(ctx);
  const user = await requireUser(ctx);
  return await insertToken(ctx, user, input);
}

/** Bootstrap pela CLI: grava o token para um usuário pelo id. */
export async function insertAgentTokenForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: InsertAgentTokenInput
) {
  const user = await ctx.db.get("users", userId);
  if (!user) throw new Error("Usuário não encontrado");
  return await insertToken(ctx, user, input);
}

/** Usuário pelo email ou, na falta, pelo username. */
export async function findUserIdByLogin(
  ctx: QueryCtx,
  login: string
): Promise<Id<"users"> | null> {
  const byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", login))
    .first();
  if (byEmail) return byEmail._id;
  // Usuários só com username (sem email). Tabela pequena.
  const users = await ctx.db.query("users").take(1000);
  return users.find((u) => u.username === login)?._id ?? null;
}

/**
 * Resolve um token apresentado (pelo hash) ao seu dono. Null para token
 * desconhecido, revogado ou expirado e para dono inativo ou sem clerkId.
 */
export async function verifyAgentTokenHash(
  ctx: QueryCtx,
  input: { tokenHash: string; now: number }
) {
  const token = await ctx.db
    .query("agentTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", input.tokenHash))
    .unique();
  if (!token || !isActiveToken(token, input.now)) return null;

  const user = await ctx.db.get("users", token.userId);
  if (!user || !user.isActive || !user.clerkId) return null;

  return {
    token: {
      _id: token._id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      permission: token.permission,
      expiresAt: token.expiresAt ?? null,
    },
    user: {
      _id: user._id,
      clerkId: user.clerkId,
      name: user.name,
      email: user.email ?? null,
      username: user.username ?? null,
      roles: resolveRoles(user),
    },
  };
}

/** Registra uso, no máximo uma vez por minuto por token. */
export async function touchAgentToken(
  ctx: MutationCtx,
  input: { id: Id<"agentTokens">; now: number }
): Promise<void> {
  const token = await ctx.db.get("agentTokens", input.id);
  if (!token) return;
  if (
    token.lastUsedAt !== undefined &&
    input.now - token.lastUsedAt < LAST_USED_WRITE_INTERVAL_MS
  ) {
    return;
  }
  await ctx.db.patch("agentTokens", input.id, { lastUsedAt: input.now });
}
