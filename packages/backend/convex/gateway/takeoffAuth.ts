import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import {
  generateAgentToken,
  hashAgentToken,
  looksLikeAgentToken,
} from "../lib/agentTokens";
import {
  API_TOKEN_TTL_SECONDS,
  isApiTokenSigningConfigured,
  signApiToken,
} from "../lib/apiCrypto";
import {
  hashAuthCode,
  isValidAuthCode,
  isValidVerifier,
  pkceChallengeFromVerifier,
} from "../lib/takeoffAuth";

/**
 * Rotas HTTP do login do RLP Takeoff (desktop). O app chama estas rotas pelo
 * proxy HTTP em Rust, então não há CORS. Ver lib/takeoffAuth.ts para o fluxo.
 *
 *   POST /takeoff/auth/exchange  { code, verifier }
 *        → { token, tokenPrefix, jwt, jwtExpiresAt, user }
 *   POST /takeoff/auth/revoke    Authorization: Bearer rlp_… (token do dispositivo)
 *        → { revoked }
 *
 * O JWT é o mesmo da API `/api/v1` (assinado por este deployment, `sub` =
 * clerkId do dono); depois o app o renova em `POST /api/v1/auth/token` com o
 * token do dispositivo.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function oauthError(error: string, message: string, status = 400): Response {
  return json({ error, message }, status);
}

const exchange = httpAction(async (ctx, request) => {
  // Antes de gastar o código: sem chave de assinatura o app não teria JWT.
  if (!isApiTokenSigningConfigured()) {
    return oauthError(
      "not_configured",
      "Login do Takeoff indisponível: API_JWT_PRIVATE_KEY não configurada no servidor",
      503
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "O corpo deve ser JSON");
  }
  const { code, verifier } = (body ?? {}) as Record<string, unknown>;
  if (typeof code !== "string" || !isValidAuthCode(code)) {
    return oauthError("invalid_request", "Código ausente ou malformado");
  }
  if (typeof verifier !== "string" || !isValidVerifier(verifier)) {
    return oauthError("invalid_request", "Verificador PKCE ausente ou malformado");
  }

  const now = Date.now();
  const { token, tokenPrefix } = generateAgentToken();
  const result = await ctx.runMutation(internal.takeoffAuth.redeemCode, {
    codeHash: await hashAuthCode(code),
    challenge: await pkceChallengeFromVerifier(verifier),
    tokenHash: await hashAgentToken(token),
    tokenPrefix,
    now,
  });
  if (!result.ok) {
    console.log(JSON.stringify({ event: "takeoff_login", outcome: result.reason }));
    return oauthError(result.reason === "limit" ? "limit" : "invalid_grant", result.message);
  }

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + API_TOKEN_TTL_SECONDS;
  const jwt = await signApiToken({
    subject: result.user.clerkId,
    email: result.user.email ?? undefined,
    agentTokenId: result.tokenId,
    permission: "full_access",
    issuedAt,
    expiresAt,
  });
  console.log(
    JSON.stringify({ event: "takeoff_login", outcome: "ok", tokenId: result.tokenId })
  );
  return json({
    token,
    tokenPrefix,
    jwt,
    jwtExpiresAt: expiresAt * 1000,
    user: { name: result.user.name, email: result.user.email },
  });
});

const revoke = httpAction(async (ctx, request) => {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization")?.trim() ?? "");
  const presented = match?.[1]?.trim();
  if (!presented || !looksLikeAgentToken(presented)) {
    return oauthError("invalid_request", "Envie o token do dispositivo", 401);
  }
  const revoked = await ctx.runMutation(internal.takeoffAuth.revokeDevice, {
    tokenHash: await hashAgentToken(presented),
    now: Date.now(),
  });
  return json({ revoked });
});

export function registerTakeoffAuthRoutes(http: HttpRouter): void {
  http.route({ path: "/takeoff/auth/exchange", method: "POST", handler: exchange });
  http.route({ path: "/takeoff/auth/revoke", method: "POST", handler: revoke });
}
