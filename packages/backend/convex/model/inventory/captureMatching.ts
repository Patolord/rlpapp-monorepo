import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  deriveVariantLabel,
  findMaterialByIdentity,
  normalizeBarcode,
  normalizeSku,
  normalizeUnit,
} from "../procurement/catalog";
import { materialIdentityInput } from "../procurement/materialIdentity";
import { normalizeText } from "../procurement/pricing";

/**
 * Cadastro em campo: decide se o item capturado no celular já existe no
 * catálogo. Ordem de confiança: código de barras, SKU (etiqueta interna),
 * mesma identidade (família + unidade + variação + fabricante + código do
 * fabricante), apelido exato. O que sobra são "parecidos" pela busca de texto:
 * não se decide sozinho, vira rascunho para Compras revisar.
 */

type Ctx = QueryCtx | MutationCtx;

export type CaptureItemInput = {
  name: string;
  variantLabel?: string;
  unit?: string;
  category?: string;
  barcode?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  spec?: string;
};

export type ExactMatchReason = "barcode" | "sku" | "identity" | "alias";

export type ExactMatch = {
  material: Doc<"materials">;
  reason: ExactMatchReason;
};

const SIMILAR_LIMIT = 6;
const MAX_MERGE_HOPS = 5;

/** Segue o redirecionamento de materiais mesclados; null se arquivado sem destino. */
export async function resolveLiveMaterial(
  ctx: Ctx,
  material: Doc<"materials"> | null
): Promise<Doc<"materials"> | null> {
  let current = material;
  // Até MAX_MERGE_HOPS redirecionamentos, conferindo também o destino final.
  for (let hop = 0; current && hop <= MAX_MERGE_HOPS; hop += 1) {
    const archived = !current.active || current.status === "archived";
    if (!archived) return current;
    if (!current.mergedIntoId) return null;
    current = await ctx.db.get("materials", current.mergedIntoId);
  }
  return null;
}

/** Código lido pela câmera: código de barras do fabricante ou SKU interno. */
export async function findByScannedCode(
  ctx: Ctx,
  code: string
): Promise<ExactMatch | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const byBarcode = await ctx.db
    .query("materials")
    .withIndex("by_barcode", (q) => q.eq("barcode", normalizeBarcode(trimmed)))
    .first();
  const barcodeMaterial = await resolveLiveMaterial(ctx, byBarcode);
  if (barcodeMaterial) return { material: barcodeMaterial, reason: "barcode" };

  const bySku = await ctx.db
    .query("materials")
    .withIndex("by_sku", (q) => q.eq("sku", normalizeSku(trimmed)))
    .first();
  const skuMaterial = await resolveLiveMaterial(ctx, bySku);
  if (skuMaterial) return { material: skuMaterial, reason: "sku" };
  return null;
}

/** Material com a mesma identidade, como está gravado (pode estar arquivado). */
export async function findIdentityMaterial(
  ctx: Ctx,
  input: CaptureItemInput
): Promise<Doc<"materials"> | null> {
  const family = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", normalizeText(input.name))
    )
    .first();
  if (!family) return null;
  const identityKey = materialIdentityInput({
    familyId: family._id,
    manufacturer: input.manufacturer?.trim() || undefined,
    manufacturerPartNumber: input.manufacturerPartNumber?.trim() || undefined,
    unit: normalizeUnit(input.unit),
    variantLabel: deriveVariantLabel({ variantLabel: input.variantLabel }),
  });
  return await findMaterialByIdentity(ctx, { identityKey });
}

async function findByAlias(
  ctx: Ctx,
  input: CaptureItemInput
): Promise<Doc<"materials"> | null> {
  const terms = new Set(
    [
      [input.name, input.variantLabel].filter(Boolean).join(" "),
      input.variantLabel?.trim() ? "" : input.name,
    ]
      .map((term) => normalizeText(term))
      .filter(Boolean)
  );
  for (const term of terms) {
    const aliases = await ctx.db
      .query("materialAliases")
      .withIndex("by_alias_normalized", (q) => q.eq("aliasNormalized", term))
      .take(10);
    const live = new Map<string, Doc<"materials">>();
    for (const alias of aliases) {
      const material = await resolveLiveMaterial(
        ctx,
        await ctx.db.get("materials", alias.materialId)
      );
      if (material) live.set(material._id, material);
    }
    // Apelido de mais de um material não decide sozinho: fica para a pessoa
    // escolher entre os parecidos.
    if (live.size === 1) return [...live.values()][0]!;
  }
  return null;
}

/** Correspondência certa: nesses casos a contagem soma no material existente. */
export async function findExactMatch(
  ctx: Ctx,
  input: CaptureItemInput,
  options: { skipAlias?: boolean } = {}
): Promise<ExactMatch | null> {
  if (input.barcode?.trim()) {
    const scanned = await findByScannedCode(ctx, input.barcode);
    if (scanned) return scanned;
  }
  if (!input.name.trim()) return null;
  const identity = await resolveLiveMaterial(ctx, await findIdentityMaterial(ctx, input));
  if (identity) return { material: identity, reason: "identity" };
  // Apelido é a única correspondência que a pessoa pode recusar ("não é este").
  if (options.skipAlias) return null;
  const alias = await findByAlias(ctx, input);
  if (alias) return { material: alias, reason: "alias" };
  return null;
}

/**
 * Parecidos pelo índice de busca (nome + variação) e pela mesma família.
 * Cobre o catálogo inteiro, não só os cadastros recentes.
 */
export async function findSimilarMaterials(
  ctx: Ctx,
  input: { name: string; variantLabel?: string },
  options: { excludeMaterialId?: Id<"materials">; limit?: number } = {}
): Promise<Doc<"materials">[]> {
  const limit = options.limit ?? SIMILAR_LIMIT;
  const name = normalizeText(input.name);
  if (!name) return [];
  const seen = new Set<string>();
  const results: Doc<"materials">[] = [];
  const push = (material: Doc<"materials">) => {
    if (results.length >= limit) return;
    if (material._id === options.excludeMaterialId) return;
    if (!material.active || material.status === "archived") return;
    if (seen.has(material._id)) return;
    seen.add(material._id);
    results.push(material);
  };

  const family = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) => q.eq("nameNormalized", name))
    .first();
  if (family) {
    const siblings = await ctx.db
      .query("materials")
      .withIndex("by_family", (q) => q.eq("familyId", family._id))
      .take(limit * 2);
    const variant = normalizeText(input.variantLabel ?? "");
    // Mesma variação primeiro: é o candidato mais provável a duplicata.
    siblings.sort(
      (a, b) =>
        Number(normalizeText(b.variantLabel ?? "") === variant) -
        Number(normalizeText(a.variantLabel ?? "") === variant)
    );
    siblings.forEach(push);
  }

  const term = normalizeText(
    [input.name, input.variantLabel].filter(Boolean).join(" ")
  );
  const byText = await ctx.db
    .query("materials")
    .withSearchIndex("search_text", (q) =>
      q.search("searchText", term).eq("active", true)
    )
    .take(limit * 2);
  byText.forEach(push);
  return results;
}
