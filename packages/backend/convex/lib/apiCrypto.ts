/**
 * Assinatura dos JWTs da API HTTP (`/api/v1`, ver docs/API.md).
 *
 * Tudo aqui roda em WebCrypto, então funciona no runtime padrão do Convex
 * (HTTP actions) sem "use node".
 *
 * O gateway troca um token de agente (`rlp_…`, lib/agentTokens.ts) por um JWT
 * ES256 curto assinado com a chave P-256 guardada na variável
 * `API_JWT_PRIVATE_KEY` (um JWK privado; ver
 * scripts/generate-api-signing-key.mjs). O Convex valida esses JWTs pelo
 * provider `customJwt` em auth.config.ts, buscando a metade pública em
 * `/.well-known/jwks.json` do próprio deployment.
 */

import type { AgentTokenPermission } from "./agentTokens";

export const API_TOKEN_AUDIENCE = "convex";
/** Vida útil padrão de um JWT trocado. Curta: o token de agente é a credencial longa. */
export const API_TOKEN_TTL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Codificação
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

// ---------------------------------------------------------------------------
// Emissor
// ---------------------------------------------------------------------------

/**
 * `iss` dos JWTs da API. Precisa bater com `issuer` em auth.config.ts, por
 * isso ambos leem a mesma variável (CONVEX_SITE_URL, definida pelo Convex).
 */
export function getApiTokenIssuer(): string {
  const issuer = process.env.CONVEX_SITE_URL;
  if (!issuer) {
    throw new Error("CONVEX_SITE_URL is not set");
  }
  return issuer.replace(/\/+$/, "");
}

interface EcPrivateJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d: string;
  kid?: string;
}

/** JWK público como servido no JWKS. */
export interface EcPublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
}

let cachedPrivateJwk: { raw: string; jwk: EcPrivateJwk } | null = null;

function getPrivateJwk(): EcPrivateJwk {
  const raw = process.env.API_JWT_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "API_JWT_PRIVATE_KEY is not set. Generate one with `node scripts/generate-api-signing-key.mjs` and set it with `npx convex env set`."
    );
  }
  if (cachedPrivateJwk && cachedPrivateJwk.raw === raw) return cachedPrivateJwk.jwk;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("API_JWT_PRIVATE_KEY must be a JSON Web Key (JWK) object");
  }
  const jwk = parsed as Partial<EcPrivateJwk>;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || !jwk.d) {
    throw new Error(
      "API_JWT_PRIVATE_KEY must be an EC P-256 private JWK (kty, crv, x, y, d)"
    );
  }
  cachedPrivateJwk = { raw, jwk: jwk as EcPrivateJwk };
  cachedSigningKey = null;
  return cachedPrivateJwk.jwk;
}

export function isApiTokenSigningConfigured(): boolean {
  return Boolean(process.env.API_JWT_PRIVATE_KEY);
}

/** `kid` anunciado no JWKS e no header de cada JWT. */
function getKeyId(jwk: EcPrivateJwk): string {
  // Sem `kid`, usa uma impressão das coordenadas públicas: uma chave nova
  // sempre produz um kid novo, mesmo que o operador esqueça de definir um.
  return jwk.kid ?? `${jwk.x.slice(0, 8)}${jwk.y.slice(0, 8)}`;
}

/**
 * JWKS público servido em `/.well-known/jwks.json`. Derivado da chave privada
 * descartando o escalar secreto `d`, para haver uma única fonte de verdade.
 */
export function getPublicJwks(): { keys: EcPublicJwk[] } {
  const jwk = getPrivateJwk();
  return {
    keys: [
      {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
        kid: getKeyId(jwk),
        alg: "ES256",
        use: "sig",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

export interface ApiTokenClaims {
  /** clerkId do dono do token: o que toda função lê como `identity.subject`. */
  subject: string;
  email?: string;
  agentTokenId: string;
  permission: AgentTokenPermission;
  /** Expiração absoluta em segundos (epoch). */
  expiresAt: number;
  issuedAt: number;
}

let cachedSigningKey: Promise<CryptoKey> | null = null;

function getSigningKey(jwk: EcPrivateJwk): Promise<CryptoKey> {
  if (!cachedSigningKey) {
    cachedSigningKey = crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }
  return cachedSigningKey;
}

/**
 * Emite um JWT ES256 que o Convex aceita pelo provider `customJwt`.
 *
 * As claims customizadas ficam aninhadas em `agent_token` e chegam ao Convex
 * achatadas como `identity["agent_token.id"]` /
 * `identity["agent_token.permission"]`, as mesmas que o `/mcp` do app web
 * usa, então a política de lib/agentTokens.ts vale para os dois caminhos.
 */
export async function signApiToken(claims: ApiTokenClaims): Promise<string> {
  const jwk = getPrivateJwk();
  const header = { alg: "ES256", typ: "JWT", kid: getKeyId(jwk) };
  const payload = {
    iss: getApiTokenIssuer(),
    aud: API_TOKEN_AUDIENCE,
    sub: claims.subject,
    iat: claims.issuedAt,
    exp: claims.expiresAt,
    ...(claims.email ? { email: claims.email } : {}),
    agent_token: { id: claims.agentTokenId, permission: claims.permission },
  };

  const signingInput = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(
    JSON.stringify(payload)
  )}`;
  const key = await getSigningKey(jwk);
  // ECDSA no WebCrypto devolve r||s cru, exatamente o formato JOSE do ES256.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}
