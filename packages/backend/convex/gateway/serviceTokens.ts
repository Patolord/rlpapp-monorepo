import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { env, httpAction } from "../_generated/server";
import { MAX_LOOKUP_QUERY_LENGTH } from "../model/procurement/materialLookup";
import {
  AGENT_TOKEN_DISPLAY_PREFIX_LENGTH,
  hashAgentToken,
  looksLikeAgentToken,
} from "../lib/agentTokens";
import { json } from "./responses";
import { readBearer } from "./callerAuth";

// Endpoints chamados por serviços com token próprio: a busca de material do
// assistente interno (MATERIAL_LOOKUP_TOKEN) e a verificação de tokens de
// agente pelo servidor MCP do app web.

const handleMaterialLookup = httpAction(async (ctx, request) => {
  const token = env.MATERIAL_LOOKUP_TOKEN;
  if (!token) return json({ error: "Material lookup is not configured" }, 503);
  if (request.headers.get("Authorization") !== `Bearer ${token}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_LOOKUP_QUERY_LENGTH) {
    return json(
      { error: `Parameter "q" is required (max ${MAX_LOOKUP_QUERY_LENGTH} chars)` },
      400
    );
  }

  const startedAt = Date.now();
  const result = await ctx.runQuery(internal.materialLookup.findMaterial, {
    query,
  });
  console.log(
    JSON.stringify({
      event: "material_lookup",
      query,
      status: result.status,
      matchedBy: result.status === "found" ? result.matchedBy : null,
      ms: Date.now() - startedAt,
    })
  );
  return json(result);
});

// ---------------------------------------------------------------------------
// Tokens de agente (MCP)
// ---------------------------------------------------------------------------
//
// O servidor MCP (apps/web, rota /mcp) recebe `Authorization: Bearer rlp_…`
// de clientes como Claude e Cursor e chama este endpoint para saber a quem o
// token pertence. Só o SHA-256 é comparado; a resposta é o mesmo que o dono
// do token já poderia ver sobre si mesmo. Depois disso o servidor MCP emite
// um JWT de delegação (sub = clerkId do dono, claims agent_token.*) e as
// funções Convex aplicam o RBAC normal mais a política de lib/agentTokens.ts.

const AGENT_TOKEN_VERIFY_PATH = "/agent-tokens/verify";

const handleAgentTokenVerify = httpAction(async (ctx, request) => {
  const presented = readBearer(request);
  if (!presented || !looksLikeAgentToken(presented)) {
    return json({ error: "Unauthorized" }, 401, {
      "WWW-Authenticate": 'Bearer realm="agent-tokens"',
    });
  }

  const now = Date.now();
  const verified = await ctx.runQuery(internal.agentTokens.verify, {
    tokenHash: await hashAgentToken(presented),
    now,
  });
  if (!verified) {
    console.log(
      JSON.stringify({
        event: "agent_token_rejected",
        prefix: presented.slice(0, AGENT_TOKEN_DISPLAY_PREFIX_LENGTH),
      })
    );
    return json({ error: "Unauthorized" }, 401);
  }

  await ctx.runMutation(internal.agentTokens.touch, {
    id: verified.token._id,
    now,
  });
  return json(verified);
});

export function registerServiceTokenRoutes(http: HttpRouter): void {
  http.route({
    path: AGENT_TOKEN_VERIFY_PATH,
    method: "POST",
    handler: handleAgentTokenVerify,
  });
  http.route({
    path: "/materials/lookup",
    method: "GET",
    handler: handleMaterialLookup,
  });
}
