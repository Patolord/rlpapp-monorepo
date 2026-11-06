import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction, type ActionCtx } from "../_generated/server";
import { AGENT_TOKEN_PREFIX } from "../lib/agentTokens";
import { getApiTokenIssuer, getPublicJwks, isApiTokenSigningConfigured } from "../lib/apiCrypto";
import type { FunctionType } from "../mcp/catalog";
import { authenticate, describeCaller, mintToken, type RequestAudit } from "./callerAuth";
import { BLOCKED_MODULES, loadCatalog, type FunctionKind } from "./functionCatalog";
import { deploymentUrl, readArgs, readJsonBody, runFunction } from "./functionRunner";
import { ApiError, errorResponse, json } from "./responses";
import { describeArgs } from "./validate";

/**
 * API HTTP para agentes — `https://<deployment>.convex.site/api/v1/*`.
 *
 * O app inteiro é só chamadas a funções públicas do Convex, então "tudo que o
 * app faz" já é uma superfície programática — falta apenas uma identidade.
 * Este gateway fornece uma: autentica um token de agente (`rlp_…`, criado em
 * Minha conta → Agentes) e
 *
 *   1. devolve um JWT curto (`POST /api/v1/auth/token`) que qualquer cliente
 *      Convex (HTTP, ConvexHttpClient, ConvexClient com subscriptions) usa
 *      direto contra o deployment, ou
 *   2. executa uma função em nome do dono (`/api/v1/query`, `/api/v1/mutation`,
 *      `/api/v1/action`, `/api/v1/run/<modulo:funcao>`), emitindo esse JWT
 *      internamente e repassando a chamada à Functions API do deployment, ou
 *   3. descreve o que pode ser executado (`GET /api/v1/functions`): toda
 *      função pública com validadores e requisito de acesso (mcpCatalog.ts).
 *
 * Como o `sub` do JWT é o clerkId do dono, cada função existente roda sem
 * alteração, com a role e o departamento do dono. Tokens somente leitura e
 * revogação são aplicados centralmente em lib/agentTokens.ts (requireAuth),
 * e repetidos aqui para responder com códigos claros antes de chamar o
 * deployment.
 *
 * Mesmo contrato da API do Upcraft; ver docs/API.md.
 */

// Módulos irmãos: responses.ts (JSON e ApiError), callerAuth.ts (token de
// agente → dono, JWT), functionCatalog.ts (catálogo e preflight),
// functionRunner.ts (chamada ao deployment) e functionErrors.ts (tradução de
// falhas do upstream).

/**
 * Aceita `modulo:fn` (canônico do Convex), `modulo/fn` e `modulo.fn` e devolve
 * a forma canônica.
 */
export function normalizeFunctionPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) throw new ApiError("VALIDATION_ERROR", "Function path is required.");
  if (!/^[A-Za-z0-9_./:-]+$/.test(trimmed)) {
    throw new ApiError("VALIDATION_ERROR", `Invalid function path: ${raw}`);
  }
  if (trimmed.includes(":")) return trimmed;
  const separator = trimmed.includes(".") ? "." : "/";
  const index = trimmed.lastIndexOf(separator);
  if (index <= 0 || index === trimmed.length - 1) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Invalid function path: ${raw}. Use "module:function", e.g. "projects:list".`
    );
  }
  const module = trimmed.slice(0, index).replace(/\./g, "/");
  return `${module}:${trimmed.slice(index + 1)}`;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type Handler = (ctx: ActionCtx, request: Request, audit: RequestAudit) => Promise<Response>;

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Grava a linha de auditoria de uma requisição terminada, quando o chamador
 * foi identificado. Nunca lança: observabilidade não pode transformar uma
 * chamada bem-sucedida em falha.
 */
async function recordRequest(
  ctx: ActionCtx,
  audit: RequestAudit,
  response: Response,
  startedAt: number
): Promise<void> {
  if (!audit.caller) return;
  try {
    let errorMessage: string | undefined;
    if (!response.ok) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as ErrorBody | null;
      errorMessage = body?.error?.code
        ? `${body.error.code}: ${body.error.message ?? ""}`.trim()
        : body?.error?.message;
    }
    await ctx.runMutation(internal.agentTokens.recordApiRequest, {
      tokenId: audit.caller.token._id,
      userId: audit.caller.user._id,
      route: audit.route,
      functionPath: audit.functionPath,
      outcome: response.ok ? "success" : "error",
      errorMessage,
      durationMs: Date.now() - startedAt,
      createdAt: startedAt,
    });
  } catch (error) {
    console.error("[api/v1] audit write failed", error instanceof Error ? error.message : error);
  }
}

/**
 * Tradução uniforme de erros para os handlers só darem `throw new ApiError`,
 * mais tempo e auditoria para cada rota autenticada.
 */
function guarded(route: string, handler: Handler) {
  return httpAction(async (ctx, request) => {
    const startedAt = Date.now();
    const audit: RequestAudit = { route };
    let response: Response;
    try {
      response = await handler(ctx, request, audit);
    } catch (error) {
      if (error instanceof ApiError) {
        response = errorResponse(error.code, error.message, error.details, error.headers);
      } else {
        const message = error instanceof Error ? error.message : "Internal error";
        console.error("[api/v1]", request.method, new URL(request.url).pathname, message);
        response = errorResponse("INTERNAL_ERROR", message);
      }
    }
    await recordRequest(ctx, audit, response, startedAt);
    return response;
  });
}

const jwks = guarded("jwks", async () => {
  if (!isApiTokenSigningConfigured()) {
    throw new ApiError("NOT_CONFIGURED", "API token signing is not configured.");
  }
  return json(getPublicJwks(), 200, { "Cache-Control": "public, max-age=300" });
});

const index = guarded("index", async () => {
  return json({
    name: "RLP API",
    version: "v1",
    docs: "https://github.com/Patolord/rlpapp-monorepo/blob/master/docs/API.md",
    authentication: `Authorization: Bearer ${AGENT_TOKEN_PREFIX}... (agent token created at /conta/agentes)`,
    endpoints: {
      "GET /api/v1/me": "who the token acts as",
      "GET /api/v1/functions": "catalog of callable functions (filters: module, type, search, allowed=true)",
      "POST /api/v1/query": '{ "path": "module:function", "args": {} }',
      "POST /api/v1/mutation": '{ "path": "module:function", "args": {} }',
      "POST /api/v1/action": '{ "path": "module:function", "args": {} }',
      "POST /api/v1/run/<module:function>": '{ "args": {} } (any type)',
      "POST /api/v1/auth/token": "short-lived JWT for direct Convex clients",
    },
  });
});

const exchangeToken = guarded("token", async (ctx, request, audit) => {
  const caller = await authenticate(ctx, request, audit);
  const { token, expiresAt } = await mintToken(caller);
  return json({
    token,
    token_type: "Bearer",
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    expires_at: new Date(expiresAt * 1000).toISOString(),
    issuer: getApiTokenIssuer(),
    deployment_url: deploymentUrl(),
    ...describeCaller(caller),
  });
});

const me = guarded("me", async (ctx, request, audit) => {
  const caller = await authenticate(ctx, request, audit);
  return json(describeCaller(caller));
});

function functionHandler(kind: Exclude<FunctionKind, "run">) {
  return guarded(kind, async (ctx, request, audit) => {
    const caller = await authenticate(ctx, request, audit);
    let path: unknown;
    let args: unknown;
    if (request.method === "GET") {
      const url = new URL(request.url);
      path = url.searchParams.get("path") ?? undefined;
      const rawArgs = url.searchParams.get("args");
      if (rawArgs) {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          throw new ApiError("VALIDATION_ERROR", "`args` query parameter must be JSON.");
        }
      }
    } else {
      const body = await readJsonBody(request);
      path = body.path;
      args = body.args;
    }
    if (typeof path !== "string") {
      throw new ApiError("VALIDATION_ERROR", '`path` is required, e.g. "projects:list".');
    }
    return await runFunction(ctx, caller, kind, normalizeFunctionPath(path), readArgs(args), audit);
  });
}

const FUNCTION_TYPES: ReadonlySet<string> = new Set(["query", "mutation", "action"]);

/**
 * `GET /api/v1/functions` — o catálogo de funções públicas que o gateway
 * executa, com validadores e requisito de acesso, para o cliente nunca
 * precisar ler o código-fonte para achar um caminho ou seus campos.
 *
 * Filtros: `module` (ex.: `suppliers`), `type` (query|mutation|action),
 * `search` (trecho do caminho), `allowed=true` (só o que este token pode chamar).
 */
const listFunctions = guarded("functions", async (ctx, request, audit) => {
  const caller = await authenticate(ctx, request, audit);
  const url = new URL(request.url);

  const moduleFilter = url.searchParams
    .get("module")
    ?.trim()
    .replace(/\./g, "/")
    .replace(/^\/+|\/+$/g, "");
  const typeFilter = url.searchParams.get("type")?.trim().toLowerCase();
  const searchFilter = url.searchParams.get("search")?.trim().toLowerCase();
  const allowedOnly = url.searchParams.get("allowed") === "true";
  if (typeFilter && !FUNCTION_TYPES.has(typeFilter)) {
    throw new ApiError("VALIDATION_ERROR", "`type` must be one of query, mutation, action.", {
      field: "type",
    });
  }

  const catalog = await loadCatalog(ctx, caller);
  if (catalog === null) {
    throw new ApiError(
      "FORBIDDEN",
      "The owner of this agent token is not an internal user; the API only serves internal roles.",
      { roles: caller.user.roles }
    );
  }
  const readOnly = caller.token.permission === "read_only";

  const functions = catalog
    .filter((entry) => !BLOCKED_MODULES.has(entry.module))
    .filter((entry) => !moduleFilter || entry.module === moduleFilter)
    .filter((entry) => !typeFilter || entry.type === (typeFilter as FunctionType))
    .filter((entry) => !searchFilter || entry.path.toLowerCase().includes(searchFilter))
    .map(({ argsValidator, ...entry }) => ({
      ...entry,
      args: describeArgs(argsValidator),
      // Se *este* token pode executá-la: além do acesso do dono, tokens
      // somente leitura ficam restritos a queries.
      allowedForToken: entry.allowed && (!readOnly || entry.type === "query"),
    }))
    .filter((entry) => !allowedOnly || entry.allowedForToken);

  const modules = [
    ...new Set(catalog.filter((e) => !BLOCKED_MODULES.has(e.module)).map((e) => e.module)),
  ].sort();
  return json(
    {
      count: functions.length,
      total: catalog.length,
      modules,
      filters: {
        module: moduleFilter || null,
        type: typeFilter || null,
        search: searchFilter || null,
        allowed: allowedOnly,
      },
      agent_token: { permission: caller.token.permission },
      user: { roles: caller.user.roles },
      functions,
    },
    200,
    { "Cache-Control": "private, max-age=60" }
  );
});

const RUN_PREFIX = "/api/v1/run/";

const run = guarded("run", async (ctx, request, audit) => {
  const caller = await authenticate(ctx, request, audit);
  const pathname = new URL(request.url).pathname;
  const identifier = decodeURIComponent(pathname.slice(RUN_PREFIX.length));
  const body = request.method === "GET" ? {} : await readJsonBody(request);
  return await runFunction(
    ctx,
    caller,
    "run",
    normalizeFunctionPath(identifier),
    readArgs(body.args),
    audit
  );
});

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

export function registerApiV1Routes(http: HttpRouter): void {
  http.route({ path: "/.well-known/jwks.json", method: "GET", handler: jwks });

  http.route({ path: "/api/v1", method: "GET", handler: index });
  http.route({ path: "/api/v1/auth/token", method: "POST", handler: exchangeToken });
  http.route({ path: "/api/v1/me", method: "GET", handler: me });
  http.route({ path: "/api/v1/functions", method: "GET", handler: listFunctions });

  http.route({ path: "/api/v1/query", method: "GET", handler: functionHandler("query") });
  http.route({ path: "/api/v1/query", method: "POST", handler: functionHandler("query") });
  http.route({ path: "/api/v1/mutation", method: "POST", handler: functionHandler("mutation") });
  http.route({ path: "/api/v1/action", method: "POST", handler: functionHandler("action") });

  http.route({ pathPrefix: RUN_PREFIX, method: "GET", handler: run });
  http.route({ pathPrefix: RUN_PREFIX, method: "POST", handler: run });
}
