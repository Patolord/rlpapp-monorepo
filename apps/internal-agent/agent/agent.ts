import { defineAgent } from "eve";

export default defineAgent({
  // Free AI Gateway model ($0) with tool-use support.
  // See https://vercel.com/ai-gateway/models?freeTier=true
  model: "inclusionai/ling-3.0-flash-free",
});
