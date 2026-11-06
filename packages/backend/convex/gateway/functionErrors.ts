import type { ActionCtx } from "../_generated/server";
import {
  AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE,
  READ_ONLY_AGENT_TOKEN_MESSAGE,
  REVOKED_AGENT_TOKEN_MESSAGE,
} from "../lib/agentTokens";
import { getApiTokenIssuer } from "../lib/apiCrypto";
import type { CatalogEntry } from "../mcp/catalog";
import type { AuthenticatedCaller } from "./callerAuth";
import { READ_ONLY_MESSAGE, loadCatalog, notFoundResponse } from "./functionCatalog";
import { STATUS_BY_CODE, errorResponse, type ApiErrorCode } from "./responses";

export interface ConvexFunctionResult {
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
export async function translateFunctionError(
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
