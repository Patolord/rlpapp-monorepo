import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
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

// Public and read-only: only non-sensitive fields (id, code, name, description).
const handleMaterialLookup = httpAction(async (ctx, request) => {
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

const http = httpRouter();

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
