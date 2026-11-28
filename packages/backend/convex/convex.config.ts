import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    // Chave da API da Anthropic usada pelo proxy do agente de IA integrado do
    // RLP Takeoff (`/takeoff/agent/messages`). Sem ela o proxy responde 503.
    ANTHROPIC_API_KEY: v.optional(v.string()),
    // Base URL opcional para o upstream compatível com Anthropic Messages
    // (padrão `https://api.anthropic.com`; permite trocar para Vercel AI
    // Gateway ou mock sem alterar código).
    ANTHROPIC_BASE_URL: v.optional(v.string()),
    // Token de acesso do Expo para o envio de push (só se o projeto EAS
    // exigir "enhanced security for push"). Sem ele o envio funciona igual.
    EXPO_ACCESS_TOKEN: v.optional(v.string()),
    MATERIAL_LOOKUP_TOKEN: v.optional(v.string()),
    MCP_JWT_ISSUER: v.optional(v.string()),
    MCP_JWT_JWKS: v.optional(v.string()),
    // JWK privado (EC P-256) que assina os JWTs da API HTTP `/api/v1`
    // (scripts/generate-api-signing-key.mjs). Sem ela a API responde 503.
    API_JWT_PRIVATE_KEY: v.optional(v.string()),
    // App "RLP App - SharePoint (backend)" no Entra ID (permissão
    // Sites.Selected): lê os sites Projetos e Publico e grava em Projetos
    // (model/sharepoint). Sem elas as ferramentas de arquivos respondem que o
    // SharePoint não está configurado.
    MS_GRAPH_TENANT_ID: v.optional(v.string()),
    MS_GRAPH_CLIENT_ID: v.optional(v.string()),
    MS_GRAPH_CLIENT_SECRET: v.optional(v.string()),
  },
});

export default app;
