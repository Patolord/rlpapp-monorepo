import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getAgentTokenClaims } from "../../lib/agentTokens";
import { unauthenticated } from "../../lib/accessErrors";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Atividade dos tokens de agente (`agentTokenCalls`): chamadas do servidor MCP
 * e requisições da API HTTP `/api/v1`, listas e a limpeza do cron.
 */

/** Linhas de `agentTokenCalls` mais antigas que isto são apagadas pelo cron. */
export const AGENT_TOKEN_CALL_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 500;
const MAX_CALL_ERROR_LENGTH = 300;
const DEFAULT_CALLS_LIMIT = 50;
const MAX_CALLS_LIMIT = 200;

type CallOutcome = "success" | "error";

function clampCallsLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_CALLS_LIMIT, 1), MAX_CALLS_LIMIT);
}

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

/** Chamadas recentes feitas com os tokens do usuário. */
export async function listMyAgentTokenCalls(
  ctx: QueryCtx,
  user: Doc<"users">,
  input: { limit?: number }
) {
  const limit = clampCallsLimit(input.limit);
  const calls = await ctx.db
    .query("agentTokenCalls")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(limit);
  return await withTokenNames(ctx, calls);
}

/** Chamadas recentes de qualquer token (ou de um token específico). */
export async function listAllAgentTokenCalls(
  ctx: QueryCtx,
  input: { tokenId?: Id<"agentTokens">; limit?: number }
) {
  const limit = clampCallsLimit(input.limit);
  const tokenId = input.tokenId;
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
}

export type RecordAgentTokenCallInput = {
  tool: string;
  functionPath?: string;
  outcome: CallOutcome;
  errorMessage?: string;
  durationMs: number;
};

/**
 * Registra uma chamada de ferramenta do servidor MCP, sempre atribuída ao
 * token da claim do JWT de delegação: um usuário comum não forja atividade.
 */
export async function recordAgentTokenCall(
  ctx: MutationCtx,
  input: RecordAgentTokenCallInput
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw unauthenticated();
  const claims = getAgentTokenClaims(identity);
  if (!claims) {
    throw ruleViolation("Somente conexões com token de agente registram chamadas");
  }
  const tokenId = ctx.db.normalizeId("agentTokens", claims.tokenId);
  const token = tokenId ? await ctx.db.get("agentTokens", tokenId) : null;
  if (!token) throw notFound("Token não encontrado");

  await ctx.db.insert("agentTokenCalls", {
    tokenId: token._id,
    userId: token.userId,
    tool: input.tool.slice(0, 80),
    functionPath: input.functionPath?.slice(0, 160),
    outcome: input.outcome,
    errorMessage: input.errorMessage?.slice(0, MAX_CALL_ERROR_LENGTH),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    createdAt: Date.now(),
  });
}

export type RecordAgentApiRequestInput = {
  tokenId: Id<"agentTokens">;
  userId: Id<"users">;
  route: string;
  functionPath?: string;
  outcome: CallOutcome;
  errorMessage?: string;
  durationMs: number;
  createdAt: number;
};

/** Requisição da API HTTP já autenticada pelo gateway (`tool` = `api:<rota>`). */
export async function recordAgentApiRequest(
  ctx: MutationCtx,
  input: RecordAgentApiRequestInput
): Promise<void> {
  await ctx.db.insert("agentTokenCalls", {
    tokenId: input.tokenId,
    userId: input.userId,
    tool: `api:${input.route}`.slice(0, 80),
    functionPath: input.functionPath?.slice(0, 160),
    outcome: input.outcome,
    errorMessage: input.errorMessage?.slice(0, MAX_CALL_ERROR_LENGTH),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    createdAt: input.createdAt,
  });
}

/**
 * Apaga um lote de chamadas mais antigas que `olderThan` (padrão: o prazo de
 * retenção). `hasMore` diz se o lote veio cheio e a limpeza deve continuar.
 */
export async function purgeAgentTokenCallsBatch(
  ctx: MutationCtx,
  olderThan: number | undefined
): Promise<{ deleted: number; cutoff: number; hasMore: boolean }> {
  const cutoff =
    olderThan ??
    Date.now() - AGENT_TOKEN_CALL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const batch = await ctx.db
    .query("agentTokenCalls")
    .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
    .take(PURGE_BATCH_SIZE);
  for (const row of batch) {
    await ctx.db.delete("agentTokenCalls", row._id);
  }
  return {
    deleted: batch.length,
    cutoff,
    hasMore: batch.length === PURGE_BATCH_SIZE,
  };
}
