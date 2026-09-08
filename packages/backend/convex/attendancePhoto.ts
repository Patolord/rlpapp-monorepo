import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function isAllowedPhotoUrl(value: string, configuredHosts = ""): boolean {
  try {
    const url = new URL(value);
    const hosts = new Set(["rhid.com.br", "www.rhid.com.br", ...configuredHosts.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean)]);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function readPhotoBody(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > MAX_PHOTO_BYTES) throw new Error("Photo too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing photo");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PHOTO_BYTES) throw new Error("Photo too large");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function responseHeaders(request: Request): Headers | null {
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
  const origin = request.headers.get("Origin");
  if (origin) {
    if (origin !== env.RHID_WEB_ORIGIN) return null;
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization");
  }
  return headers;
}

export const photoOptions = httpAction(async (_ctx, request) => {
  const headers = responseHeaders(request);
  return new Response(null, { status: headers ? 204 : 403, headers: headers ?? { "Cache-Control": "no-store" } });
});

export const photo = httpAction(async (ctx, request) => {
  const headers = responseHeaders(request);
  if (!headers) return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!await ctx.auth.getUserIdentity()) return new Response(null, { status: 401, headers });
  const punchId = new URL(request.url).searchParams.get("punchId");
  if (!punchId) return new Response(null, { status: 400, headers });
  let url: string | null;
  try {
    url = await ctx.runQuery(internal.attendance.photoSource, { punchId: punchId as Id<"attendancePunches"> });
  } catch {
    return new Response(null, { status: 403, headers });
  }
  if (!url || !isAllowedPhotoUrl(url, env.RHID_MEDIA_ALLOWED_HOSTS)) return new Response(null, { status: 404, headers });
  try {
    // Never forward Clerk or RHiD credentials, or follow unvalidated redirects.
    const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!response.ok || !IMAGE_TYPES.has(mime)) return new Response(null, { status: 404, headers });
    const bytes = await readPhotoBody(response);
    headers.set("Content-Type", mime);
    return new Response(bytes as BodyInit, { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
});
