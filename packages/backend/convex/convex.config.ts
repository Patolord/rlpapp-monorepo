import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    MATERIAL_LOOKUP_TOKEN: v.optional(v.string()),
    // Bearer do app desktop RLP Takeoff para `GET /takeoff/catalog`.
    TAKEOFF_CATALOG_TOKEN: v.optional(v.string()),
    MCP_JWT_ISSUER: v.optional(v.string()),
    MCP_JWT_JWKS: v.optional(v.string()),
    // JWK privado (EC P-256) que assina os JWTs da API HTTP `/api/v1`
    // (scripts/generate-api-signing-key.mjs). Sem ela a API responde 503.
    API_JWT_PRIVATE_KEY: v.optional(v.string()),
    // Credencial de integração com o RHID (controle de ponto). Sem elas o
    // módulo de ponto fica em modo "não configurado".
    RHID_EMAIL: v.optional(v.string()),
    RHID_PASSWORD: v.optional(v.string()),
    // ID da empresa no RHID usado no filtro de marcações (padrão: 1).
    RHID_COMPANY_ID: v.optional(v.string()),
    // Hosts extras (separados por vírgula) de onde o proxy pode buscar fotos
    // de marcação, além de rhid.com.br e subdomínios.
    RHID_MEDIA_ALLOWED_HOSTS: v.optional(v.string()),
  },
});

export default app;
