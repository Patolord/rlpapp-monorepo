import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, type ActionCtx } from "../_generated/server";
import {
  AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE,
  AGENT_TOKEN_DISPLAY_PREFIX_LENGTH,
  AGENT_TOKEN_PREFIX,
  READ_ONLY_AGENT_TOKEN_MESSAGE,
  REVOKED_AGENT_TOKEN_MESSAGE,
  hashAgentToken,
  looksLikeAgentToken,
  type AgentTokenPermission,
} from "../lib/agentTokens";
import {
  API_TOKEN_TTL_SECONDS,
  getApiTokenIssuer,
  getPublicJwks,
  isApiTokenSigningConfigured,
  signApiToken,
} from "../lib/apiCrypto";
import type { CatalogEntry, FunctionType } from "../mcpCatalog";
import {
  describeArgs,
  suggestPaths,
  validateArgs,
  type ArgsIssue,
  type IdCheck,
} from "./validate";

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

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "FUNCTION_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  FUNCTION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  extraHeaders?: Record<string, string>
): Response {
  return json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    STATUS_BY_CODE[code],
    extraHeaders
  );
}

class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

interface AuthenticatedCaller {
  token: {
    _id: Id<"agentTokens">;
    name: string;
    tokenPrefix: string;
    permission: AgentTokenPermission;
    expiresAt: number | null;
  };
  user: {
    _id: Id<"users">;
    clerkId: string;
    name: string;
    email: string | null;
    username: string | null;
    role: string;
    department: string | null;
  };
}

/**
 * Estado de auditoria da requisição. Os handlers preenchem conforme descobrem
 * quem chama e o que pediu; `guarded` grava depois que a resposta existe.
 */
interface RequestAudit {
  route: string;
  caller?: AuthenticatedCaller;
  functionPath?: string;
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

async function authenticate(
  ctx: ActionCtx,
  request: Request,
  audit: RequestAudit
): Promise<AuthenticatedCaller> {
  const presented = readBearer(request);
  if (!presented) {
    throw new ApiError(
      "UNAUTHENTICATED",
      `Missing credentials. Send your agent token as \`Authorization: Bearer ${AGENT_TOKEN_PREFIX}...\`.`,
      undefined,
      { "WWW-Authenticate": 'Bearer realm="api"' }
    );
  }
  if (!looksLikeAgentToken(presented)) {
    throw new ApiError(
      "UNAUTHENTICATED",
      `This endpoint expects an agent token (${AGENT_TOKEN_PREFIX}...), created at /conta/agentes. If you already hold a JWT from /api/v1/auth/token, call the deployment's Functions API directly with it.`
    );
  }

  const now = Date.now();
  const verified = await ctx.runQuery(internal.agentTokens.verify, {
    tokenHash: await hashAgentToken(presented),
    now,
  });
  if (!verified) {
    throw new ApiError(
      "UNAUTHENTICATED",
      "Invalid, expired or revoked agent token.",
      { tokenPrefix: presented.slice(0, AGENT_TOKEN_DISPLAY_PREFIX_LENGTH) }
    );
  }

  audit.caller = verified;
  await ctx.runMutation(internal.agentTokens.touch, { id: verified.token._id, now });
  return verified;
}

interface MintedToken {
  token: string;
  expiresAt: number;
}

async function mintToken(caller: AuthenticatedCaller): Promise<MintedToken> {
  if (!isApiTokenSigningConfigured()) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "API token signing is not configured on this deployment (API_JWT_PRIVATE_KEY)."
    );
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  let expiresAt = issuedAt + API_TOKEN_TTL_SECONDS;
  if (caller.token.expiresAt !== null) {
    expiresAt = Math.min(expiresAt, Math.floor(caller.token.expiresAt / 1000));
  }
  const token = await signApiToken({
    subject: caller.user.clerkId,
    email: caller.user.email ?? undefined,
    agentTokenId: caller.token._id,
    permission: caller.token.permission,
    issuedAt,
    expiresAt,
  });
  return { token, expiresAt };
}

function describeCaller(caller: AuthenticatedCaller) {
  return {
    user: {
      id: caller.user._id,
      name: caller.user.name,
      email: caller.user.email,
      username: caller.user.username,
      role: caller.user.role,
      department: caller.user.department,
    },
    agent_token: {
      id: caller.token._id,
      name: caller.token.name,
      token_prefix: caller.token.tokenPrefix,
      permission: caller.token.permission,
      expires_at:
        caller.token.expiresAt !== null
          ? new Date(caller.token.expiresAt).toISOString()
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Proxy de funções
// ---------------------------------------------------------------------------

type FunctionKind = "query" | "mutation" | "action" | "run";

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

function deploymentUrl(): string {
  const url = process.env.CONVEX_CLOUD_URL;
  if (!url) throw new ApiError("INTERNAL_ERROR", "CONVEX_CLOUD_URL is not set");
  return url.replace(/\/+$/, "");
}

const READ_ONLY_MESSAGE =
  "This agent token is read-only. Create a token with full_access to run mutations or actions.";

/**
 * Módulos que a API nunca executa, mesmo com acesso total: gestão de tokens
 * exige sessão humana (um token vazado não pode se perpetuar criando outro) e
 * o catálogo já é servido por `/api/v1/functions`.
 */
const BLOCKED_MODULES: ReadonlySet<string> = new Set(["agentTokens", "mcpCatalog"]);

interface ConvexFunctionResult {
  status?: "success" | "error";
  value?: unknown;
  errorMessage?: string;
  errorData?: unknown;
  // Falhas de requisição (caminho desconhecido, corpo malformado) voltam
  // como `{ code, message }` em vez do envelope de resultado de UDF.
  code?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Tradução de erros
// ---------------------------------------------------------------------------

/**
 * O Convex expõe um `Error` lançado como "Uncaught Error: <mensagem>" seguido
 * da stack; o agente só precisa da mensagem que o autor da função escreveu.
 */
function cleanFunctionMessage(raw: string): string {
  const withoutRequestId = raw.replace(/^\[Request ID: [^\]]+\] Server Error\n?/, "");
  const firstLines: string[] = [];
  for (const line of withoutRequestId.split("\n")) {
    if (/^\s+at\s/.test(line)) break;
    firstLines.push(line);
  }
  return firstLines
    .join("\n")
    .replace(/^Uncaught (?:ConvexError|Error|TypeError|RangeError|\w+Error):\s*/, "")
    .trim();
}

interface ValidationDetails {
  function: string;
  field?: string;
  expected?: string;
  received?: string;
  validator?: string;
}

/**
 * Extrai detalhes por campo do texto de `ArgumentValidationError` do Convex.
 * Formas conhecidas (a primeira linha é o resumo):
 *   - Object is missing the required field `x`. Consider wrapping...
 *   - Object contains extra field `x` that is not in the validator.
 *   - Value does not match validator.\nPath: .x\nValue: "..."\nValidator: v.union(...)
 *   - Found ID "..." from table `a`, which does not match ... `v.id("b")`.Path: .x
 * seguidas (após linha em branco) de `Object: {...}\nValidator: v.object({...})`.
 */
function parseValidationError(
  text: string,
  path: string
): { message: string; details: ValidationDetails } {
  const [head = "", ...tail] = text.trim().split("\n\n");
  const details: ValidationDetails = { function: path };
  const lines = head.split("\n");
  let summary = lines[0]!.trim();

  const fieldFromPath = head.match(/Path:\s*\.?([\w.[\]]+)/);
  const fieldFromText = head.match(/(?:required|extra) field `([^`]+)`/);
  const field = fieldFromPath?.[1] ?? fieldFromText?.[1];
  if (field) details.field = field;

  const valueLine = lines.find((line) => line.startsWith("Value:"));
  if (valueLine) details.received = valueLine.slice("Value:".length).trim();
  const validatorLine = lines.find((line) => line.startsWith("Validator:"));
  if (validatorLine) details.expected = validatorLine.slice("Validator:".length).trim();
  const idMismatch = head.match(/in validator `([^`]+)`/);
  if (idMismatch) details.expected = idMismatch[1];

  const fullValidator = tail.join("\n\n").match(/Validator:\s*([\s\S]+)$/);
  if (fullValidator) details.validator = fullValidator[1]!.trim();

  if (summary.startsWith("Found ID")) {
    summary = summary.replace(/\.Path:.*$/, ".");
  }
  summary = summary.replace(/\s*Consider wrapping the field validator.*$/, "");
  if (field && summary === "Value does not match validator.") {
    summary = `Field \`${field}\` does not match the expected type${
      details.expected ? ` (${details.expected})` : ""
    }.`;
  }
  return { message: `Invalid arguments: ${summary}`, details };
}

/**
 * As funções deste backend lançam `Error` com mensagens fixas para negar
 * acesso (lib/rbac.ts, lib/auth.ts, lib/agentTokens.ts). Em dev essas
 * mensagens chegam ao gateway; aqui viram o código HTTP certo.
 */
function codeFromMessage(message: string): ApiErrorCode | null {
  if (message === "Not authenticated" || message === "User not found in database") {
    return "UNAUTHENTICATED";
  }
  if (message === REVOKED_AGENT_TOKEN_MESSAGE) return "UNAUTHENTICATED";
  if (message === READ_ONLY_AGENT_TOKEN_MESSAGE) return "UNAUTHORIZED";
  if (
    message === "Insufficient permissions" ||
    message === "Usuário desativado" ||
    message === AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE ||
    /^Acesso restrito/.test(message) ||
    /^Apenas administradores/.test(message)
  ) {
    return "FORBIDDEN";
  }
  if (/não encontrad[oa]/i.test(message) || /\bnot found\b/i.test(message)) {
    return "NOT_FOUND";
  }
  if (/já existe|already exists/i.test(message)) return "ALREADY_EXISTS";
  return null;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** `null` quando o dono do token não é usuário interno (sem catálogo). */
async function loadCatalog(
  ctx: ActionCtx,
  caller: AuthenticatedCaller
): Promise<CatalogEntry[] | null> {
  return (await ctx.runQuery(internal.mcpCatalog.listForUser, {
    userId: caller.user._id,
  })) as CatalogEntry[] | null;
}

const MODULE_LISTING_LIMIT = 12;

/**
 * `404 NOT_FOUND` para caminho fora do catálogo, com os caminhos mais
 * próximos e — quando o módulo existe — o que ele realmente exporta.
 */
function notFoundResponse(path: string, catalog: CatalogEntry[] | null): Response {
  const paths = catalog?.map((entry) => entry.path) ?? [];
  const suggestions = suggestPaths(path, paths);
  const module = path.split(":")[0] ?? "";
  const moduleFunctions = (catalog ?? [])
    .filter((entry) => entry.module === module)
    .map((entry) => entry.name);

  let hint: string;
  if (suggestions.length > 0) {
    hint = ` Did you mean ${suggestions.map((s) => `"${s}"`).join(", ")}?`;
  } else if (moduleFunctions.length > 0) {
    const shown = moduleFunctions.slice(0, MODULE_LISTING_LIMIT).join(", ");
    const more =
      moduleFunctions.length > MODULE_LISTING_LIMIT
        ? `, … (${moduleFunctions.length - MODULE_LISTING_LIMIT} more)`
        : "";
    hint = ` Module "${module}" exports: ${shown}${more}.`;
  } else {
    hint = " List available functions at GET /api/v1/functions.";
  }
  return errorResponse("NOT_FOUND", `Function not found: ${path}.${hint}`, {
    function: path,
    suggestions,
    ...(moduleFunctions.length > 0
      ? { module, moduleFunctions: moduleFunctions.map((name) => `${module}:${name}`) }
      : {}),
  });
}

function accessDescription(entry: CatalogEntry): string {
  switch (entry.access.kind) {
    case "permission":
      return `requires permission ${entry.access.permission}`;
    case "anyPermission":
      return `requires one of ${entry.access.permissions.join(", ")}`;
    case "staff":
      return "requires an internal user";
    case "authenticated":
      return "requires an authenticated user";
    case "public":
      return "is public";
    case "unknown":
      return "has access rules decided inside the function";
  }
}

/**
 * Decide NOT_FOUND / tipo errado / FORBIDDEN / VALIDATION_ERROR a partir do
 * catálogo *antes* de chamar o deployment. Produção redige todo erro comum
 * para "Server Error", então essas respostas não podem vir do upstream lá; o
 * catálogo é a única fonte confiável.
 *
 * Devolve a entrada resolvida (ou `null` quando o catálogo não está
 * disponível e a chamada deve seguir no melhor esforço) ou uma resposta de
 * erro pronta.
 */
async function preflight(
  ctx: ActionCtx,
  caller: AuthenticatedCaller,
  kind: FunctionKind,
  path: string,
  args: Record<string, unknown>,
  readOnly: boolean
): Promise<{ entry: CatalogEntry | null } | { response: Response }> {
  const module = path.split(":")[0] ?? "";
  if (BLOCKED_MODULES.has(module)) {
    return {
      response: errorResponse(
        "FORBIDDEN",
        module === "agentTokens"
          ? `${AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE}. Manage tokens at /conta/agentes.`
          : `${path} is not available through the API. Use GET /api/v1/functions instead.`,
        { function: path }
      ),
    };
  }

  let catalog: CatalogEntry[] | null;
  try {
    catalog = await loadCatalog(ctx, caller);
  } catch (error) {
    console.error(
      "[api/v1] catalog unavailable",
      error instanceof Error ? error.message : error
    );
    return { entry: null };
  }
  if (catalog === null) {
    return {
      response: errorResponse(
        "FORBIDDEN",
        "The owner of this agent token is not an internal user; the API only serves internal roles.",
        { function: path, role: caller.user.role }
      ),
    };
  }

  const entry = catalog.find((candidate) => candidate.path === path);
  if (!entry) return { response: notFoundResponse(path, catalog) };

  if (kind !== "run" && entry.type !== kind) {
    return {
      response: errorResponse(
        "VALIDATION_ERROR",
        `${path} is a ${entry.type}; call POST /api/v1/${entry.type} (or /api/v1/run/${path}) instead of /api/v1/${kind}.`,
        { function: path, type: entry.type, endpoint: `/api/v1/${entry.type}` }
      ),
    };
  }
  if (readOnly && entry.type !== "query") {
    return {
      response: errorResponse("UNAUTHORIZED", READ_ONLY_MESSAGE, {
        function: path,
        type: entry.type,
      }),
    };
  }
  if (!entry.allowed) {
    return {
      response: errorResponse(
        "FORBIDDEN",
        `${path} ${accessDescription(entry)}; the token owner (${caller.user.role}${
          caller.user.department ? `, ${caller.user.department}` : ""
        }) does not have it.`,
        { function: path, access: entry.access, role: caller.user.role }
      ),
    };
  }

  if (entry.argsValidator) {
    const ids: IdCheck[] = [];
    const issue = validateArgs(entry.argsValidator, args, ids);
    if (issue) {
      return {
        response: errorResponse("VALIDATION_ERROR", `Invalid arguments: ${issue.message}`, {
          function: path,
          ...(issue.field ? { field: issue.field } : {}),
          expected: issue.expected,
          ...(issue.received !== undefined ? { received: issue.received } : {}),
          signature: entry.signature,
        }),
      };
    }
    const idIssue = await checkIdTables(ctx, ids);
    if (idIssue) {
      return {
        response: errorResponse("VALIDATION_ERROR", `Invalid arguments: ${idIssue.message}`, {
          function: path,
          field: idIssue.field,
          expected: idIssue.expected,
          received: idIssue.received,
          signature: entry.signature,
        }),
      };
    }
  }

  return { entry };
}

/**
 * O Convex rejeita um ID da tabela errada com `ArgumentValidationError`
 * (redigido em produção), então a tabela é conferida aqui. Pulado no melhor
 * esforço se a própria consulta falhar.
 */
async function checkIdTables(
  ctx: ActionCtx,
  ids: IdCheck[]
): Promise<(ArgsIssue & { field: string; received: string }) | null> {
  if (ids.length === 0) return null;
  let results: Array<{ field: string; ok: boolean; actualTable: string | null }>;
  try {
    results = await ctx.runQuery(internal.mcpCatalog.checkIds, { ids });
  } catch (error) {
    console.error("[api/v1] id check failed", error instanceof Error ? error.message : error);
    return null;
  }
  const failedIndex = results.findIndex((result) => !result.ok);
  if (failedIndex === -1) return null;
  const failed = results[failedIndex]!;
  const requested = ids[failedIndex]!;
  const expected = requested.tables.map((table) => `Id<${table}>`).join(" | ");
  const message = failed.actualTable
    ? `Field \`${failed.field}\` is an ID from table \`${failed.actualTable}\`, but ${expected} was expected.`
    : `Field \`${failed.field}\` is not a document ID of this deployment (${expected} was expected).`;
  return { message, field: failed.field, expected, received: JSON.stringify(requested.value) };
}

async function runFunction(
  ctx: ActionCtx,
  caller: AuthenticatedCaller,
  kind: FunctionKind,
  path: string,
  args: Record<string, unknown>,
  audit: RequestAudit
): Promise<Response> {
  audit.functionPath = path;
  const readOnly = caller.token.permission === "read_only";
  if (readOnly && (kind === "mutation" || kind === "action")) {
    throw new ApiError("UNAUTHORIZED", READ_ONLY_MESSAGE, { function: path });
  }

  const checked = await preflight(ctx, caller, kind, path, args, readOnly);
  if ("response" in checked) return checked.response;

  // `/run` aceita qualquer tipo. Sem entrada no catálogo o gateway não sabe o
  // que `path` é, então para tokens somente leitura força o endpoint de
  // query: o Convex se recusa a executar mutation/action ali, e isso vira o
  // erro de somente leitura abaixo. Tokens de acesso total mantêm `/api/run`.
  if (readOnly && kind === "run") {
    kind = "query";
  }

  const { token } = await mintToken(caller);
  const endpoint =
    kind === "run"
      ? `${deploymentUrl()}/api/run/${path.replace(":", "/")}`
      : `${deploymentUrl()}/api/${kind}`;
  const body = kind === "run" ? { args, format: "json" } : { path, args, format: "json" };

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  let result: ConvexFunctionResult;
  try {
    result = (await upstream.json()) as ConvexFunctionResult;
  } catch {
    throw new ApiError("INTERNAL_ERROR", `Unexpected response from deployment (${upstream.status})`);
  }

  if (result.status === "success") {
    return json({ data: result.value ?? null });
  }

  return await translateFunctionError(ctx, caller, {
    result,
    upstreamStatus: upstream.status,
    path,
    readOnly,
  });
}

/**
 * Mapeia uma falha do upstream para um dos códigos documentados:
 *   NOT_FOUND         o caminho não existe (com sugestões)
 *   VALIDATION_ERROR  argumentos rejeitados pelos validadores da função
 *   FORBIDDEN         a função negou a role/permissão do dono
 *   UNAUTHORIZED      token somente leitura tentou gravar
 *   UNAUTHENTICATED   token revogado entre a verificação e a execução
 *   <código ConvexError> erros estruturados mantêm o próprio código
 *   FUNCTION_ERROR    qualquer outra coisa lançada dentro da função
 */
async function translateFunctionError(
  ctx: ActionCtx,
  caller: AuthenticatedCaller,
  input: { result: ConvexFunctionResult; upstreamStatus: number; path: string; readOnly: boolean }
): Promise<Response> {
  const { result, upstreamStatus, path, readOnly } = input;
  const rawMessage = result.errorMessage ?? result.message ?? "";
  const message = cleanFunctionMessage(rawMessage);
  const data =
    result.errorData !== null && typeof result.errorData === "object"
      ? (result.errorData as { code?: string; message?: string; [key: string]: unknown })
      : null;

  if (
    upstreamStatus === 404 ||
    /Could not find (?:public )?function/i.test(message) ||
    /^(?:NotFound|FunctionNotFound)$/i.test(result.code ?? "")
  ) {
    let catalog: CatalogEntry[] | null = null;
    try {
      catalog = await loadCatalog(ctx, caller);
    } catch (error) {
      console.error("[api/v1] catalog lookup failed", error instanceof Error ? error.message : error);
    }
    return notFoundResponse(path, catalog);
  }

  if (readOnly && /Trying to execute .* as Query, but it is defined as/i.test(message)) {
    return errorResponse("UNAUTHORIZED", READ_ONLY_MESSAGE, { function: path });
  }

  // O deployment não reconheceu o JWT que o próprio gateway emitiu: o provider
  // `customJwt` de auth.config.ts não está no deployment (deploy antigo) ou o
  // issuer não bate com CONVEX_SITE_URL. Não é erro da função nem do cliente.
  if (/No auth provider found matching the given token/i.test(rawMessage)) {
    return errorResponse(
      "NOT_CONFIGURED",
      `The deployment rejected the API's own JWT: auth.config.ts has no customJwt provider for issuer ${getApiTokenIssuer()}. Redeploy the backend (npx convex deploy) so the provider is registered.`,
      { function: path, issuer: getApiTokenIssuer() }
    );
  }

  // O Convex rejeita args que falham nos validadores antes do handler rodar;
  // isso é erro do cliente, não falha genérica da função.
  const argMatch = rawMessage.match(/ArgumentValidationError:\s*([\s\S]*)$/);
  if (argMatch) {
    const parsed = parseValidationError(argMatch[1]!, path);
    return errorResponse("VALIDATION_ERROR", parsed.message, parsed.details);
  }

  // Erros estruturados (ConvexError({ code, message })).
  if (data && typeof data.code === "string") {
    const appMessage = typeof data.message === "string" ? data.message : message;
    const { code: _code, message: _message, ...rest } = data;
    const code = data.code in STATUS_BY_CODE ? (data.code as ApiErrorCode) : "FUNCTION_ERROR";
    return errorResponse(code, appMessage || "Function call failed", {
      function: path,
      ...(code === "FUNCTION_ERROR" ? { code: data.code } : {}),
      ...rest,
    });
  }
  if (typeof result.errorData === "string" && result.errorData) {
    return errorResponse("FUNCTION_ERROR", result.errorData, { function: path });
  }

  // Mensagens fixas de negação de acesso deste backend (visíveis em dev).
  const known = message ? codeFromMessage(message) : null;
  if (known) return errorResponse(known, message, { function: path });

  // Produção troca mensagens de `Error` comum por "[Request ID: …] Server
  // Error". Dizer isso é melhor do que não devolver nada.
  const redacted = rawMessage.match(/^\[Request ID: ([^\]]+)\] Server Error/);
  if (!message && redacted) {
    return errorResponse(
      "FUNCTION_ERROR",
      `${path} threw an error whose message this deployment redacts (plain Error in production). The arguments passed validation, so this is usually a business rule (record not found, duplicate, state not allowed). Look up request ID ${redacted[1]} in the Convex logs.`,
      { function: path, requestId: redacted[1], redacted: true }
    );
  }

  return errorResponse("FUNCTION_ERROR", message || `${path} failed without a message.`, {
    function: path,
  });
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be a JSON object.");
  }
}

function readArgs(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError("VALIDATION_ERROR", "`args` must be a JSON object.");
  }
  return value as Record<string, unknown>;
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
      { role: caller.user.role }
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
      user: { role: caller.user.role, department: caller.user.department },
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
