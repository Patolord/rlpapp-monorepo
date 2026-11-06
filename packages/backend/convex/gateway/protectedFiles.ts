import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { isPunchPhotoType } from "../model/hr/timeClockPunch";

// Arquivos servidos só com o JWT do Clerk e acesso reavaliado a cada pedido:
// documentos (PDF) da obra e fotos de marcação do ponto.

// ---------------------------------------------------------------------------
// Download autenticado de documentos (PDF) da obra
// ---------------------------------------------------------------------------
//
// O arquivo nunca é exposto por URL direta do storage. O app chama este
// endpoint com `Authorization: Bearer <JWT Clerk>`; o acesso é reavaliado em
// cada pedido (`projectDocuments.resolveDownload`), então revogar o acesso de
// um técnico revoga também o download.

const PROJECT_DOCUMENTS_PATH_PREFIX = "/project-documents/";

function corsHeaders(request: Request): Record<string, string> {
  // O bearer token é o que protege o conteúdo; CORS só precisa permitir que
  // o app (qualquer origem autenticada) leia a resposta.
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function documentIdFromRequest(request: Request): string | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(PROJECT_DOCUMENTS_PATH_PREFIX)) return null;
  const id = pathname.slice(PROJECT_DOCUMENTS_PATH_PREFIX.length);
  return id && !id.includes("/") ? id : null;
}

/** Content-Disposition com nome seguro (ASCII + RFC 5987 para acentos). */
function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(fileName);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const handleProjectDocumentPreflight = httpAction(async (_ctx, request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
});

const handleProjectDocumentDownload = httpAction(async (ctx, request) => {
  const headers = corsHeaders(request);
  const documentId = documentIdFromRequest(request);
  if (!documentId) {
    return new Response("Not found", { status: 404, headers });
  }

  let resolved;
  try {
    resolved = await ctx.runQuery(internal.projectDocuments.resolveDownload, {
      documentId: documentId as Id<"projectDocuments">,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Not authenticated")) {
      return new Response("Unauthorized", { status: 401, headers });
    }
    if (message.includes("Acesso negado") || message.includes("desativado")) {
      return new Response("Forbidden", { status: 403, headers });
    }
    // Id malformado ou documento inexistente.
    return new Response("Not found", { status: 404, headers });
  }
  if (!resolved) {
    return new Response("Not found", { status: 404, headers });
  }

  const blob = await ctx.storage.get(resolved.storageId);
  if (!blob) {
    return new Response("File missing", { status: 404, headers });
  }

  const inline = new URL(request.url).searchParams.get("download") !== "1";
  return new Response(blob, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": resolved.contentType,
      "Content-Length": String(blob.size),
      "Content-Disposition": contentDisposition(resolved.fileName, inline),
      // Conteúdo protegido por sessão: nunca em caches compartilhados.
      "Cache-Control": "private, no-store",
    },
  });
});

// ---------------------------------------------------------------------------
// Foto de marcação do ponto
// ---------------------------------------------------------------------------
//
// O painel pede `/time-clock/photo/<punchId>` com o JWT Clerk; `rh.ponto.read`
// é conferida a cada pedido e a imagem volta com `no-store` (nada fica em
// cache do navegador/PWA). O storage nunca entrega uma URL reutilizável.

const TIME_CLOCK_PHOTO_PATH_PREFIX = "/time-clock/photo/";

const handleTimeClockPhoto = httpAction(async (ctx, request) => {
  const headers: Record<string, string> = {
    ...corsHeaders(request),
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  const { pathname } = new URL(request.url);
  const punchId = pathname.slice(TIME_CLOCK_PHOTO_PATH_PREFIX.length);
  if (!punchId || punchId.includes("/")) {
    return new Response("Not found", { status: 404, headers });
  }
  const resolved = await ctx.runQuery(internal.timeClock.authorizePunchPhoto, { punchId });
  if (resolved.status === "unauthenticated") {
    return new Response("Unauthorized", { status: 401, headers });
  }
  if (resolved.status === "forbidden") {
    return new Response("Forbidden", { status: 403, headers });
  }
  if (resolved.status !== "ok") {
    return new Response("Not found", { status: 404, headers });
  }
  const blob = await ctx.storage.get(resolved.storageId);
  if (!blob || !isPunchPhotoType(blob.type)) {
    return new Response("Not found", { status: 404, headers });
  }
  return new Response(blob, {
    status: 200,
    headers: { ...headers, "Content-Type": blob.type, "Content-Length": String(blob.size) },
  });
});

export function registerProtectedFileRoutes(http: HttpRouter): void {
  http.route({
    pathPrefix: TIME_CLOCK_PHOTO_PATH_PREFIX,
    method: "GET",
    handler: handleTimeClockPhoto,
  });
  http.route({
    pathPrefix: TIME_CLOCK_PHOTO_PATH_PREFIX,
    method: "OPTIONS",
    handler: handleProjectDocumentPreflight,
  });
  http.route({
    pathPrefix: PROJECT_DOCUMENTS_PATH_PREFIX,
    method: "GET",
    handler: handleProjectDocumentDownload,
  });
  http.route({
    pathPrefix: PROJECT_DOCUMENTS_PATH_PREFIX,
    method: "OPTIONS",
    handler: handleProjectDocumentPreflight,
  });
}
