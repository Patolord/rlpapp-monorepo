import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { AGENT_TOKEN_CANNOT_MANAGE_TOKENS_MESSAGE } from "../lib/agentTokens";
import type { CatalogEntry } from "../mcp/catalog";
import type { AuthenticatedCaller } from "./callerAuth";
import { errorResponse } from "./responses";
import { suggestPaths, validateArgs, type ArgsIssue, type IdCheck } from "./validate";

// Catálogo de funções (mcpCatalog) e checagens feitas antes de chamar o deployment.

export type FunctionKind = "query" | "mutation" | "action" | "run";

export const READ_ONLY_MESSAGE =
  "This agent token is read-only. Create a token with full_access to run mutations or actions.";

/**
 * Módulos que a API nunca executa, mesmo com acesso total: gestão de tokens
 * exige sessão humana (um token vazado não pode se perpetuar criando outro) e
 * o catálogo já é servido por `/api/v1/functions`.
 */
export const BLOCKED_MODULES: ReadonlySet<string> = new Set(["agentTokens", "mcpCatalog"]);

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** `null` quando o dono do token não é usuário interno (sem catálogo). */
export async function loadCatalog(
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
export function notFoundResponse(path: string, catalog: CatalogEntry[] | null): Response {
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
export async function preflight(
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
        { function: path, roles: caller.user.roles }
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
        `${path} ${accessDescription(entry)}; the token owner (roles: ${
          caller.user.roles.join(", ") || "none"
        }) does not have it.`,
        { function: path, access: entry.access, roles: caller.user.roles }
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
