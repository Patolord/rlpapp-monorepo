import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import {
  generateAgentToken,
  hashAgentToken,
  rejectAgentTokenIdentity,
} from "./lib/agentTokens";
import {
  adminMutation,
  adminQuery,
  staffMutation,
  staffQuery,
} from "./lib/rbac";
import {
  listAllAgentTokenCalls,
  listMyAgentTokenCalls,
  purgeAgentTokenCallsBatch,
  recordAgentApiRequest,
  recordAgentTokenCall,
} from "./model/identity/agentTokenCalls";
import {
  findUserIdByLogin,
  insertAgentTokenForCurrentUser,
  insertAgentTokenForUser,
  listAllAgentTokens,
  listOwnAgentTokens,
  renameAgentToken,
  revokeAgentToken,
  revokeAllAgentTokensForUser,
  touchAgentToken,
  verifyAgentTokenHash,
} from "./model/identity/agentTokenManagement";
import {
  agentTokenOwnerValidator,
  callValidator,
  publicTokenValidator,
  verifiedAgentTokenValidator,
} from "./model/identity/agentTokenValidators";
import { agentTokenPermission } from "./schema/identity";

/**
 * Tokens de agente: credenciais pessoais para agentes de IA (Claude, Cursor,
 * scripts) usarem o servidor MCP do app como o usuário dono. Ver README →
 * "MCP" e lib/agentTokens.ts para a política central.
 */

// ===========================================================================
// PÚBLICO — gestão dos próprios tokens (página Agentes e o próprio MCP)
// ===========================================================================

/**
 * Tokens do usuário atual, mais recentes primeiro. Nunca inclui o hash. Todos os
 * ativos aparecem sempre (para poderem ser revogados aqui); do histórico de
 * revogados/vencidos, só os mais recentes. Cada novo login do Takeoff revoga o
 * token anterior da instalação, então o histórico cresce bem mais que os ativos.
 */
export const list = staffQuery({
  args: {},
  returns: v.array(publicTokenValidator),
  handler: async (ctx) => {
    return await listOwnAgentTokens(ctx, ctx.user);
  },
});

/**
 * Cria um token para o usuário atual. O texto puro é devolvido uma única vez.
 *
 * É uma action porque o hash usa WebCrypto; a inserção acontece numa mutation
 * interna que resolve o usuário pela autenticação herdada.
 */
export const create = action({
  args: {
    name: v.string(),
    permission: agentTokenPermission,
    /** Omitir para um token sem validade. */
    expiresInDays: v.optional(v.number()),
  },
  returns: v.object({
    id: v.id("agentTokens"),
    /** Texto puro do token. Mostrado uma vez; guarde em local seguro. */
    token: v.string(),
    tokenPrefix: v.string(),
    name: v.string(),
    permission: agentTokenPermission,
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    // Um token vazado não pode se perpetuar criando outro.
    rejectAgentTokenIdentity(identity);

    const { token, tokenPrefix } = generateAgentToken();
    const tokenHash = await hashAgentToken(token);
    const created: { id: Id<"agentTokens">; name: string; expiresAt?: number } =
      await ctx.runMutation(internal.agentTokens.insertForCurrentUser, {
        name: args.name,
        permission: args.permission,
        expiresInDays: args.expiresInDays,
        tokenHash,
        tokenPrefix,
      });
    return {
      id: created.id,
      token,
      tokenPrefix,
      name: created.name,
      permission: args.permission,
      expiresAt: created.expiresAt,
    };
  },
});

/** Renomeia um token. O segredo e a permissão não mudam. */
export const rename = staffMutation({
  args: { id: v.id("agentTokens"), name: v.string() },
  returns: publicTokenValidator,
  handler: async (ctx, args) => {
    return await renameAgentToken(ctx, ctx.user, args);
  },
});

/** Revoga um token. Vale imediatamente para toda conexão que o use. */
export const revoke = staffMutation({
  args: { id: v.id("agentTokens") },
  returns: publicTokenValidator,
  handler: async (ctx, args) => {
    return await revokeAgentToken(ctx, ctx.user, args.id);
  },
});

/** Chamadas recentes feitas com os tokens do usuário atual. */
export const listMyCalls = staffQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(callValidator),
  handler: async (ctx, args) => {
    return await listMyAgentTokenCalls(ctx, ctx.user, args);
  },
});

/**
 * Registra uma chamada de ferramenta feita pelo servidor MCP. Só identidades
 * vindas de um JWT de delegação com token de agente podem gravar, e a linha é
 * sempre atribuída ao token da claim — um usuário comum não consegue forjar
 * atividade de um token. Não passa por `requireAuth` de propósito: tokens
 * somente-leitura também precisam registrar o que fizeram.
 */
export const recordCall = mutation({
  args: {
    tool: v.string(),
    functionPath: v.optional(v.string()),
    outcome: v.union(v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    durationMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordAgentTokenCall(ctx, args);
    return null;
  },
});

// ===========================================================================
// PÚBLICO — visão administrativa (director/admin)
// ===========================================================================

/** Todos os tokens do sistema com o dono, mais recentes primeiro. */
export const listAll = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      ...publicTokenValidator.fields,
      owner: v.union(agentTokenOwnerValidator, v.null()),
    })
  ),
  handler: async (ctx) => {
    return await listAllAgentTokens(ctx);
  },
});

/** Chamadas recentes de qualquer token (ou de um token específico). */
export const listAllCalls = adminQuery({
  args: {
    tokenId: v.optional(v.id("agentTokens")),
    limit: v.optional(v.number()),
  },
  returns: v.array(callValidator),
  handler: async (ctx, args) => {
    return await listAllAgentTokenCalls(ctx, args);
  },
});

/** Desligamento: revoga todos os tokens ativos de um usuário. */
export const revokeAllForUser = adminMutation({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await revokeAllAgentTokensForUser(ctx, args.userId);
  },
});

// ===========================================================================
// INTERNO — usado pelo endpoint HTTP de verificação, pela action `create`,
// pelo cron e pelo bootstrap via CLI
// ===========================================================================

export const insertForCurrentUser = internalMutation({
  args: {
    name: v.string(),
    permission: agentTokenPermission,
    expiresInDays: v.optional(v.number()),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
  },
  returns: v.object({
    id: v.id("agentTokens"),
    name: v.string(),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    return await insertAgentTokenForCurrentUser(ctx, args);
  },
});

export const insertForUser = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    permission: agentTokenPermission,
    expiresInDays: v.optional(v.number()),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
  },
  returns: v.object({
    id: v.id("agentTokens"),
    name: v.string(),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, { userId, ...args }) => {
    return await insertAgentTokenForUser(ctx, userId, args);
  },
});

export const findUserByLogin = internalQuery({
  args: { login: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { login }) => {
    return await findUserIdByLogin(ctx, login);
  },
});

/**
 * Bootstrap do operador: emite um token para um usuário (por email ou
 * username) sem passar pelo navegador.
 *
 *   npx convex run agentTokens:createForUser \
 *     '{"login":"voce@rlpeng.com.br","name":"CLI","permission":"full_access"}'
 */
export const createForUser = internalAction({
  args: {
    login: v.string(),
    name: v.string(),
    permission: agentTokenPermission,
    expiresInDays: v.optional(v.number()),
  },
  returns: v.object({
    id: v.id("agentTokens"),
    token: v.string(),
    tokenPrefix: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId: Id<"users"> | null = await ctx.runQuery(
      internal.agentTokens.findUserByLogin,
      { login: args.login }
    );
    if (!userId) throw new Error(`Usuário não encontrado: ${args.login}`);

    const { token, tokenPrefix } = generateAgentToken();
    const tokenHash = await hashAgentToken(token);
    const created: { id: Id<"agentTokens"> } = await ctx.runMutation(
      internal.agentTokens.insertForUser,
      {
        userId,
        name: args.name,
        permission: args.permission,
        expiresInDays: args.expiresInDays,
        tokenHash,
        tokenPrefix,
      }
    );
    return { id: created.id, token, tokenPrefix };
  },
});

/**
 * Resolve um token apresentado (pelo hash) ao seu dono. Devolve null para
 * token desconhecido, revogado ou expirado e para dono inativo ou sem
 * clerkId, para que o endpoint HTTP responda sempre com o mesmo 401.
 */
export const verify = internalQuery({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.union(verifiedAgentTokenValidator, v.null()),
  handler: async (ctx, args) => {
    return await verifyAgentTokenHash(ctx, args);
  },
});

/**
 * Registra uma requisição da API HTTP (`/api/v1`, convex/gateway/v1.ts). O
 * gateway já autenticou o token pelo hash, então a linha é atribuída
 * diretamente a ele; aparece em "Atividade recente" junto com as chamadas do
 * MCP, com `tool` = `api:<rota>`.
 */
export const recordApiRequest = internalMutation({
  args: {
    tokenId: v.id("agentTokens"),
    userId: v.id("users"),
    route: v.string(),
    functionPath: v.optional(v.string()),
    outcome: v.union(v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    durationMs: v.number(),
    createdAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordAgentApiRequest(ctx, args);
    return null;
  },
});

/** Registra uso, no máximo uma vez por minuto por token. */
export const touch = internalMutation({
  args: { id: v.id("agentTokens"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await touchAgentToken(ctx, args);
    return null;
  },
});

/**
 * Cron: apaga chamadas antigas em lotes (AGENT_TOKEN_CALL_RETENTION_DAYS em
 * model/identity/agentTokenCalls.ts), reagendando até terminar.
 */
export const purgeCalls = internalMutation({
  args: { olderThan: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { deleted, cutoff, hasMore } = await purgeAgentTokenCallsBatch(
      ctx,
      args.olderThan
    );
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.agentTokens.purgeCalls, {
        olderThan: cutoff,
      });
    }
    return deleted;
  },
});
