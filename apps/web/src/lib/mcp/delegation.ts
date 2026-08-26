import { importPKCS8, SignJWT, type CryptoKey, type KeyObject } from "jose";

import {
  CONVEX_JWT_AUDIENCE,
  DELEGATION_TTL_SECONDS,
} from "./constants";

export type DelegationConfig = {
  issuer: string;
  privateKeyPem: string;
  audience?: string;
  ttlSeconds?: number;
  kid?: string;
};

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n");
}

const keyCache = new Map<string, CryptoKey | KeyObject>();

async function importDelegationKey(
  privateKeyPem: string
): Promise<CryptoKey | KeyObject> {
  const pem = normalizePem(privateKeyPem);
  const cached = keyCache.get(pem);
  if (cached) return cached;
  const key = await importPKCS8(pem, "RS256");
  keyCache.set(pem, key);
  return key;
}

export async function signDelegationJwt(
  subject: string,
  config: DelegationConfig,
  now = Date.now()
): Promise<string> {
  if (!subject.trim()) {
    throw new Error("Delegation subject is required");
  }

  const key = await importDelegationKey(config.privateKeyPem);
  const issuedAt = Math.floor(now / 1000);
  const ttl = config.ttlSeconds ?? DELEGATION_TTL_SECONDS;

  return await new SignJWT({})
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      kid: config.kid ?? "mcp-delegation",
    })
    .setIssuer(config.issuer)
    .setAudience(config.audience ?? CONVEX_JWT_AUDIENCE)
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttl)
    .sign(key);
}
