import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, httpAction } from "./_generated/server";
import { MAX_LOOKUP_QUERY_LENGTH } from "./lib/compras/materialLookup";

type ClerkEmailAddress = {
  id: string;
  email_address: string;
};

type ClerkUserData = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmailAddress[];
};

type ClerkWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

function primaryEmail(user: ClerkUserData): string | null {
  const primary = user.email_addresses.find(
    (e) => e.id === user.primary_email_address_id
  );
  return primary?.email_address ?? user.email_addresses[0]?.email_address ?? null;
}

function fullName(user: ClerkUserData): string | null {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : null;
}

async function validateRequest(
  request: Request
): Promise<ClerkWebhookEvent | null> {
  const secret = env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CLERK_WEBHOOK_SECRET não configurado");
    return null;
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return null;
  }

  const payload = await request.text();
  const webhook = new Webhook(secret);
  try {
    return webhook.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (error) {
    console.error("Falha na verificação de assinatura do webhook Clerk", error);
    return null;
  }
}

const handleClerkWebhook = httpAction(async (ctx, request) => {
  const event = await validateRequest(request);
  if (!event) {
    return new Response("Invalid webhook request", { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const user = event.data as unknown as ClerkUserData;
      const email = primaryEmail(user);
      const username = user.username ?? undefined;
      await ctx.runMutation(internal.users.upsertFromClerk, {
        clerkId: user.id,
        email: email ?? undefined,
        username,
        name:
          fullName(user) ?? username ?? email?.split("@")[0] ?? "Usuário",
      });
      break;
    }
    case "user.deleted": {
      const clerkId = event.data.id;
      if (typeof clerkId === "string") {
        await ctx.runMutation(internal.users.deactivateFromClerk, { clerkId });
      }
      break;
    }
    default:
      console.log(`Clerk webhook: evento ${event.type} ignorado`);
  }

  return new Response(null, { status: 200 });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const handleMaterialLookup = httpAction(async (ctx, request) => {
  const token = env.MATERIAL_LOOKUP_TOKEN;
  if (!token) return json({ error: "Material lookup is not configured" }, 503);
  if (request.headers.get("Authorization") !== `Bearer ${token}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_LOOKUP_QUERY_LENGTH) {
    return json(
      { error: `Parameter "q" is required (max ${MAX_LOOKUP_QUERY_LENGTH} chars)` },
      400
    );
  }

  const startedAt = Date.now();
  const result = await ctx.runQuery(internal.materialLookup.findMaterial, {
    query,
  });
  console.log(
    JSON.stringify({
      event: "material_lookup",
      query,
      status: result.status,
      matchedBy: result.status === "found" ? result.matchedBy : null,
      ms: Date.now() - startedAt,
    })
  );
  return json(result);
});

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

const http = httpRouter();

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

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: handleClerkWebhook,
});

http.route({
  path: "/materials/lookup",
  method: "GET",
  handler: handleMaterialLookup,
});

export default http;
