#!/usr/bin/env node
/**
 * Gera `convex/mcp/catalog.generated.ts`, a entrada do catálogo de funções
 * servido por `mcpCatalog.list` ao servidor MCP (apps/web). Ver README → "MCP".
 *
 * Produz duas coisas:
 *
 *   1. Um registro de módulos (`MODULES`): um `import * as` por módulo Convex
 *      de nível superior, para que a query do catálogo leia os validadores de
 *      argumentos *ao vivo* de cada função registrada através do próprio
 *      `exportArgs()` do Convex. A lista de argumentos nunca fica defasada
 *      quando um validador muda — só quando um módulo é adicionado, por isso
 *      este script roda antes de `convex dev` / `convex deploy`.
 *
 *   2. Um mapa de acesso (`ACCESS_HINTS`): para cada função exportada, o
 *      wrapper RBAC usado (`engineeringQuery`, `permissionMutation("rh.write")`,
 *      ...) traduzido para a permissão de lib/rbac.ts que ele exige. O Convex
 *      não informa isso em tempo de execução, então é derivado do código.
 *
 * Uso: node scripts/generate-mcp-catalog.mjs [--check]
 *   --check  sai com 1 se o arquivo commitado estiver desatualizado (CI).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const convexDir = resolve(here, "../convex");
const outFile = join(convexDir, "mcp/catalog.generated.ts");

// Só módulos de nível superior exportam funções públicas neste backend;
// lib/, model/ e schema/ são helpers e mcp/ é a saída deste script.
// migrations.ts fica de fora: backfills de uso único rodam pelo dashboard ou
// `npx convex run`, nunca por um agente (MCP ou /api/v1).
const EXCLUDED_FILES = new Set([
  "migrations.ts",
  "schema.ts",
  "http.ts",
  "crons.ts",
  "convex.config.ts",
  "auth.config.ts",
  "mcpCatalog.ts",
]);

function listModules() {
  const files = [];
  for (const entry of readdirSync(convexDir)) {
    const full = join(convexDir, entry);
    if (statSync(full).isDirectory()) continue;
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
    if (entry.startsWith("_") || EXCLUDED_FILES.has(entry)) continue;
    files.push(entry);
  }
  return files.sort();
}

function usesNodeRuntime(source) {
  for (const line of source.slice(0, 2000).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }
    return /^["']use node["'];?$/.test(trimmed);
  }
  return false;
}

// Wrapper RBAC → permissão exigida. Os wrappers base ficam aqui; os nomeados
// por funcionalidade são lidos de lib/rbac.ts
// (`export const nome = permissionQuery("x");` ou anyPermission*).
const WRAPPER_HINTS = {
  query: { kind: "public" },
  mutation: { kind: "public" },
  action: { kind: "public" },
  authedQuery: { kind: "authenticated" },
  authedMutation: { kind: "authenticated" },
  staffQuery: { kind: "staff" },
  staffMutation: { kind: "staff" },
};

/** Lista de permissões entre aspas: `"a", "b"` → ["a", "b"]. */
function parsePermissionArgs(raw) {
  return [...(raw ?? "").matchAll(/["']([\w.]+)["']/g)].map((m) => m[1]);
}

function hintFromFactory(factory, rawArgs) {
  const permissions = parsePermissionArgs(rawArgs);
  if (permissions.length === 0) return { kind: "unknown" };
  if (/^permission(Query|Mutation)$/.test(factory)) {
    return { kind: "permission", permission: permissions[0] };
  }
  return { kind: "anyPermission", permissions };
}

const FACTORY_RE = /^(permission|anyPermission)(Query|Mutation)$/;
const NAMED_WRAPPER_RE =
  /^export const (\w+)\s*=\s*((?:any)?[pP]ermission(?:Query|Mutation))\(([^)]*)\)\s*;/gm;
{
  const rbacSource = readFileSync(join(convexDir, "lib/rbac.ts"), "utf8");
  let named;
  while ((named = NAMED_WRAPPER_RE.exec(rbacSource)) !== null) {
    const [, name, factory, rawArgs] = named;
    if (!FACTORY_RE.test(factory)) continue;
    WRAPPER_HINTS[name] = hintFromFactory(factory, rawArgs);
  }
}

/**
 * `export const nome = wrapper(` ou `export const nome = permissionQuery("x")(`
 * (também anyPermissionQuery("a", "b")). A formatação é consistente (uma
 * exportação por declaração no início da linha), então uma regex por linha
 * basta.
 */
const EXPORT_RE =
  /^export const (\w+)\s*(?::[^=]+?)?=\s*(\w+)(?:\(((?:\s*["'][\w.]+["']\s*,?)+)\))?\s*(?:<[^>]*>)?\s*\(/gm;

function hintFor(wrapper, rawArgs) {
  if (FACTORY_RE.test(wrapper)) return hintFromFactory(wrapper, rawArgs);
  return WRAPPER_HINTS[wrapper] ?? { kind: "unknown" };
}

const modules = [];
const nodeActions = [];
const accessHints = {};

for (const file of listModules()) {
  const source = readFileSync(join(convexDir, file), "utf8");
  const modulePath = file.replace(/\.ts$/, "");
  const isNode = usesNodeRuntime(source);
  let hasExports = false;
  EXPORT_RE.lastIndex = 0;
  let match;
  while ((match = EXPORT_RE.exec(source)) !== null) {
    const [, name, wrapper, rawArgs] = match;
    // internal* nunca entra no catálogo; validadores (v.object(...)) e
    // helpers não são wrappers de função.
    if (wrapper.startsWith("internal")) continue;
    if (!(wrapper in WRAPPER_HINTS) && !FACTORY_RE.test(wrapper)) {
      continue;
    }
    hasExports = true;
    const path = `${modulePath}:${name}`;
    accessHints[path] = hintFor(wrapper, rawArgs);
    if (isNode && /action/i.test(wrapper)) nodeActions.push(path);
  }
  if (!hasExports) continue;
  // Módulos "use node" não podem ser importados pelo runtime padrão: suas
  // actions públicas entram só pelo nome, sem validadores.
  if (!isNode) modules.push(modulePath);
}

const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const literal = (obj) =>
  `{ ${Object.entries(obj)
    .map(([k, v]) => `${key(k)}: ${JSON.stringify(v)}`)
    .join(", ")} }`;

const importLines = modules.map((m, i) => `import * as m${i} from "../${m}";`).join("\n");
const moduleEntries = modules.map((m, i) => `  ${key(m)}: m${i},`).join("\n");
const hintEntries = Object.entries(accessHints)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, hint]) => `  ${key(path)}: ${literal(hint)},`)
  .join("\n");
const nodeEntries = nodeActions
  .sort()
  .map((path) => `  "${path}",`)
  .join("\n");

const output = `// GERADO AUTOMATICAMENTE por scripts/generate-mcp-catalog.mjs — não edite à mão.
// Regenere com \`pnpm --filter @rlpapp/backend generate:catalog\`
// (também roda antes de \`convex dev\` / \`convex deploy\`).
//
// ${modules.length} módulos, ${Object.keys(accessHints).length} funções públicas.
${importLines}

export type AccessHint =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "staff" }
  | { kind: "permission"; permission: string }
  | { kind: "anyPermission"; permissions: string[] }
  | { kind: "unknown" };

export const MODULES: Record<string, Record<string, unknown>> = {
${moduleEntries}
};

export const ACCESS_HINTS: Record<string, AccessHint> = {
${hintEntries}
};

/** Actions públicas de módulos \`"use node"\` (validadores não legíveis aqui). */
export const NODE_ACTIONS: readonly string[] = [
${nodeEntries}
];
`;

if (process.argv.includes("--check")) {
  const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  if (current !== output) {
    console.error(`${relative(process.cwd(), outFile)} está desatualizado; rode generate:catalog.`);
    process.exit(1);
  }
  console.log("catálogo MCP atualizado");
} else {
  writeFileSync(outFile, output);
  console.log(
    `Escreveu ${modules.length} módulos / ${Object.keys(accessHints).length} funções em ${relative(process.cwd(), outFile)}`
  );
}
