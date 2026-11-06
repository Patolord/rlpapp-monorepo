import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { rejectAgentTokenIdentity } from "./lib/agentTokens";
import { generateAuthCode, hashAuthCode } from "./lib/takeoffAuth";
import {
  assertCodeRequest,
  insertAuthCode,
  redeemAuthCode,
  revokeDeviceToken,
} from "./model/identity/takeoffDeviceAuth";

/**
 * Login do RLP Takeoff (desktop) com a conta da empresa. Ver lib/takeoffAuth.ts
 * para o fluxo completo e gateway/takeoffAuth.ts para as rotas HTTP.
 */

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
    assertCodeRequest(args);
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
  handler: async (ctx, args) => await insertAuthCode(ctx, args),
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
  handler: async (ctx, args) => await redeemAuthCode(ctx, args),
});

/**
 * "Sair" no app: o próprio token de dispositivo se revoga. Só tokens
 * `kind: "device"`; um token vazado pode no máximo desligar a si mesmo.
 */
export const revokeDevice = internalMutation({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => await revokeDeviceToken(ctx, args),
});
