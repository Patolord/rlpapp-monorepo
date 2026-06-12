import { v } from "convex/values";
import { query } from "./_generated/server";

// PÚBLICO (intencional): probe de disponibilidade.
export const get = query({
  args: {},
  returns: v.literal("OK"),
  handler: async () => {
    return "OK" as const;
  },
});
