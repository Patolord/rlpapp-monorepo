import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { buildMaterialIdentityKey, findMaterialByIdentity } from "./catalog";
import { normalizeText } from "./pricing";

/** Dimensões em milímetros aceitas no cadastro de materiais. */
export type MaterialDimensionsInput = {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
};

export function sanitizeTechnicalAttributes(
  attributes: Array<{ key: string; value: string }> | undefined
): Array<{ key: string; value: string }> | undefined {
  if (attributes === undefined) return undefined;
  if (attributes.length > 20) {
    throw new Error("Um material pode ter no máximo 20 atributos técnicos");
  }

  const result: Array<{ key: string; value: string }> = [];
  const keys = new Set<string>();
  for (const attribute of attributes) {
    const key = normalizeText(attribute.key);
    const value = attribute.value.trim();
    if (!key || !value) {
      throw new Error("Preencha a chave e o valor de todos os atributos técnicos");
    }
    if (keys.has(key)) {
      throw new Error(`Atributo técnico duplicado: ${key}`);
    }
    keys.add(key);
    result.push({ key, value });
  }
  return result;
}

export async function findOrCreateFamily(
  ctx: MutationCtx,
  input: {
    familyId?: Id<"materialFamilies">;
    name: string;
    category?: string;
    baseUnit?: string;
  }
): Promise<Doc<"materialFamilies">> {
  if (input.familyId) {
    const family = await ctx.db.get("materialFamilies", input.familyId);
    if (!family) throw new Error("Família de material não encontrada");
    return family;
  }

  const nameNormalized = normalizeText(input.name);
  const existing = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  if (existing) return existing;

  const now = Date.now();
  const familyId = await ctx.db.insert("materialFamilies", {
    name: input.name,
    nameNormalized,
    category: input.category,
    baseUnit: input.baseUnit,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const family = await ctx.db.get("materialFamilies", familyId);
  if (!family) throw new Error("Falha ao criar família de material");
  return family;
}

export async function assertUniqueIdentity(
  ctx: QueryCtx | MutationCtx,
  identityKey: string,
  excludeMaterialId?: Id<"materials">
): Promise<void> {
  const hit = await findMaterialByIdentity(ctx, {
    identityKey,
    excludeMaterialId,
  });
  if (hit) {
    const detail = hit.variantLabel ? ` (${hit.variantLabel})` : "";
    throw new Error(`Material já cadastrado: ${hit.name}${detail}`);
  }
}

export async function insertUniqueAlias(
  ctx: MutationCtx,
  materialId: Id<"materials">,
  alias: string,
  createdAt: number
): Promise<Id<"materialAliases">> {
  const aliasNormalized = normalizeText(alias);
  const existing = await ctx.db
    .query("materialAliases")
    .withIndex("by_alias_normalized", (q) =>
      q.eq("aliasNormalized", aliasNormalized)
    )
    .collect();
  const forThisMaterial = existing.find(
    (row) => row.materialId === materialId
  );
  if (forThisMaterial) return forThisMaterial._id;
  return await ctx.db.insert("materialAliases", {
    alias,
    aliasNormalized,
    materialId,
    createdAt,
  });
}

export function materialIdentityInput(input: {
  familyId: Id<"materialFamilies">;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  unit?: string;
  variantLabel?: string;
  dimensions?: MaterialDimensionsInput;
  technicalAttributes?: Array<{ key: string; value: string }>;
}) {
  return buildMaterialIdentityKey(input);
}
