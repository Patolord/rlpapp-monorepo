import { api } from "@rlpapp/backend/convex/_generated/api";

import type { McpPrincipal } from "./auth";
import { CATALOG_CACHE_MS } from "./constants";
import { createDelegatedConvexClient } from "./convex";

// Espelho dos tipos de packages/backend/convex/mcpCatalog.ts (a fonte é o
// validador `catalogEntryValidator` daquela query).
export type FunctionType = "query" | "mutation" | "action";

/** JSON produzido por `exportArgs()` do Convex. */
export type ValidatorJson =
  | {
      type: "string" | "number" | "boolean" | "null" | "any" | "bytes" | "int64" | "bigint";
    }
  | { type: "id"; tableName: string }
  | { type: "literal"; value: string | number | boolean }
  | { type: "array"; value: ValidatorJson }
  | { type: "union"; value: ValidatorJson[] }
  | { type: "record"; keys: ValidatorJson; values: ValidatorJson }
  | { type: "object"; value: Record<string, ValidatorField> };

export type ValidatorField = { fieldType: ValidatorJson; optional: boolean };

export type AccessHint =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "staff" }
  | { kind: "permission"; permission: string }
  | { kind: "anyPermission"; permissions: string[] }
  | { kind: "unknown" };

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

/**
 * Catálogo das funções públicas do backend, com `allowed` já avaliado para o
 * usuário da conexão (packages/backend convex/mcpCatalog.ts). As ferramentas
 * do manifesto são registradas a partir dele: o schema de entrada vem do
 * validador real da função, e funções que o usuário não pode chamar nem
 * aparecem para o agente.
 */
export type CatalogLoader = (principal: McpPrincipal) => Promise<CatalogEntry[]>;

type CacheEntry = { entries: CatalogEntry[]; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function resetCatalogCacheForTests(): void {
  cache.clear();
}

/** Carrega o catálogo pelo Convex, com cache curto por usuário. */
export const loadCatalog: CatalogLoader = async (principal) => {
  const now = Date.now();
  const cached = cache.get(principal.userId);
  if (cached && cached.expiresAt > now) return cached.entries;

  const client = await createDelegatedConvexClient(principal);
  const entries = (await client.query(api.mcpCatalog.list, {})) as CatalogEntry[];
  cache.set(principal.userId, { entries, expiresAt: now + CATALOG_CACHE_MS });
  return entries;
};

export class Catalog {
  private readonly byPath = new Map<string, CatalogEntry>();

  constructor(entries: readonly CatalogEntry[]) {
    for (const entry of entries) this.byPath.set(entry.path, entry);
  }

  get size(): number {
    return this.byPath.size;
  }

  get(path: string): CatalogEntry | undefined {
    return this.byPath.get(normalizePath(path));
  }

  all(): CatalogEntry[] {
    return [...this.byPath.values()];
  }

  /** Busca por palavras-chave no caminho e na assinatura. */
  search(term: string, limit = 25): CatalogEntry[] {
    const words = term
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (words.length === 0) return this.all().slice(0, limit);
    const scored: Array<{ entry: CatalogEntry; score: number }> = [];
    for (const entry of this.byPath.values()) {
      const haystack = `${entry.path} ${entry.signature}`.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (entry.path.toLowerCase().includes(word)) score += 2;
        else if (haystack.includes(word)) score += 1;
      }
      if (score > 0) scored.push({ entry, score });
    }
    return scored
      .sort(
        (a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path)
      )
      .slice(0, limit)
      .map((item) => item.entry);
  }
}

/** Aceita `modulo:funcao`, `modulo/funcao` e `modulo.funcao`. */
export function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes(":")) return trimmed.replace(/\.(js|ts):/, ":");
  const separator = trimmed.includes(".") ? "." : "/";
  const index = trimmed.lastIndexOf(separator);
  if (index <= 0 || index === trimmed.length - 1) return trimmed;
  return `${trimmed.slice(0, index)}:${trimmed.slice(index + 1)}`;
}
