import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { rejectAgentTokenIdentity } from "./lib/agentTokens";
import { assertStaff, requireUser } from "./lib/rbac";
import { insertToken } from "./model/identity/agentTokens";
import {
  TAKEOFF_AUTH_CODE_TTL_MS,
  deviceTokenName,
  generateAuthCode,
  hashAuthCode,
  isValidChallenge,
  isValidInstallationId,
  normalizeDeviceName,
} from "./lib/takeoffAuth";

/**
 * Login do RLP Takeoff (desktop) com a conta da empresa. Ver lib/takeoffAuth.ts
 * para o fluxo completo e gateway/takeoffAuth.ts para as rotas HTTP.
 */

/** Códigos ainda não trocados de um usuário; acima disso os mais antigos saem. */
const MAX_PENDING_CODES_PER_USER = 5;

const redeemResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    tokenId: v.id("agentTokens"),
    user: v.object({
      clerkId: v.string(),
      name: v.string(),
      email: v.union(v.string(), v.null()),
    }),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("invalid"),
      v.literal("expired"),
      v.literal("limit")
    ),
    message: v.string(),
  })
);

async function requireHumanStaff(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) rejectAgentTokenIdentity(identity);
  const user = await requireUser(ctx);
  assertStaff(user);
  if (!user.clerkId) {
    throw new Error(
      "Este usuário ainda não está vinculado a uma conta de login; entre no app antes de conectar o Takeoff"
    );
  }
  return user;
}

// ===========================================================================
// PÚBLICO — chamado pela página /takeoff/conectar (sessão Clerk)
// ===========================================================================

/**
 * Emite o código de uso único que a página web entrega ao app desktop pelo
 * redirecionamento para 127.0.0.1. O texto puro só existe nesta resposta.
 *
 * É uma action porque o código precisa de aleatoriedade criptográfica e do
 * hash via WebCrypto; a gravação acontece numa mutation interna que resolve o
 * usuário pela autenticação herdada.
 */
export const createCode = action({
  args: {
    /** Desafio PKCE S256 gerado pelo app (base64url, 43 caracteres). */
    challenge: v.string(),
    /** Nome do computador, como o app informou (só rótulo). */
    device: v.string(),
    /**
     * Id aleatório da instalação do app, gerado uma vez e guardado nela: um
     * novo login da mesma instalação substitui o token anterior dela.
     */
    installationId: v.optional(v.string()),
  },
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    // Um token (inclusive de dispositivo) não pode emitir outro.
    rejectAgentTokenIdentity(identity);
    if (!isValidChallenge(args.challenge)) {
      throw new Error("Desafio PKCE inválido");
    }
    if (args.installationId !== undefined && !isValidInstallationId(args.installationId)) {
      throw new Error("Id da instalação inválido");
    }
    const code = generateAuthCode();
    const expiresAt: number = await ctx.runMutation(
      internal.takeoffAuth.insertCode,
      {
        codeHash: await hashAuthCode(code),
        challenge: args.challenge,
        device: args.device,
        installationId: args.installationId,
      }
    );
    return { code, expiresAt };
  },
});

// ===========================================================================
// INTERNO
// ===========================================================================

export const insertCode = internalMutation({
  args: {
    codeHash: v.string(),
    challenge: v.string(),
    device: v.string(),
    installationId: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireHumanStaff(ctx);
    if (!isValidChallenge(args.challenge)) {
      throw new Error("Desafio PKCE inválido");
    }
    if (args.installationId !== undefined && !isValidInstallationId(args.installationId)) {
      throw new Error("Id da instalação inválido");
    }
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
      codeHash: args.codeHash,
      codeChallenge: args.challenge,
      device: normalizeDeviceName(args.device),
      installationId: args.installationId,
      createdAt: now,
      expiresAt,
    });
    return expiresAt;
  },
});

/**
 * Troca um código por um token de dispositivo, numa transação: o código é
 * apagado em qualquer tentativa (certa ou errada), então só vale uma vez. Um
 * novo login da mesma instalação do app revoga o token anterior dela (pelo
 * `installationId`, nunca pelo nome do computador, que pode repetir).
 *
 * Recebe o hash do código, o desafio recalculado a partir do verificador e o
 * hash do token novo, todos calculados na HTTP action (WebCrypto).
 */
export const redeemCode = internalMutation({
  args: {
    codeHash: v.string(),
    challenge: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    now: v.number(),
  },
  returns: redeemResultValidator,
  handler: async (ctx, args) => {
    const invalid = {
      ok: false as const,
      reason: "invalid" as const,
      message: "Código inválido ou já usado. Tente entrar de novo.",
    };
    const row = await ctx.db
      .query("takeoffAuthCodes")
      .withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (!row) return invalid;
    await ctx.db.delete("takeoffAuthCodes", row._id);

    if (row.expiresAt <= args.now) {
      return {
        ok: false as const,
        reason: "expired" as const,
        message: "O código expirou. Tente entrar de novo.",
      };
    }
    if (row.codeChallenge !== args.challenge) return invalid;

    const user = await ctx.db.get("users", row.userId);
    if (!user || !user.isActive || !user.clerkId) return invalid;

    if (row.installationId) {
      await revokeInstallationTokens(ctx, user._id, row.installationId, args.now);
    }
    let created: { id: Id<"agentTokens"> };
    try {
      created = await insertToken(ctx, user, {
        name: deviceTokenName(row.device),
        permission: "full_access",
        tokenHash: args.tokenHash,
        tokenPrefix: args.tokenPrefix,
        kind: "device",
        installationId: row.installationId,
      });
    } catch (error) {
      // Limite de tokens ativos ou usuário sem role interna: nada foi gravado
      // além da baixa do código, que deve valer mesmo assim.
      return {
        ok: false as const,
        reason: "limit" as const,
        message: error instanceof Error ? error.message : "Falha ao criar o token",
      };
    }
    return {
      ok: true as const,
      tokenId: created.id,
      user: { clerkId: user.clerkId, name: user.name, email: user.email ?? null },
    };
  },
});

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

/**
 * "Sair" no app: o próprio token de dispositivo se revoga. Só tokens
 * `kind: "device"`; um token vazado pode no máximo desligar a si mesmo.
 */
export const revokeDevice = internalMutation({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("agentTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token || token.kind !== "device") return false;
    if (token.revokedAt === undefined) {
      await ctx.db.patch("agentTokens", token._id, { revokedAt: args.now });
    }
    return true;
  },
});
