import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { createWhatsAppAdapter } from "@chat-adapter/whatsapp";
import type { Message, Thread } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";

const whatsappConfigured = Boolean(
  process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_APP_SECRET &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_VERIFY_TOKEN,
);

if (!whatsappConfigured) {
  console.warn(
    "[whatsapp] WHATSAPP_* env vars are not set; the WhatsApp webhook will reject all requests until they are configured.",
  );
}

if (!process.env.REDIS_URL) {
  console.warn(
    "[whatsapp] REDIS_URL is not set; using in-memory Chat SDK state. For production, use the redis:// (or rediss://) URL from the same Upstash Redis DB that backs AgentKit.",
  );
}

export const { bot, channel, send } = chatSdkChannel({
  userName: "RLP Internal Agent",
  adapters: {
    // Webhook is mounted at /eve/v1/whatsapp. Auto-detects WHATSAPP_ACCESS_TOKEN,
    // WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_VERIFY_TOKEN.
    // Placeholder credentials keep module evaluation (eve dev/build) working
    // without secrets; signature verification rejects real traffic until the
    // real values are set.
    whatsapp: whatsappConfigured
      ? createWhatsAppAdapter()
      : createWhatsAppAdapter({
          accessToken: crypto.randomUUID(),
          appSecret: crypto.randomUUID(),
          phoneNumberId: crypto.randomUUID(),
          verifyToken: crypto.randomUUID(),
        }),
  },
  // Durable state (subscriptions, locks, dedupe) must be shared across
  // serverless instances in production.
  state: process.env.REDIS_URL ? createRedisState() : createMemoryState(),
  // WhatsApp cannot edit sent messages, so post the reply once per turn.
  streaming: false,
});

// A first inbound WhatsApp message arrives as a new thread. Subscribe so the
// rest of the conversation keeps reaching the agent's durable session.
bot.onNewMention(async (thread: Thread, message: Message) => {
  await thread.subscribe();
  await send(messageToUserContent(message), { thread });
});

bot.onSubscribedMessage(async (thread: Thread, message: Message) => {
  await send(messageToUserContent(message), { thread });
});

export default channel;
