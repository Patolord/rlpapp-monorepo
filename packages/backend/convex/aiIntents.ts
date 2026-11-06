import { v } from "convex/values";
import { assistenteMutation } from "./lib/rbac";
import { applyAiIntents } from "./model/ai/applyIntents";
import { aiIntentValidator } from "./model/ai/intents";

export const applyIntents = assistenteMutation({
  args: {
    projectId: v.id("projects"),
    intents: v.array(aiIntentValidator),
  },
  returns: v.object({
    applied: v.number(),
    summary: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    return await applyAiIntents(ctx, ctx.user, args);
  },
});
