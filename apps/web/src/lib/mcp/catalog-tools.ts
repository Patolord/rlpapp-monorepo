import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { McpPrincipal } from "./auth";
import { Catalog, type CatalogEntry, normalizePath } from "./catalog";
import { MAX_TOOL_RESULT_CHARS } from "./constants";
import { argsToInputSchema, describeValidator } from "./convex-schema";
import type { ConvexCaller, FunctionKind } from "./convex";
import { describeToolError } from "./errors";
import { TOOLS, isDestructive, type ToolSpec } from "./manifest";

/**
 * Ferramentas derivadas do catálogo de funções: as curadas no manifesto, mais
 * `whoami`, `search_functions` e (opcional) `call_function`.
 *
 * Tudo aqui depende do principal da conexão: um token `read_only` só vê
 * queries, e funções que o usuário não pode chamar (`allowed: false`) não são
 * registradas — o agente nunca é tentado a chamar o que vai falhar.
 */

export type CallRecord = {
  tool: string;
  functionPath?: string;
  outcome: "success" | "error";
  errorMessage?: string;
  durationMs: number;
};

export type CallRecorder = (
  principal: McpPrincipal,
  record: CallRecord
) => Promise<void>;

export type RegisterCatalogToolsOptions = {
  principal: McpPrincipal;
  catalog: readonly CatalogEntry[];
  caller: ConvexCaller;
  /** Expõe `call_function` (qualquer função pública por nome). Padrão: não. */
  allowRawCalls?: boolean;
  /** Nomes já registrados por outras partes do servidor (não duplicar). */
  reservedNames?: ReadonlySet<string>;
  recordCall?: CallRecorder;
  log?: (message: string) => void;
};

export type RegisteredCatalogTools = {
  registered: string[];
  skipped: Array<{ name: string; reason: string }>;
};

function textResult(value: unknown) {
  let text = JSON.stringify(value ?? null, null, 2);
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    text = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n[truncated: result was ${text.length} characters; narrow the request with filters, pagination or ids]`;
  }
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Registra a chamada no Convex sem nunca deixar a ferramenta falhar por isso. */
async function safeRecord(
  options: RegisterCatalogToolsOptions,
  record: CallRecord
): Promise<void> {
  if (!options.recordCall || !options.principal.agentToken) return;
  try {
    await options.recordCall(options.principal, record);
  } catch (error) {
    (options.log ?? console.error)(
      `[mcp] failed to record call ${record.tool}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function runCatalogCall(
  options: RegisterCatalogToolsOptions,
  toolName: string,
  kind: FunctionKind,
  path: string,
  args: Record<string, unknown>
) {
  const startedAt = Date.now();
  try {
    const data = await options.caller.call(kind, path, args);
    await safeRecord(options, {
      tool: toolName,
      functionPath: path,
      outcome: "success",
      durationMs: Date.now() - startedAt,
    });
    return textResult(data);
  } catch (error) {
    const message = describeToolError(error);
    await safeRecord(options, {
      tool: toolName,
      functionPath: path,
      outcome: "error",
      errorMessage: message,
      durationMs: Date.now() - startedAt,
    });
    return errorResult(message);
  }
}

function registerCuratedTool(
  server: McpServer,
  options: RegisterCatalogToolsOptions,
  spec: ToolSpec,
  entry: CatalogEntry
): void {
  const isQuery = entry.type === "query";
  const serverArgKeys = spec.serverArgs ? Object.keys(spec.serverArgs()) : [];
  const inputSchema = argsToInputSchema(entry.argsValidator, {
    fieldDescriptions: spec.fieldDescriptions,
    omit: serverArgKeys,
  });

  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema,
      annotations: {
        title: spec.title,
        readOnlyHint: isQuery,
        destructiveHint: isQuery ? false : isDestructive(spec),
        idempotentHint: isQuery ? true : (spec.idempotent ?? false),
        openWorldHint: false,
      },
    },
    async (args) => {
      const merged = {
        ...(args as Record<string, unknown>),
        ...spec.serverArgs?.(),
      };
      return await runCatalogCall(options, spec.name, entry.type, entry.path, merged);
    }
  );
}

export function buildInstructions(
  principal: McpPrincipal,
  allowRawCalls: boolean
): string {
  const who = principal.user
    ? `${principal.user.name} (${principal.user.email ?? principal.user.username ?? principal.userId}, role ${principal.user.role}${principal.user.department ? `, department ${principal.user.department}` : ""})`
    : principal.userId;
  const token = principal.agentToken
    ? ` via agent token "${principal.agentToken.name}" with ${principal.agentToken.permission === "read_only" ? "READ-ONLY" : "full-access"} permission`
    : " via OAuth";
  const lines = [
    `You are connected to the RLP Engenharia workspace as ${who}${token}.`,
    "",
    "Conventions:",
    "- Every record has a Convex document id (an opaque string). Resolve names to ids with list_*/get_*/suggest_* tools before calling update/delete tools.",
    "- Dates and times are Unix epoch milliseconds unless a field says YYYY-MM-DD. Money is in BRL cents (integer).",
    "- Projects are called obras; measurements are medições. Hierarchy: project → tower → floor → environment → planned equipment (projectEquipment); physical equipment registered in the field links to a planned item.",
    "- Tools act as the connected user with their role; the backend enforces department permissions and the app's audit log records writes.",
    "- Tools marked destructive (delete_*, archive_*) cannot be undone from here; confirm with the user before calling them.",
  ];
  if (principal.agentToken?.permission === "read_only") {
    lines.push("- This token is read-only: only query tools are available. Writes are rejected.");
  }
  lines.push(
    allowRawCalls
      ? "- `search_functions` + `call_function` reach any public backend function when no curated tool fits. Check the signature from search_functions first."
      : "- `search_functions` shows the full backend catalog for reference; only the registered tools can be called."
  );
  return lines.join("\n");
}

export function registerCatalogTools(
  server: McpServer,
  options: RegisterCatalogToolsOptions
): RegisteredCatalogTools {
  const { principal } = options;
  const allowRawCalls = options.allowRawCalls ?? false;
  const reserved = options.reservedNames ?? new Set<string>();
  const readOnly = principal.agentToken?.permission === "read_only";
  const catalog = new Catalog(options.catalog);
  const registered: string[] = [];
  const skipped: RegisteredCatalogTools["skipped"] = [];
  const curatedByFunction = new Map<string, string>();

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Identity behind this connection: user, role, department and (when applicable) the agent token and its permission level.",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    async () =>
      textResult({
        user: principal.user ?? { clerkId: principal.userId },
        agent_token: principal.agentToken ?? null,
        auth: principal.agentToken ? "agent_token" : "oauth",
      })
  );
  registered.push("whoami");

  for (const spec of TOOLS) {
    if (reserved.has(spec.name)) {
      skipped.push({ name: spec.name, reason: "name reserved by a built-in tool" });
      continue;
    }
    const entry = catalog.get(spec.function);
    if (!entry) {
      skipped.push({ name: spec.name, reason: `function ${spec.function} not in catalog` });
      continue;
    }
    curatedByFunction.set(entry.path, spec.name);
    if (!entry.allowed) {
      skipped.push({ name: spec.name, reason: "not allowed for this user" });
      continue;
    }
    if (readOnly && entry.type !== "query") {
      skipped.push({ name: spec.name, reason: "agent token is read-only" });
      continue;
    }
    registerCuratedTool(server, options, spec, entry);
    registered.push(spec.name);
  }

  server.registerTool(
    "search_functions",
    {
      title: "Search backend functions",
      description:
        "Keyword search over every public backend function (queries, mutations, actions) with argument signatures and whether this connection may call it. Use it to discover capabilities that have no dedicated tool; results name the curated tool when one exists.",
      inputSchema: z.object({
        query: z.string().describe("Keywords, e.g. 'medicao contract' or 'inventory balance'."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, limit }) => {
      const matches = catalog.search(query, limit ?? 25).map((entry) => {
        const tool = curatedByFunction.get(entry.path);
        const callable =
          entry.allowed && (!readOnly || entry.type === "query") && (allowRawCalls || Boolean(tool));
        return {
          function: entry.path,
          kind: entry.type,
          args: entry.argsValidator ? describeValidator(entry.argsValidator) : entry.signature,
          access: entry.access,
          allowed_for_user: entry.allowed,
          ...(tool ? { tool } : {}),
          callable,
          ...(!callable && !allowRawCalls && !tool
            ? { note: "not callable: no curated tool and raw calls are disabled (MCP_ALLOW_RAW_CALLS)" }
            : {}),
        };
      });
      return textResult({ total_public_functions: catalog.size, matches });
    }
  );
  registered.push("search_functions");

  if (allowRawCalls) {
    server.registerTool(
      "call_function",
      {
        title: "Call any backend function",
        description:
          "Escape hatch: invoke any public backend function by path (e.g. `towers:list`) with a JSON args object. Look the function up with search_functions first to get the exact argument names and types. Mutations and actions modify data as the connected user.",
        inputSchema: z.object({
          path: z.string().describe("Function path `module:function`, e.g. `customers:create`."),
          args: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Arguments object matching the function's signature."),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ path, args }) => {
        const entry = catalog.get(path);
        if (!entry) {
          return errorResult(
            `No public function named "${normalizePath(path)}". Use search_functions to find the right path.`
          );
        }
        if (!entry.allowed) {
          return errorResult(
            `"${entry.path}" is not allowed for this user (${JSON.stringify(entry.access)}).`
          );
        }
        if (readOnly && entry.type !== "query") {
          return errorResult(`"${entry.path}" is a ${entry.type}; this agent token is read-only.`);
        }
        const inputSchema = argsToInputSchema(entry.argsValidator);
        const parsed = inputSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return errorResult(
            `Invalid arguments for ${entry.path} (expected ${entry.signature}): ${parsed.error.message}`
          );
        }
        return await runCatalogCall(
          options,
          "call_function",
          entry.type,
          entry.path,
          parsed.data as Record<string, unknown>
        );
      }
    );
    registered.push("call_function");
  }

  server.registerResource(
    "function-catalog",
    "rlp://api/functions",
    {
      title: "Backend function catalog",
      description:
        "Every public backend function with its argument signature and access requirement, as seen by the connected user.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const lines = catalog
        .all()
        .map(
          (entry) =>
            `${entry.type.padEnd(8)} ${entry.allowed ? " " : "x"} ${entry.path} ${entry.signature}`
        );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `# kind  allowed(x = not allowed)  path  args\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  return { registered, skipped };
}
