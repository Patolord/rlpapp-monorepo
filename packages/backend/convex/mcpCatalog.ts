import { v } from "convex/values";
import type { Doc, TableNames } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { STAFF_ROLES, hasPermission, type Permission } from "./lib/rbac";
import { staffQuery } from "./lib/rbac";
import schema from "./schema";
import {
  ACCESS_HINTS,
  MODULES,
  NODE_ACTIONS,
  type AccessHint,
} from "./mcp/catalog.generated";

/**
 * Catálogo das funções públicas deste backend, consumido pelo servidor MCP
 * (apps/web/src/lib/mcp) para montar as ferramentas de um agente e pela API
 * HTTP (`/api/v1/functions`, convex/gateway/v1.ts).
 *
 * Percorre o registro de módulos gerado e lê o validador de argumentos de cada
 * função registrada direto do objeto (`exportArgs()`, o mesmo que
 * `npx convex function-spec` usa), então o catálogo nunca diverge do que o
 * deployment valida. O requisito de acesso vem de `ACCESS_HINTS`, inferido do
 * wrapper RBAC pelo `scripts/generate-mcp-catalog.mjs`, e é avaliado aqui para
 * o usuário que pergunta (`allowed`), para que o MCP só exponha o que o dono do
 * token consegue chamar.
 *
 * A query não toca tabelas, então o Convex a mantém em cache até o próximo
 * deploy.
 */

export type FunctionType = "query" | "mutation" | "action";

/** JSON produzido por `exportArgs()` / `exportReturns()`. */
export type ValidatorJson =
  | {
      type:
        | "string"
        | "number"
        | "boolean"
        | "null"
        | "any"
        | "bytes"
        | "int64"
        | "bigint";
    }
  | { type: "id"; tableName: string }
  | { type: "literal"; value: string | number | boolean }
  | { type: "array"; value: ValidatorJson }
  | { type: "union"; value: ValidatorJson[] }
  | { type: "record"; keys: ValidatorJson; values: ValidatorJson }
  | {
      type: "object";
      value: Record<string, { fieldType: ValidatorJson; optional: boolean }>;
    };

export interface CatalogEntry {
  /** `modulo:funcao`, ex.: `projects:create`. */
  path: string;
  module: string;
  name: string;
  type: FunctionType;
  access: AccessHint;
  /** Se o usuário que consultou o catálogo pode chamar a função. */
  allowed: boolean;
  /** `{ a: string, b?: number }`, ou `any` quando o validador não é legível. */
  signature: string;
  /** Validador bruto dos argumentos; `null` para actions em módulos Node. */
  argsValidator: ValidatorJson | null;
}

interface RegisteredFunction {
  isPublic?: boolean;
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  exportArgs?: () => string;
}

function typeOf(fn: RegisteredFunction): FunctionType | null {
  if (fn.isQuery) return "query";
  if (fn.isMutation) return "mutation";
  if (fn.isAction) return "action";
  return null;
}

function parseValidator(read: (() => string) | undefined): ValidatorJson | null {
  if (!read) return null;
  try {
    return JSON.parse(read()) as ValidatorJson | null;
  } catch {
    // O Convex lança quando o validador é indefinido (import circular); uma
    // função quebrada não pode derrubar o catálogo inteiro.
    return null;
  }
}

/** Assinatura compacta estilo TypeScript, legível por agentes. */
export function signatureOf(validator: ValidatorJson): string {
  switch (validator.type) {
    case "id":
      return `Id<${validator.tableName}>`;
    case "literal":
      return JSON.stringify(validator.value);
    case "array":
      return `${signatureOf(validator.value)}[]`;
    case "union":
      return validator.value.map(signatureOf).join(" | ");
    case "record":
      return `Record<${signatureOf(validator.keys)}, ${signatureOf(validator.values)}>`;
    case "object": {
      const entries = Object.entries(validator.value).map(
        ([name, field]) =>
          `${name}${field.optional ? "?" : ""}: ${signatureOf(field.fieldType)}`
      );
      return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
    }
    case "bigint":
      return "int64";
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "any":
    case "bytes":
    case "int64":
      return validator.type;
  }
}

export function isAllowed(user: Doc<"users">, access: AccessHint): boolean {
  switch (access.kind) {
    case "public":
    case "authenticated":
    case "staff":
    case "unknown":
      // Sem permissão específica declarada: a própria função decide. O
      // catálogo só é servido a usuários internos (staffQuery), então
      // "staff" já está satisfeito.
      return true;
    case "permission":
      return hasPermission(user, access.permission as Permission);
    case "anyPermission":
      return access.permissions.some((permission) =>
        hasPermission(user, permission as Permission)
      );
  }
}

export function buildCatalog(user: Doc<"users">): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const [module, exports] of Object.entries(MODULES)) {
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function") continue;
      const fn = value as unknown as RegisteredFunction;
      if (!fn.isPublic) continue;
      const type = typeOf(fn);
      if (!type) continue;

      const path = `${module}:${name}`;
      const access = ACCESS_HINTS[path] ?? { kind: "unknown" };
      const argsValidator = parseValidator(fn.exportArgs);
      entries.push({
        path,
        module,
        name,
        type,
        access,
        allowed: isAllowed(user, access),
        signature: argsValidator ? signatureOf(argsValidator) : "any",
        argsValidator,
      });
    }
  }

  for (const path of NODE_ACTIONS) {
    const separator = path.indexOf(":");
    const access = ACCESS_HINTS[path] ?? { kind: "unknown" };
    entries.push({
      path,
      module: path.slice(0, separator),
      name: path.slice(separator + 1),
      type: "action",
      access,
      allowed: isAllowed(user, access),
      signature: "any",
      argsValidator: null,
    });
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

const accessHintValidator = v.union(
  v.object({ kind: v.literal("public") }),
  v.object({ kind: v.literal("authenticated") }),
  v.object({ kind: v.literal("staff") }),
  v.object({ kind: v.literal("permission"), permission: v.string() }),
  v.object({
    kind: v.literal("anyPermission"),
    permissions: v.array(v.string()),
  }),
  v.object({ kind: v.literal("unknown") })
);

export const catalogEntryValidator = v.object({
  path: v.string(),
  module: v.string(),
  name: v.string(),
  type: v.union(
    v.literal("query"),
    v.literal("mutation"),
    v.literal("action")
  ),
  access: accessHintValidator,
  allowed: v.boolean(),
  signature: v.string(),
  argsValidator: v.any(),
});

/** Catálogo completo, com `allowed` avaliado para o usuário atual. */
export const list = staffQuery({
  args: {},
  returns: v.array(catalogEntryValidator),
  handler: async (ctx) => buildCatalog(ctx.user),
});

/**
 * Catálogo avaliado para o dono de um token de agente, usado pelo gateway
 * HTTP (que autentica pelo token, não por identidade do Convex). `null`
 * quando o usuário não existe ou não é interno.
 */
export const listForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.array(catalogEntryValidator), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || !user.isActive || !STAFF_ROLES.includes(user.role)) return null;
    return buildCatalog(user);
  },
});

const SCHEMA_TABLES = Object.keys(schema.tables) as TableNames[];

/**
 * Confere se cada ID coletado por `validateArgs` (gateway/validate.ts)
 * pertence a uma das tabelas que o validador aceita. `normalizeId` só
 * decodifica a string (não lê documento), então é barato e cacheável. Para
 * uma divergência, informa a tabela real do ID, ou `null` quando a string
 * não é um ID deste deployment.
 */
export const checkIds = internalQuery({
  args: {
    ids: v.array(
      v.object({ field: v.string(), tables: v.array(v.string()), value: v.string() })
    ),
  },
  returns: v.array(
    v.object({
      field: v.string(),
      ok: v.boolean(),
      actualTable: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    return args.ids.map(({ field, tables, value }) => {
      const ok = tables.some(
        (table) => ctx.db.normalizeId(table as TableNames, value) !== null
      );
      if (ok) return { field, ok: true, actualTable: null };
      const actualTable =
        SCHEMA_TABLES.find((table) => ctx.db.normalizeId(table, value) !== null) ??
        null;
      return { field, ok: false, actualTable };
    });
  },
});
