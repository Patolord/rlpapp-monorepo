import r2 from "@convex-dev/r2/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    MATERIAL_LOOKUP_TOKEN: v.optional(v.string()),
    // Bearer do app desktop RLP Takeoff para `GET /takeoff/catalog`,
    // `POST /takeoff/materials` e as rotas `/takeoff/plans/*`.
    TAKEOFF_CATALOG_TOKEN: v.optional(v.string()),
    // Bucket Cloudflare R2 onde o RLP Takeoff guarda as plantas (PDF), lido
    // pelo componente @convex-dev/r2. Sem as quatro variáveis as rotas
    // `/takeoff/plans/*` respondem 503 e o app segue só com arquivos locais.
    R2_BUCKET: v.optional(v.string()),
    R2_ENDPOINT: v.optional(v.string()),
    R2_ACCESS_KEY_ID: v.optional(v.string()),
    R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    MCP_JWT_ISSUER: v.optional(v.string()),
    MCP_JWT_JWKS: v.optional(v.string()),
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

app.use(r2);

export default app;
