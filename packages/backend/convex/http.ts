import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

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

const http = httpRouter();

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: handleClerkWebhook,
});

export default http;
