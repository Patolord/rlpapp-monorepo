import { defineAgent } from "eve";

export default defineAgent({
  // Prefer GPT-5 nano; fall back to a $0 free model when nano is unavailable
  // (free-tier rate limits, outages, etc.).
  // See https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks
  model: "openai/gpt-5-nano",
  modelOptions: {
    providerOptions: {
      gateway: {
        models: ["inclusionai/ling-3.0-flash-free"],
      },
    },
  },
});
