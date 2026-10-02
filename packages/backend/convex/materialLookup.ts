import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  describeMaterial,
  extractSkuCandidates,
  normalizeLookupQuery,
  tokenCoverage,
} from "./lib/compras/materialLookup";

const MAX_CANDIDATES = 5;
const SEARCH_LIMIT = 10;
// Read every row for an exact key (aliases/family variants are small sets) so
// inactive rows can't hide other active matches and turn "ambiguous" into "found".
const EXACT_MATCH_LIMIT = 100;

const lookupMaterialValidator = v.object({
  id: v.id("materials"),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  description: v.string(),
});

export const findMaterialResultValidator = v.union(
  v.object({
    status: v.literal("found"),
    matchedBy: v.union(
      v.literal("sku"),
      v.literal("alias"),
      v.literal("name"),
      v.literal("search")
    ),
    material: lookupMaterialValidator,
  }),
  v.object({
    status: v.literal("ambiguous"),
    candidates: v.array(lookupMaterialValidator),
  }),
  v.object({
    status: v.literal("not_found"),
    // Partial matches the caller may offer as "Talvez você queira".
    candidates: v.array(lookupMaterialValidator),
  })
);

type LookupMaterial = {
  id: Id<"materials">;
  code: string | null;
  name: string;
  description: string;
};

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
) {
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
export const findMaterial = internalQuery({
  args: { query: v.string() },
  returns: findMaterialResultValidator,
  handler: async (ctx, args) => {
    const query = normalizeLookupQuery(args.query);
    if (!query) return { status: "not_found" as const, candidates: [] };

    for (const sku of extractSkuCandidates(args.query)) {
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
  },
});
