/**
 * Login do RLP Takeoff (app desktop) com a conta da empresa.
 *
 * Fluxo (OAuth "authorization code" com PKCE, sem cliente registrado):
 *   1. o app abre um listener em 127.0.0.1:<porta>, gera `state` e um par
 *      verificador/desafio PKCE (S256) e abre o navegador em
 *      `<web>/takeoff/conectar?port&state&challenge&device`;
 *   2. a página (logada no Clerk) chama `takeoffAuth.createCode`, que grava o
 *      hash de um código de uso único (TTL curto) ligado ao usuário e ao
 *      desafio, e redireciona para `http://127.0.0.1:<porta>/callback`;
 *   3. o app troca `{ code, verifier }` em `POST /takeoff/auth/exchange` por um
 *      token de dispositivo (`rlp_…`, um token de agente com
 *      `kind: "device"`, listado e revogável em /conta/agentes) e um primeiro
 *      JWT; depois renova o JWT em `POST /api/v1/auth/token`.
 *
 * Este módulo tem só as partes puras (codificação, validação, PKCE), para
 * serem testadas sem banco. WebCrypto: roda em actions e HTTP actions.
 */

/** Vida útil de um código emitido pela página web. */
export const TAKEOFF_AUTH_CODE_TTL_MS = 2 * 60 * 1000;
export const MAX_DEVICE_NAME_LENGTH = 60;
export const DEFAULT_DEVICE_NAME = "computador";
/** Prefixo do nome dos tokens de dispositivo na lista de /conta/agentes. */
export const DEVICE_TOKEN_NAME_PREFIX = "Takeoff · ";

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// RFC 7636 §4.1: 43 a 128 caracteres do conjunto "unreserved".
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
// Id aleatório gerado uma vez por instalação do app (base64url).
const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

/** Código de uso único: 256 bits aleatórios em base64url (43 caracteres). */
export function generateAuthCode(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  return bytesToBase64Url(random);
}

/** O banco guarda só isto; o código em texto puro passa uma vez pelo navegador. */
export async function hashAuthCode(code: string): Promise<string> {
  return bytesToHex(await sha256(code));
}

/** Desafio PKCE S256: base64url(SHA-256(verificador)). */
export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  return bytesToBase64Url(await sha256(verifier));
}

export const isValidChallenge = (value: string): boolean => CHALLENGE_PATTERN.test(value);
export const isValidVerifier = (value: string): boolean => VERIFIER_PATTERN.test(value);
export const isValidAuthCode = (value: string): boolean => CODE_PATTERN.test(value);
export const isValidInstallationId = (value: string): boolean =>
  INSTALLATION_ID_PATTERN.test(value);

/**
 * Nome do computador como o app informa (vem da URL, então é texto livre):
 * sem caracteres de controle, espaços colapsados, tamanho limitado.
 */
export function normalizeDeviceName(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DEVICE_NAME_LENGTH)
    .trim();
  return cleaned || DEFAULT_DEVICE_NAME;
}

export const deviceTokenName = (device: string): string =>
  `${DEVICE_TOKEN_NAME_PREFIX}${normalizeDeviceName(device)}`;
