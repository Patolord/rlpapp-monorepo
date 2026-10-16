/**
 * Proxy das fotos de marcação do RHID: só busca imagens HTTPS em hosts
 * conhecidos e com tamanho limitado, para que o endpoint não vire um proxy
 * aberto (SSRF) nem segure respostas gigantes em memória.
 */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_FETCH_TIMEOUT_MS = 15_000;
export const PHOTO_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const DEFAULT_PHOTO_HOST = "rhid.com.br";

export class PhotoTooLargeError extends Error {
  constructor() {
    super("Photo too large");
    this.name = "PhotoTooLargeError";
  }
}

/** `configuredHosts`: lista separada por vírgula (env `RHID_MEDIA_ALLOWED_HOSTS`). */
export function isAllowedPhotoUrl(value: string, configuredHosts = ""): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase();
  if (host === DEFAULT_PHOTO_HOST || host.endsWith(`.${DEFAULT_PHOTO_HOST}`)) {
    return true;
  }
  return configuredHosts
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(host);
}

/** Lê o corpo em stream e aborta assim que passar de `maxBytes`. */
export async function readPhotoBody(
  response: Response,
  maxBytes = MAX_PHOTO_BYTES
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    throw new PhotoTooLargeError();
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PhotoTooLargeError();
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function photoMimeType(response: Response): string | null {
  const mime =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  return PHOTO_IMAGE_TYPES.has(mime) ? mime : null;
}
