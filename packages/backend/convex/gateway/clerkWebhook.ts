import type { HttpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "../_generated/api";
import { env, httpAction } from "../_generated/server";

// Webhook do Clerk (svix): mantém a tabela users em dia com as contas do Clerk.

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
  /** Preenchido pela página /convite do app web (telefone opcional). */
  unsafe_metadata?: Record<string, unknown> | null;
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

function invitedPhone(user: ClerkUserData): string | undefined {
  const phone = user.unsafe_metadata?.phone;
  return typeof phone === "string" && phone.trim() ? phone.trim() : undefined;
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
        phone: invitedPhone(user),
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

export function registerClerkWebhookRoutes(http: HttpRouter): void {
  http.route({
    path: "/clerk-users-webhook",
    method: "POST",
    handler: handleClerkWebhook,
  });
}
