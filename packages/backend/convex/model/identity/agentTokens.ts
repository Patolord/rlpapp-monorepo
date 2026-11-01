import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { AgentTokenPermission } from "../../lib/agentTokens";
import { assertStaff } from "../../lib/rbac";

/**
 * Gravação de tokens de agente, compartilhada pela página Agentes
 * (agentTokens.ts) e pelo login do app desktop (takeoffAuth.ts). A política de
 * uso dos tokens (revogação, somente leitura) fica em lib/agentTokens.ts.
 */

export const MAX_TOKENS_PER_USER = 25;
const MAX_NAME_LENGTH = 80;
const MAX_EXPIRES_IN_DAYS = 3650;

export function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Informe um nome para o token");
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
  }
  return trimmed;
}

export function computeExpiresAt(
  expiresInDays: number | undefined,
  now: number
): number | undefined {
  if (expiresInDays === undefined) return undefined;
  if (
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0 ||
    expiresInDays > MAX_EXPIRES_IN_DAYS
  ) {
    throw new Error(
      `A validade deve ser entre 1 e ${MAX_EXPIRES_IN_DAYS} dias`
    );
  }
  return now + Math.round(expiresInDays * 24 * 60 * 60 * 1000);
}

export function isActiveToken(token: Doc<"agentTokens">, now: number): boolean {
  return (
    token.revokedAt === undefined &&
    (token.expiresAt === undefined || token.expiresAt > now)
  );
}

/**
 * Grava um token novo para o usuário: criado à mão em /conta/agentes
 * (agentTokens.ts) ou emitido pelo login do RLP Takeoff (takeoffAuth.ts, com
 * `kind: "device"`). Aplica a política de criação: só roles internas, conta
 * vinculada ao Clerk e no máximo MAX_TOKENS_PER_USER tokens ativos.
 */
export async function insertToken(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    name: string;
    permission: AgentTokenPermission;
    expiresInDays?: number;
    tokenHash: string;
    tokenPrefix: string;
    kind?: "agent" | "device";
  }
) {
  assertStaff(user);
  if (!user.clerkId) {
    throw new Error(
      "Este usuário ainda não está vinculado a uma conta de login; entre no app antes de criar tokens"
    );
  }
  const name = normalizeName(args.name);
  const now = Date.now();
  const expiresAt = computeExpiresAt(args.expiresInDays, now);

  // Linhas revogadas nunca são apagadas, então percorre todas as do usuário
  // em vez de uma janela fixa (a mutation é atômica; não há corrida).
  let active = 0;
  for await (const token of ctx.db
    .query("agentTokens")
    .withIndex("by_user", (q) => q.eq("userId", user._id))) {
    if (isActiveToken(token, now)) active++;
  }
  if (active >= MAX_TOKENS_PER_USER) {
    throw new Error(
      `Limite de ${MAX_TOKENS_PER_USER} tokens ativos atingido. Revogue um token antes de criar outro`
    );
  }

  const id = await ctx.db.insert("agentTokens", {
    userId: user._id,
    name,
    tokenHash: args.tokenHash,
    tokenPrefix: args.tokenPrefix,
    permission: args.permission,
    createdAt: now,
    expiresAt,
    ...(args.kind === "device" ? { kind: "device" as const } : {}),
  });
  return { id, name, expiresAt };
}
