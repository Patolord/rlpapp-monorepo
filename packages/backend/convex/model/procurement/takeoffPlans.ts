// ---------------------------------------------------------------------------
// Plantas (PDF) do RLP Takeoff no Cloudflare R2
// ---------------------------------------------------------------------------
//
// Um arquivo `.takeoff.json` referencia cada planta pelo caminho local e pelo
// SHA-256 do PDF. O caminho só vale na máquina onde a planta foi adicionada; o
// hash vale em qualquer lugar, então é ele a chave do objeto no bucket. Duas
// obras com a mesma planta guardam um objeto só, e o app nunca precisa saber
// onde a cópia está: pede a URL pelo hash e baixa.
//
// Os bytes nunca passam pelo Convex: o app faz PUT/GET direto no R2 com URLs
// assinadas de curta duração emitidas por `http.ts`. As funções aqui são puras
// (validação e chaves) para serem testadas sem bucket.

/** Prefixo dos objetos no bucket; o resto da chave é o SHA-256 em hex. */
export const PLAN_KEY_PREFIX = "takeoff/plans/";

/** Tamanho máximo aceito para uma planta (200 MB). */
export const MAX_PLAN_BYTES = 200 * 1024 * 1024;

export const MAX_PLAN_NAME_LENGTH = 200;

/** Validade da URL de download assinada (1 h: o app baixa logo que recebe). */
export const PLAN_URL_TTL_SECONDS = 60 * 60;

/** Validade da URL de upload assinada (só precisa valer quando o PUT começa). */
export const PLAN_UPLOAD_URL_TTL_SECONDS = 15 * 60;

export const PLAN_CONTENT_TYPE = "application/pdf";

/**
 * Cabeçalhos que o app precisa mandar no PUT, tal como a assinatura os cobre.
 * `If-None-Match: *` torna o PUT "só cria": o R2 avalia a condição de forma
 * atômica e responde 412 quando já existe objeto nessa chave, então uma URL
 * emitida antes nunca substitui uma planta já guardada, mesmo numa corrida
 * entre dois uploads do mesmo hash.
 */
export const PLAN_UPLOAD_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": PLAN_CONTENT_TYPE,
  "If-None-Match": "*",
};

const HASH_RE = /^[0-9a-f]{64}$/;

/** Chave do objeto no R2 para uma planta com este SHA-256. */
export function planKey(hash: string): string {
  return `${PLAN_KEY_PREFIX}${hash}.pdf`;
}

/** SHA-256 em hex minúsculo (64 caracteres), ou null quando não é um. */
export function parsePlanHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  return HASH_RE.test(hash) ? hash : null;
}

export type PlanUploadRequest = {
  hash: string;
  size: number;
  name: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Corpo de `POST /takeoff/plans/upload-url`. */
export function parsePlanUploadRequest(
  body: unknown
): ParseResult<PlanUploadRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;
  const hash = parsePlanHash(o.hash);
  if (!hash) return { ok: false, error: '"hash" must be a SHA-256 hex string' };
  const size = o.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    return { ok: false, error: '"size" must be a positive integer (bytes)' };
  }
  if (size > MAX_PLAN_BYTES) {
    return { ok: false, error: `"size" exceeds the ${MAX_PLAN_BYTES} byte limit` };
  }
  const rawName = typeof o.name === "string" ? o.name.trim() : "";
  const name = rawName.slice(0, MAX_PLAN_NAME_LENGTH) || `${hash}.pdf`;
  return { ok: true, value: { hash, size, name } };
}

export type PlanUploadedRequest = {
  hash: string;
  /** Bytes the app sent; compared with what landed in the bucket when given. */
  size?: number;
};

/** Corpo de `POST /takeoff/plans/uploaded`. */
export function parsePlanUploadedRequest(
  body: unknown
): ParseResult<PlanUploadedRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;
  const hash = parsePlanHash(o.hash);
  if (!hash) return { ok: false, error: '"hash" must be a SHA-256 hex string' };
  if (o.size === undefined) return { ok: true, value: { hash } };
  if (typeof o.size !== "number" || !Number.isInteger(o.size) || o.size <= 0) {
    return { ok: false, error: '"size" must be a positive integer (bytes)' };
  }
  return { ok: true, value: { hash, size: o.size } };
}

export const PLANS_PATH_PREFIX = "/takeoff/plans/";

/** Hash de `GET /takeoff/plans/<hash>/url`, ou null para qualquer outro caminho. */
export function planHashFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PLANS_PATH_PREFIX)) return null;
  const parts = pathname.slice(PLANS_PATH_PREFIX.length).split("/");
  if (parts.length !== 2 || parts[1] !== "url") return null;
  return parsePlanHash(parts[0]);
}
