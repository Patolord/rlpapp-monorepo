import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { normalizeText } from "../kernel/text";

export const MAX_LOOKUP_QUERY_LENGTH = 200;

// Normalized (lowercase, no accents). Longer phrases first so "qual e" wins over "qual".
const FILLER_PHRASES = [
  "descricao completa",
  "nome completo",
  "por favor",
  "me diga",
  "me passa",
  "me da",
  "me de",
  "qual e",
  "qual o",
  "qual a",
  "qual",
  "descricao",
  "codigo",
  "nome",
  "material",
  "daquela",
  "daquele",
  "aquela",
  "aquele",
  "dessa",
  "desse",
];

const LEADING_CONNECTORS = new Set([
  "de", "da", "do", "das", "dos", "o", "a", "os", "as", "e",
]);

// "com"/"sem" are kept: they flip a spec ("tubo sem costura" ≠ "tubo com costura").
const STOPWORDS = new Set([...LEADING_CONNECTORS, "para", "em", "no", "na"]);

/** "Me dá o nome completo do Isolamento de Duto?" → "isolamento de duto". */
export function normalizeLookupQuery(raw: string): string {
  const normalized = normalizeText(raw);
  let stripped = ` ${normalized} `;
  for (const phrase of FILLER_PHRASES) {
    while (stripped.includes(` ${phrase} `)) {
      stripped = stripped.replace(` ${phrase} `, " ");
    }
  }
  const words = stripped.trim().split(" ").filter(Boolean);
  while (words.length > 0 && LEADING_CONNECTORS.has(words[0]!)) words.shift();
  return words.join(" ") || normalized;
}

/** Extracts an SKU like "MAT-0234" / "mat 234" and returns the forms to try. */
export function extractSkuCandidates(raw: string): string[] {
  const match = /\bmat[-\s]?(\d+)\b/i.exec(raw);
  if (!match) return [];
  const digits = match[1]!;
  return [...new Set([`MAT-${digits}`, `MAT-${digits.padStart(6, "0")}`])];
}

function significantTokens(query: string): string[] {
  const tokens = query.split(" ").filter(Boolean);
  const significant = tokens.filter((token) => !STOPWORDS.has(token));
  return significant.length > 0 ? significant : tokens;
}

function tokenMatches(token: string, haystack: string[]): boolean {
  const singular = token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
  const isNumber = /^\d+$/.test(token);
  return haystack.some(
    (word) =>
      word === token ||
      word === singular ||
      (token.length >= 4 && word.startsWith(token)) ||
      // "3x2,5" normalizes to "3x2 5"; let the bare "5" match "5mm2" (not "50mm").
      (isNumber && word.startsWith(token) && /^[a-z]/.test(word.slice(token.length)))
  );
}

/** Fraction (0..1) of the query's significant tokens found in the candidate text. */
export function tokenCoverage(query: string, candidateText: string): number {
  const tokens = significantTokens(query);
  if (tokens.length === 0) return 0;
  const haystack = normalizeText(candidateText).split(" ");
  const hits = tokens.filter((token) => tokenMatches(token, haystack)).length;
  return hits / tokens.length;
}

export function describeMaterial(material: {
  name: string;
  variantLabel?: string;
  spec?: string;
}): string {
  return [material.name, material.variantLabel?.trim(), material.spec?.trim()]
    .filter(Boolean)
    .join(" — ");
}

// ---------------------------------------------------------------------------
// Busca determinística no catálogo (`materialLookup.findMaterial`)
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 5;
const SEARCH_LIMIT = 10;
// Read every row for an exact key (aliases/family variants are small sets) so
// inactive rows can't hide other active matches and turn "ambiguous" into "found".
const EXACT_MATCH_LIMIT = 100;

export type LookupMaterial = {
  id: Id<"materials">;
  code: string | null;
  name: string;
  description: string;
};

export type FindMaterialResult =
  | {
      status: "found";
      matchedBy: "sku" | "alias" | "name" | "search";
      material: LookupMaterial;
    }
  | { status: "ambiguous"; candidates: LookupMaterial[] }
  | { status: "not_found"; candidates: LookupMaterial[] };

function toLookupMaterial(material: Doc<"materials">): LookupMaterial {
  return {
    id: material._id,
    code: material.sku ?? null,
    name: material.name,
    description: describeMaterial(material),
  };
}

async function activeMaterials(
  ctx: QueryCtx,
  ids: Iterable<Id<"materials">>
): Promise<Doc<"materials">[]> {
  const docs = await Promise.all(
    [...new Set(ids)].map((id) => ctx.db.get("materials", id))
  );
  return docs.filter((doc): doc is Doc<"materials"> => doc?.active === true);
}

function resolve(
  materials: Doc<"materials">[],
  matchedBy: "sku" | "alias" | "name"
): FindMaterialResult {
  if (materials.length === 1) {
    return {
      status: "found" as const,
      matchedBy,
      material: toLookupMaterial(materials[0]!),
    };
  }
  return {
    status: "ambiguous" as const,
    candidates: materials.slice(0, MAX_CANDIDATES).map(toLookupMaterial),
  };
}

/**
 * Deterministic lookup: SKU → exact alias → exact family name → full-text
 * search ranked by query-token coverage. Every returned value comes from the DB.
 */
export async function findCatalogMaterial(
  ctx: QueryCtx,
  input: { query: string }
): Promise<FindMaterialResult> {
  const query = normalizeLookupQuery(input.query);
  if (!query) return { status: "not_found" as const, candidates: [] };

  for (const sku of extractSkuCandidates(input.query)) {
    const hit = await ctx.db
      .query("materials")
      .withIndex("by_sku", (q) => q.eq("sku", sku))
      .unique();
    if (hit?.active) return resolve([hit], "sku");
  }

  const aliasHits = await ctx.db
    .query("materialAliases")
    .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", query))
    .take(EXACT_MATCH_LIMIT);
  const byAlias = await activeMaterials(
    ctx,
    aliasHits.map((alias) => alias.materialId)
  );
  if (byAlias.length > 0) return resolve(byAlias, "alias");

  const family = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) => q.eq("nameNormalized", query))
    .first();
  if (family) {
    const variants = await ctx.db
      .query("materials")
      .withIndex("by_family", (q) => q.eq("familyId", family._id))
      .take(EXACT_MATCH_LIMIT);
    const byName = variants.filter((material) => material.active);
    if (byName.length > 0) return resolve(byName, "name");
  }

  const [textHits, aliasTextHits] = await Promise.all([
    ctx.db
      .query("materials")
      .withSearchIndex("search_text", (q) =>
        q.search("searchText", query).eq("active", true)
      )
      .take(SEARCH_LIMIT),
    ctx.db
      .query("materialAliases")
      .withSearchIndex("search_alias", (q) =>
        q.search("aliasNormalized", query)
      )
      .take(SEARCH_LIMIT),
  ]);
  const candidates = await activeMaterials(ctx, [
    ...textHits.map((material) => material._id),
    ...aliasTextHits.map((alias) => alias.materialId),
  ]);

  const scored = await Promise.all(
    candidates.map(async (material) => {
      const aliases = await ctx.db
        .query("materialAliases")
        .withIndex("by_material", (q) => q.eq("materialId", material._id))
        .take(50);
      const text = [
        material.searchText ?? describeMaterial(material),
        ...aliases.map((alias) => alias.aliasNormalized),
      ].join(" ");
      return { material, score: tokenCoverage(query, text) };
    })
  );
  const ranked = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const fullMatches = ranked.filter((entry) => entry.score === 1);
  if (fullMatches.length === 1) {
    return {
      status: "found" as const,
      matchedBy: "search" as const,
      material: toLookupMaterial(fullMatches[0]!.material),
    };
  }
  const toCandidates = (entries: typeof ranked) =>
    entries
      .slice(0, MAX_CANDIDATES)
      .map((entry) => toLookupMaterial(entry.material));
  if (fullMatches.length > 1) {
    return {
      status: "ambiguous" as const,
      candidates: toCandidates(fullMatches),
    };
  }
  return { status: "not_found" as const, candidates: toCandidates(ranked) };
}
