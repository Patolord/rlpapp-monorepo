import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { rejectAgentTokenIdentity } from "../../lib/agentTokens";
import { requirePermission, requireUser } from "../../lib/rbac";
import {
  TAKEOFF_AUTH_CODE_TTL_MS,
  deviceTokenName,
  isValidChallenge,
  isValidInstallationId,
  normalizeDeviceName,
} from "../../lib/takeoffAuth";
import { insertToken } from "./agentTokens";
import { ruleViolation } from "../../lib/domainErrors";
import { errorMessage } from "@rlpapp/shared/errors";

/**
 * Login do RLP Takeoff (desktop) com a conta da empresa: códigos de uso único
 * e tokens de dispositivo, por trás de `convex/takeoffAuth.ts`. As primitivas
 * criptográficas e o fluxo completo estão em lib/takeoffAuth.ts; as rotas
 * HTTP, em gateway/takeoffAuth.ts.
 */

/** Códigos ainda não trocados de um usuário; acima disso os mais antigos saem. */
const MAX_PENDING_CODES_PER_USER = 5;

async function requireHumanStaff(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) rejectAgentTokenIdentity(identity);
  const user = await requireUser(ctx);
  // Acesso "App Takeoff" (takeoff.use); publicar orçamento ainda exige engenharia.write.
  requirePermission(user, "takeoff.use");
  if (!user.clerkId) {
    throw ruleViolation(
      "Este usuário ainda não está vinculado a uma conta de login; entre no app antes de conectar o Takeoff"
    );
  }
  return user;
}

/** Confere o desafio PKCE e o id da instalação enviados pelo app. */
export function assertCodeRequest(input: { challenge: string; installationId?: string }): void {
  if (!isValidChallenge(input.challenge)) {
    throw ruleViolation("Desafio PKCE inválido");
  }
  if (input.installationId !== undefined && !isValidInstallationId(input.installationId)) {
    throw ruleViolation("Id da instalação inválido");
  }
}

/**
 * Grava o código (só o hash) do usuário autenticado, apagando os vencidos e
 * limitando os pendentes. Devolve quando ele expira.
 */
export async function insertAuthCode(
  ctx: MutationCtx,
  input: { codeHash: string; challenge: string; device: string; installationId?: string }
): Promise<number> {
  const user = await requireHumanStaff(ctx);
  assertCodeRequest(input);
  const now = Date.now();

  // Limpa os códigos vencidos do usuário e limita os pendentes.
  const pending = await ctx.db
    .query("takeoffAuthCodes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const alive = pending
    .filter((row) => row.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
  const keep = new Set(
    alive.slice(0, MAX_PENDING_CODES_PER_USER - 1).map((row) => row._id)
  );
  for (const row of pending) {
    if (!keep.has(row._id)) await ctx.db.delete("takeoffAuthCodes", row._id);
  }

  const expiresAt = now + TAKEOFF_AUTH_CODE_TTL_MS;
  await ctx.db.insert("takeoffAuthCodes", {
    userId: user._id,
    codeHash: input.codeHash,
    codeChallenge: input.challenge,
    device: normalizeDeviceName(input.device),
    installationId: input.installationId,
    createdAt: now,
    expiresAt,
  });
  return expiresAt;
}

/**
 * Tokens de dispositivo ativos da mesma instalação. Tokens sem
 * `installationId` (emitidos antes dele existir) ficam como estão: revogue
 * em /conta/agentes se não forem mais usados.
 */
async function revokeInstallationTokens(
  ctx: MutationCtx,
  userId: Id<"users">,
  installationId: string,
  now: number
): Promise<void> {
  for await (const token of ctx.db
    .query("agentTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (
      token.kind === "device" &&
      token.installationId === installationId &&
      token.revokedAt === undefined
    ) {
      await ctx.db.patch("agentTokens", token._id, { revokedAt: now });
    }
  }
}

export type RedeemAuthCodeResult =
  | {
      ok: true;
      tokenId: Id<"agentTokens">;
      user: { clerkId: string; name: string; email: string | null };
    }
  | { ok: false; reason: "invalid" | "expired" | "limit"; message: string };

/**
 * Troca um código por um token de dispositivo. O código é apagado em qualquer
 * tentativa (certa ou errada); um novo login da mesma instalação revoga o
 * token anterior dela.
 */
export async function redeemAuthCode(
  ctx: MutationCtx,
  input: {
    codeHash: string;
    challenge: string;
    tokenHash: string;
    tokenPrefix: string;
    now: number;
  }
): Promise<RedeemAuthCodeResult> {
  const invalid = {
    ok: false as const,
    reason: "invalid" as const,
    message: "Código inválido ou já usado. Tente entrar de novo.",
  };
  const row = await ctx.db
    .query("takeoffAuthCodes")
    .withIndex("by_codeHash", (q) => q.eq("codeHash", input.codeHash))
    .unique();
  if (!row) return invalid;
  await ctx.db.delete("takeoffAuthCodes", row._id);

  if (row.expiresAt <= input.now) {
    return {
      ok: false as const,
      reason: "expired" as const,
      message: "O código expirou. Tente entrar de novo.",
    };
  }
  if (row.codeChallenge !== input.challenge) return invalid;

  const user = await ctx.db.get("users", row.userId);
  if (!user || !user.isActive || !user.clerkId) return invalid;

  if (row.installationId) {
    await revokeInstallationTokens(ctx, user._id, row.installationId, input.now);
  }
  let created: { id: Id<"agentTokens"> };
  try {
    created = await insertToken(ctx, user, {
      name: deviceTokenName(row.device),
      permission: "full_access",
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      kind: "device",
      installationId: row.installationId,
    });
  } catch (error) {
    // Limite de tokens ativos ou usuário sem role interna: nada foi gravado
    // além da baixa do código, que deve valer mesmo assim.
    return {
      ok: false as const,
      reason: "limit" as const,
      message: errorMessage(error, "Falha ao criar o token"),
    };
  }
  return {
    ok: true as const,
    tokenId: created.id,
    user: { clerkId: user.clerkId, name: user.name, email: user.email ?? null },
  };
}

/**
 * "Sair" no app: o próprio token de dispositivo se revoga. Só tokens
 * `kind: "device"`; um token vazado pode no máximo desligar a si mesmo.
 */
export async function revokeDeviceToken(
  ctx: MutationCtx,
  input: { tokenHash: string; now: number }
): Promise<boolean> {
  const token = await ctx.db
    .query("agentTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", input.tokenHash))
    .unique();
  if (!token || token.kind !== "device") return false;
  if (token.revokedAt === undefined) {
    await ctx.db.patch("agentTokens", token._id, { revokedAt: input.now });
  }
  return true;
}
