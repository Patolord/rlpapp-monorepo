import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    MATERIAL_LOOKUP_TOKEN: v.optional(v.string()),
    MCP_JWT_ISSUER: v.optional(v.string()),
    MCP_JWT_JWKS: v.optional(v.string()),
    // Credencial de integração com o RHID (controle de ponto). Sem elas o
    // módulo de ponto fica em modo "não configurado".
    RHID_EMAIL: v.optional(v.string()),
    RHID_PASSWORD: v.optional(v.string()),
    // ID da empresa no RHID usado no filtro de marcações (padrão: 1).
    RHID_COMPANY_ID: v.optional(v.string()),
  },
});

export default app;
