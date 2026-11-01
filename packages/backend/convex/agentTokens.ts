import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  generateAgentToken,
  getAgentTokenClaims,
  hashAgentToken,
  rejectAgentTokenIdentity,
} from "./lib/agentTokens";
import {
  adminMutation,
  adminQuery,
  requireUser,
  staffMutation,
  staffQuery,
} from "./lib/rbac";
import {
  insertToken,
  isActiveToken,
  MAX_TOKENS_PER_USER,
  normalizeName,
} from "./model/identity/agentTokens";
import { agentTokenKind, agentTokenPermission } from "./schema";

/**
 * Tokens de agente: credenciais pessoais para agentes de IA (Claude, Cursor,
 * scripts) usarem o servidor MCP do app como o usuário dono. Ver README →
 * "MCP" e lib/agentTokens.ts para a política central.
 */

/** Intervalo mínimo entre gravações de `lastUsedAt`. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
/** Linhas de `agentTokenCalls` mais antigas que isto são apagadas pelo cron. */
export const AGENT_TOKEN_CALL_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 500;
const MAX_CALL_ERROR_LENGTH = 300;
const DEFAULT_CALLS_LIMIT = 50;
const MAX_CALLS_LIMIT = 200;

const publicTokenValidator = v.object({
  _id: v.id("agentTokens"),
  name: v.string(),
  tokenPrefix: v.string(),
  permission: agentTokenPermission,
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  /** "device" = emitido pelo login do RLP Takeoff; ausente = token de agente. */
  kind: v.optional(agentTokenKind),
});

const callValidator = v.object({
  _id: v.id("agentTokenCalls"),
  tokenId: v.id("agentTokens"),
  tokenName: v.union(v.string(), v.null()),
  tool: v.string(),
  functionPath: v.union(v.string(), v.null()),
  outcome: v.union(v.literal("success"), v.literal("error")),
  errorMessage: v.union(v.string(), v.null()),
  durationMs: v.number(),
  createdAt: v.number(),
});

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
  const isAdmin = user.role === "director" || user.role === "admin";
  if (token.userId !== user._id && !isAdmin) {
    throw new Error("Você só pode gerenciar os seus próprios tokens");
  }
  return token;
}

/** Rejeita identidades vindas de um JWT de delegação com token de agente. */
async function requireHumanSession(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) rejectAgentTokenIdentity(identity);
}

async function ownerSummary(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email ?? null,
    username: user.username ?? null,
    role: user.role,
    isActive: user.isActive,
  };
}

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
    const now = Date.now();
    const tokens = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .collect();
    const active = tokens.filter((t) => isActiveToken(t, now));
    const inactive = tokens
      .filter((t) => !isActiveToken(t, now))
      .slice(0, MAX_TOKENS_PER_USER);
    return [...active, ...inactive]
      .sort((a, b) => b._creationTime - a._creationTime)
      .map(toPublicToken);
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
    const token = await getManageableToken(ctx, ctx.user, args.id);
    const name = normalizeName(args.name);
    await ctx.db.patch("agentTokens", token._id, { name });
    return toPublicToken({ ...token, name });
  },
});

/** Revoga um token. Vale imediatamente para toda conexão que o use. */
export const revoke = staffMutation({
  args: { id: v.id("agentTokens") },
  returns: publicTokenValidator,
  handler: async (ctx, args) => {
    const token = await getManageableToken(ctx, ctx.user, args.id);
    if (token.revokedAt !== undefined) return toPublicToken(token);
    const revokedAt = Date.now();
    await ctx.db.patch("agentTokens", token._id, { revokedAt });
    return toPublicToken({ ...token, revokedAt });
  },
});

/** Chamadas recentes feitas com os tokens do usuário atual. */
export const listMyCalls = staffQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(callValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(args.limit ?? DEFAULT_CALLS_LIMIT, 1),
      MAX_CALLS_LIMIT
    );
    const calls = await ctx.db
      .query("agentTokenCalls")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(limit);
    return await withTokenNames(ctx, calls);
  },
});

async function withTokenNames(ctx: QueryCtx, calls: Doc<"agentTokenCalls">[]) {
  const ids = [...new Set(calls.map((c) => c.tokenId))];
  const docs = await Promise.all(ids.map((id) => ctx.db.get("agentTokens", id)));
  const names = new Map(ids.map((id, i) => [id, docs[i]?.name ?? null]));
  return calls.map((c) => ({
    _id: c._id,
    tokenId: c.tokenId,
    tokenName: names.get(c.tokenId) ?? null,
    tool: c.tool,
    functionPath: c.functionPath ?? null,
    outcome: c.outcome,
    errorMessage: c.errorMessage ?? null,
    durationMs: c.durationMs,
    createdAt: c.createdAt,
  }));
}

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const claims = getAgentTokenClaims(identity);
    if (!claims) {
      throw new Error("Somente conexões com token de agente registram chamadas");
    }
    const tokenId = ctx.db.normalizeId("agentTokens", claims.tokenId);
    const token = tokenId ? await ctx.db.get("agentTokens", tokenId) : null;
    if (!token) throw new Error("Token não encontrado");

    await ctx.db.insert("agentTokenCalls", {
      tokenId: token._id,
      userId: token.userId,
      tool: args.tool.slice(0, 80),
      functionPath: args.functionPath?.slice(0, 160),
      outcome: args.outcome,
      errorMessage: args.errorMessage?.slice(0, MAX_CALL_ERROR_LENGTH),
      durationMs: Math.max(0, Math.round(args.durationMs)),
      createdAt: Date.now(),
    });
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
      owner: v.union(
        v.object({
          _id: v.id("users"),
          name: v.string(),
          email: v.union(v.string(), v.null()),
          username: v.union(v.string(), v.null()),
          role: v.string(),
          isActive: v.boolean(),
        }),
        v.null()
      ),
    })
  ),
  handler: async (ctx) => {
    // Equipe pequena e no máximo 25 tokens ativos por pessoa; paginar se crescer.
    const tokens = await ctx.db.query("agentTokens").order("desc").take(1000);
    const ownerIds = [...new Set(tokens.map((t) => t.userId))];
    const owners = new Map(
      await Promise.all(
        ownerIds.map(
          async (id) => [id, await ownerSummary(ctx, id)] as const
        )
      )
    );
    return tokens.map((t) => ({
      ...toPublicToken(t),
      owner: owners.get(t.userId) ?? null,
    }));
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
    const limit = Math.min(
      Math.max(args.limit ?? DEFAULT_CALLS_LIMIT, 1),
      MAX_CALLS_LIMIT
    );
    const tokenId = args.tokenId;
    const calls =
      tokenId !== undefined
        ? await ctx.db
            .query("agentTokenCalls")
            .withIndex("by_token", (q) => q.eq("tokenId", tokenId))
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("agentTokenCalls")
            .withIndex("by_createdAt")
            .order("desc")
            .take(limit);
    return await withTokenNames(ctx, calls);
  },
});

/** Desligamento: revoga todos os tokens ativos de um usuário. */
export const revokeAllForUser = adminMutation({
  args: { userId: v.id("users") },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireHumanSession(ctx);
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("Usuário não encontrado");
    const revokedAt = Date.now();
    let count = 0;
    // Todas as linhas do usuário: uma janela fixa deixaria tokens novos de
    // fora depois de muitos ciclos de criar/revogar.
    for await (const token of ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))) {
      if (token.revokedAt === undefined) {
        await ctx.db.patch("agentTokens", token._id, { revokedAt });
        count++;
      }
    }
    return count;
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
    // Herda a autenticação da action `create`; `requireUser` aplica a
    // política de tokens e `requireHumanSession` repete a regra da action.
    await requireHumanSession(ctx);
    const user = await requireUser(ctx);
    return await insertToken(ctx, user, args);
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
    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("Usuário não encontrado");
    return await insertToken(ctx, user, args);
  },
});

export const findUserByLogin = internalQuery({
  args: { login: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { login }) => {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", login))
      .first();
    if (byEmail) return byEmail._id;
    // Usuários só com username (sem email). Tabela pequena.
    const users = await ctx.db.query("users").take(1000);
    return users.find((u) => u.username === login)?._id ?? null;
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
  returns: v.union(
    v.object({
      token: v.object({
        _id: v.id("agentTokens"),
        name: v.string(),
        tokenPrefix: v.string(),
        permission: agentTokenPermission,
        expiresAt: v.union(v.number(), v.null()),
      }),
      user: v.object({
        _id: v.id("users"),
        clerkId: v.string(),
        name: v.string(),
        email: v.union(v.string(), v.null()),
        username: v.union(v.string(), v.null()),
        role: v.string(),
        department: v.union(v.string(), v.null()),
      }),
    }),
    v.null()
  ),
  handler: async (ctx, { tokenHash, now }) => {
    const token = await ctx.db
      .query("agentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!token || !isActiveToken(token, now)) return null;

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
        role: user.role,
        department: user.department ?? null,
      },
    };
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
    await ctx.db.insert("agentTokenCalls", {
      tokenId: args.tokenId,
      userId: args.userId,
      tool: `api:${args.route}`.slice(0, 80),
      functionPath: args.functionPath?.slice(0, 160),
      outcome: args.outcome,
      errorMessage: args.errorMessage?.slice(0, MAX_CALL_ERROR_LENGTH),
      durationMs: Math.max(0, Math.round(args.durationMs)),
      createdAt: args.createdAt,
    });
    return null;
  },
});

/** Registra uso, no máximo uma vez por minuto por token. */
export const touch = internalMutation({
  args: { id: v.id("agentTokens"), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, now }) => {
    const token = await ctx.db.get("agentTokens", id);
    if (!token) return null;
    if (
      token.lastUsedAt !== undefined &&
      now - token.lastUsedAt < LAST_USED_WRITE_INTERVAL_MS
    ) {
      return null;
    }
    await ctx.db.patch("agentTokens", id, { lastUsedAt: now });
    return null;
  },
});

/** Cron: apaga chamadas antigas em lotes, reagendando até terminar. */
export const purgeCalls = internalMutation({
  args: { olderThan: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff =
      args.olderThan ??
      Date.now() - AGENT_TOKEN_CALL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const batch = await ctx.db
      .query("agentTokenCalls")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(PURGE_BATCH_SIZE);
    for (const row of batch) {
      await ctx.db.delete("agentTokenCalls", row._id);
    }
    if (batch.length === PURGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.agentTokens.purgeCalls, {
        olderThan: cutoff,
      });
    }
    return batch.length;
  },
});
