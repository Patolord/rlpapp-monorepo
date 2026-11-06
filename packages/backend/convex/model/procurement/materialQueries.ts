import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  materialMatchesSearch,
  normalizeBarcode,
  normalizeSku,
  toMaterialListRow,
} from "./catalog";
import { materialIdentityInput } from "./materialIdentity";
import { normalizeText } from "./pricing";

export type FindMaterialDuplicateCandidatesInput = {
  name: string;
  familyId?: Id<"materialFamilies">;
  variantLabel?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  unit?: string;
  dimensions?: {
    widthMm?: number;
    heightMm?: number;
    lengthMm?: number;
    thicknessMm?: number;
    diameterMm?: number;
  };
  technicalAttributes?: Array<{ key: string; value: string }>;
  excludeMaterialId?: Id<"materials">;
};

export type MaterialSuggestion = {
  _id: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  unit: string | null;
  matchType: "alias" | "name" | "sku" | "barcode";
};

function nameSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export async function listMaterialFamilies(
  ctx: QueryCtx,
  args: { activeOnly?: boolean }
) {
  const families = args.activeOnly
    ? await ctx.db
        .query("materialFamilies")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect()
    : await ctx.db.query("materialFamilies").collect();
  return families.map((family) => ({
    _id: family._id,
    name: family.name,
    nameNormalized: family.nameNormalized,
    category: family.category ?? null,
    baseUnit: family.baseUnit ?? null,
    active: family.active,
  }));
}

export async function listMaterialVariants(
  ctx: QueryCtx,
  familyId: Id<"materialFamilies">
) {
  const variants = await ctx.db
    .query("materials")
    .withIndex("by_family", (q) => q.eq("familyId", familyId))
    .collect();
  return variants.map(toMaterialListRow);
}

export async function findMaterialDuplicateCandidates(
  ctx: QueryCtx,
  args: FindMaterialDuplicateCandidatesInput
) {
  const normalizedName = normalizeText(args.name);
  let familyId = args.familyId;
  if (!familyId) {
    const family = await ctx.db
      .query("materialFamilies")
      .withIndex("by_name_normalized", (q) =>
        q.eq("nameNormalized", normalizedName)
      )
      .first();
    familyId = family?._id;
  }

  const materials = familyId
    ? await ctx.db
        .query("materials")
        .withIndex("by_family", (q) => q.eq("familyId", familyId))
        .take(25)
    : await ctx.db.query("materials").order("desc").take(100);
  const identityKey = familyId
    ? materialIdentityInput({
        familyId,
        manufacturer: args.manufacturer,
        manufacturerPartNumber: args.manufacturerPartNumber,
        unit: args.unit,
        variantLabel: args.variantLabel,
        dimensions: args.dimensions,
        technicalAttributes: args.technicalAttributes,
      })
    : null;

  return materials
    .filter((material) => material._id !== args.excludeMaterialId)
    .filter(
      (material) =>
        material.familyId === familyId ||
        normalizeText(material.name).includes(normalizedName) ||
        normalizedName.includes(normalizeText(material.name)) ||
        nameSimilarity(material.name, args.name) >= 0.6
    )
    .slice(0, 8)
    .map((material) => ({
      materialId: material._id,
      name: material.name,
      variantLabel: material.variantLabel ?? null,
      sku: material.sku ?? null,
      exact: identityKey !== null && material.identityKey === identityKey,
    }));
}

export async function listMaterials(
  ctx: QueryCtx,
  args: { search?: string; activeOnly?: boolean }
) {
  let materials = await ctx.db.query("materials").order("desc").collect();
  if (args.activeOnly) {
    materials = materials.filter((m) => m.active);
  }
  if (args.search?.trim()) {
    materials = materials.filter((m) =>
      materialMatchesSearch(m, args.search!)
    );
  }
  return materials.map(toMaterialListRow);
}

export async function listMaterialCategories(ctx: QueryCtx): Promise<string[]> {
  // eslint-disable-next-line @convex-dev/no-collect-in-query -- distinct category list; catalog size is bounded
  const materials = await ctx.db.query("materials").collect();
  const categories = new Set<string>();
  for (const material of materials) {
    const category = material.category?.trim();
    if (category) categories.add(category);
  }
  return [...categories].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
}

export async function suggestMaterials(
  ctx: QueryCtx,
  args: { term: string; limit?: number }
): Promise<MaterialSuggestion[]> {
  const term = normalizeText(args.term);
  if (!term) return [];
  const limit = args.limit ?? 8;

  const aliasHits = await ctx.db
    .query("materialAliases")
    .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", term))
    .take(limit);

  const results: MaterialSuggestion[] = [];

  for (const alias of aliasHits) {
    const m = await ctx.db.get("materials", alias.materialId);
    if (m?.active) {
      results.push({
        _id: m._id,
        name: m.name,
        variantLabel: m.variantLabel ?? null,
        sku: m.sku ?? null,
        unit: m.unit ?? null,
        matchType: "alias",
      });
    }
  }

  const skuHit = await ctx.db
    .query("materials")
    .withIndex("by_sku", (q) => q.eq("sku", normalizeSku(args.term)))
    .unique();
  if (skuHit?.active && !results.some((r) => r._id === skuHit._id)) {
    results.push({
      _id: skuHit._id,
      name: skuHit.name,
      variantLabel: skuHit.variantLabel ?? null,
      sku: skuHit.sku ?? null,
      unit: skuHit.unit ?? null,
      matchType: "sku",
    });
  }

  const barcodeHit = await ctx.db
    .query("materials")
    .withIndex("by_barcode", (q) => q.eq("barcode", normalizeBarcode(args.term)))
    .unique();
  if (
    barcodeHit?.active &&
    !results.some((r) => r._id === barcodeHit._id)
  ) {
    results.push({
      _id: barcodeHit._id,
      name: barcodeHit.name,
      variantLabel: barcodeHit.variantLabel ?? null,
      sku: barcodeHit.sku ?? null,
      unit: barcodeHit.unit ?? null,
      matchType: "barcode",
    });
  }

  const all = await ctx.db.query("materials").collect();
  for (const m of all) {
    if (!m.active) continue;
    if (results.some((r) => r._id === m._id)) continue;
    if (materialMatchesSearch(m, term)) {
      results.push({
        _id: m._id,
        name: m.name,
        variantLabel: m.variantLabel ?? null,
        sku: m.sku ?? null,
        unit: m.unit ?? null,
        matchType: "name",
      });
    }
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

export async function listMaterialAliases(
  ctx: QueryCtx,
  materialId: Id<"materials">
) {
  const aliases = await ctx.db
    .query("materialAliases")
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .collect();
  return aliases.map((a) => ({
    _id: a._id,
    alias: a.alias,
    createdAt: a.createdAt,
  }));
}
