import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    MCP_JWT_ISSUER: v.optional(v.string()),
    MCP_JWT_JWKS: v.optional(v.string()),
  },
});

export default app;
