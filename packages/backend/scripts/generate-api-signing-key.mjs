#!/usr/bin/env node
/**
 * Gera a chave ES256 (P-256) que assina os JWTs da API HTTP (/api/v1).
 *
 * Uso (em packages/backend):
 *   node scripts/generate-api-signing-key.mjs
 *
 * Depois guarde o JWK privado impresso no deployment:
 *   npx convex env set API_JWT_PRIVATE_KEY '<json>'          # dev
 *   npx convex env set --prod API_JWT_PRIVATE_KEY '<json>'   # produção
 *
 * A metade pública é derivada em tempo de execução e servida em
 * https://<deployment>.convex.site/.well-known/jwks.json — nada mais a
 * configurar. Para rotacionar, gere outra chave e defina a variável de novo;
 * JWTs pendentes (no máximo 1 h) deixam de valer na hora.
 */
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

const keyPair = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const jwk = await subtle.exportKey("jwk", keyPair.privateKey);

// Um kid curto e aleatório para o JWKS poder conter várias chaves na rotação.
const kid = Buffer.from(webcrypto.getRandomValues(new Uint8Array(6))).toString(
  "hex"
);

const privateJwk = JSON.stringify({
  kty: jwk.kty,
  crv: jwk.crv,
  x: jwk.x,
  y: jwk.y,
  d: jwk.d,
  kid,
});

console.log("Chave privada de assinatura (mantenha em segredo). Defina com:\n");
console.log(`  npx convex env set API_JWT_PRIVATE_KEY '${privateJwk}'\n`);
console.log(`Key id: ${kid}`);
