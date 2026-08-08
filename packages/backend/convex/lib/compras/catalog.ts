import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { normalizeText } from "./procurement";

export const SKU_PREFIX = "MAT";
export const SKU_COUNTER_KEY = "material" as const;

export type MaterialDoc = Doc<"materials">;
export type MaterialDimensions = {
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  thicknessMm?: number;
  diameterMm?: number;
};

const UNIT_ALIASES: Record<string, string> = {
  peca: "un",
  pc: "un",
  un: "un",
  unidade: "un",
  unidades: "un",
  metro: "m",
  metros: "m",
  m: "m",
  kg: "kg",
  quilograma: "kg",
  quilogramas: "kg",
  l: "L",
  litro: "L",
  litros: "L",
};

export type ReplenishmentState =
  | "unconfigured"
  | "healthy"
  | "reorder"
  | "below_minimum";

export function formatSku(sequence: number): string {
  return `${SKU_PREFIX}-${String(sequence).padStart(6, "0")}`;
}

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeBarcode(value: string): string {
  return value.trim();
}

export function normalizeUnit(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const key = normalizeText(value).replace(/[^a-z0-9]/g, "");
  return UNIT_ALIASES[key] ?? value.trim();
}

export function sanitizeDimensions(
  dimensions: MaterialDimensions | undefined
): MaterialDimensions | undefined {
  if (!dimensions) return undefined;
  const entries = Object.entries(dimensions).filter(
    ([, value]) => value !== undefined
  );
  if (entries.length === 0) return undefined;
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || (value as number) <= 0) {
      throw new Error(`Dimensão inválida: ${key}`);
    }
  }
  return Object.fromEntries(entries) as MaterialDimensions;
}

export function buildMaterialIdentityKey(input: {
  familyId: Id<"materialFamilies">;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  unit?: string;
  variantLabel?: string;
  dimensions?: MaterialDimensions;
  technicalAttributes?: Array<{ key: string; value: string }>;
}): string {
  const dimensions = Object.entries(input.dimensions ?? {})
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
  const attributes = [...(input.technicalAttributes ?? [])]
    .map(({ key, value }) => `${normalizeText(key)}:${normalizeText(value)}`)
    .sort()
    .join(",");
  return [
    input.familyId,
    normalizeText(input.manufacturer ?? ""),
    normalizeText(input.manufacturerPartNumber ?? ""),
    normalizeUnit(input.unit) ?? "",
    normalizeText(input.variantLabel ?? ""),
    dimensions,
    attributes,
  ].join("|");
}

export function formatDimensions(
  dimensions: MaterialDimensions | undefined
): string | undefined {
  if (!dimensions) return undefined;
  if (dimensions.widthMm && dimensions.heightMm) {
    return `${dimensions.widthMm}×${dimensions.heightMm} mm`;
  }
  if (dimensions.diameterMm) return `Ø ${dimensions.diameterMm} mm`;
  if (dimensions.lengthMm) return `${dimensions.lengthMm} mm`;
  return Object.entries(dimensions)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value} mm`)
    .join(", ");
}

export function buildMaterialSearchText(input: {
  name: string;
  variantLabel?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  brandPreference?: string;
  spec?: string;
}): string {
  const parts = [
    input.name,
    input.variantLabel,
    input.sku,
    input.barcode,
    input.category,
    input.manufacturer,
    input.manufacturerPartNumber,
    input.brandPreference,
    input.spec,
  ]
    .filter(Boolean)
    .map((part) => normalizeText(part!));
  return parts.join(" ");
}

export function materialMatchesSearch(
  material: MaterialDoc,
  term: string
): boolean {
  const normalized = normalizeText(term);
  if (!normalized) return true;
  if (material.searchText?.includes(normalized)) return true;
  return (
    normalizeText(material.name).includes(normalized) ||
    (material.category ? normalizeText(material.category).includes(normalized) : false) ||
    (material.sku ? normalizeText(material.sku).includes(normalized) : false) ||
    (material.barcode ? normalizeText(material.barcode).includes(normalized) : false)
  );
}

export async function allocateNextSku(ctx: MutationCtx): Promise<string> {
  const existing = await ctx.db
    .query("materialSkuCounters")
    .withIndex("by_key", (q) => q.eq("key", SKU_COUNTER_KEY))
    .unique();

  if (!existing) {
    await ctx.db.insert("materialSkuCounters", {
      key: SKU_COUNTER_KEY,
      nextNumber: 2,
    });
    return formatSku(1);
  }

  const sku = formatSku(existing.nextNumber);
  await ctx.db.patch("materialSkuCounters", existing._id, {
    nextNumber: existing.nextNumber + 1,
  });
  return sku;
}

export async function ensureSkuCounterAtLeast(
  ctx: MutationCtx,
  minimum: number
): Promise<void> {
  const existing = await ctx.db
    .query("materialSkuCounters")
    .withIndex("by_key", (q) => q.eq("key", SKU_COUNTER_KEY))
    .unique();

  if (!existing) {
    await ctx.db.insert("materialSkuCounters", {
      key: SKU_COUNTER_KEY,
      nextNumber: minimum + 1,
    });
    return;
  }

  if (existing.nextNumber <= minimum) {
    await ctx.db.patch("materialSkuCounters", existing._id, {
      nextNumber: minimum + 1,
    });
  }
}

export async function assertUniqueSku(
  ctx: QueryCtx | MutationCtx,
  sku: string,
  excludeMaterialId?: Id<"materials">
): Promise<void> {
  const hit = await ctx.db
    .query("materials")
    .withIndex("by_sku", (q) => q.eq("sku", sku))
    .unique();
  if (hit && hit._id !== excludeMaterialId) {
    throw new Error(`SKU já cadastrado: ${sku}`);
  }
}

export async function assertUniqueBarcode(
  ctx: QueryCtx | MutationCtx,
  barcode: string,
  excludeMaterialId?: Id<"materials">
): Promise<void> {
  const hit = await ctx.db
    .query("materials")
    .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
    .unique();
  if (hit && hit._id !== excludeMaterialId) {
    throw new Error(`Código de barras já cadastrado: ${barcode}`);
  }
}

export function validateUnitsPerPurchaseUnit(value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Informe uma conversão de embalagem maior que zero");
  }
}

export function validateStockPolicyQuantities(input: {
  minimumQuantity: number;
  reorderPoint: number;
  targetQuantity: number;
  leadTimeDays?: number;
}): void {
  if (
    !Number.isFinite(input.minimumQuantity) ||
    !Number.isFinite(input.reorderPoint) ||
    !Number.isFinite(input.targetQuantity)
  ) {
    throw new Error("Informe quantidades numéricas válidas");
  }
  if (
    input.minimumQuantity < 0 ||
    input.reorderPoint < 0 ||
    input.targetQuantity < 0
  ) {
    throw new Error("Quantidades não podem ser negativas");
  }
  if (input.minimumQuantity > input.reorderPoint) {
    throw new Error("Estoque mínimo não pode ser maior que o ponto de reposição");
  }
  if (input.reorderPoint >= input.targetQuantity) {
    throw new Error("Ponto de reposição deve ser menor que a meta de estoque");
  }
  if (
    input.leadTimeDays !== undefined &&
    (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0)
  ) {
    throw new Error("Prazo de reposição deve ser um número inteiro não negativo");
  }
}

export function computeReplenishmentState(
  quantity: number,
  policy:
    | {
        minimumQuantity: number;
        reorderPoint: number;
        targetQuantity: number;
      }
    | null
    | undefined
): { state: ReplenishmentState; suggestedOrderQuantity: number | null } {
  if (!policy) {
    return { state: "unconfigured", suggestedOrderQuantity: null };
  }
  if (quantity < policy.minimumQuantity) {
    return {
      state: "below_minimum",
      suggestedOrderQuantity: Math.max(0, policy.targetQuantity - quantity),
    };
  }
  if (quantity < policy.reorderPoint) {
    return {
      state: "reorder",
      suggestedOrderQuantity: Math.max(0, policy.targetQuantity - quantity),
    };
  }
  return { state: "healthy", suggestedOrderQuantity: null };
}

export function toMaterialCatalogRow(m: MaterialDoc) {
  return {
    _id: m._id,
    _creationTime: m._creationTime,
    name: m.name,
    familyId: m.familyId ?? null,
    variantLabel: m.variantLabel ?? null,
    dimensions: m.dimensions ?? null,
    sku: m.sku ?? null,
    barcode: m.barcode ?? null,
    manufacturer: m.manufacturer ?? null,
    manufacturerPartNumber: m.manufacturerPartNumber ?? null,
    category: m.category ?? null,
    unit: m.unit ?? null,
    purchaseUnit: m.purchaseUnit ?? null,
    unitsPerPurchaseUnit: m.unitsPerPurchaseUnit ?? null,
    trackInventory: m.trackInventory ?? true,
    spec: m.spec ?? null,
    brandPreference: m.brandPreference ?? null,
    technicalAttributes: m.technicalAttributes ?? null,
    active: m.active,
    status: m.status ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt ?? null,
  };
}

export function toMaterialListRow(m: MaterialDoc) {
  return {
    _id: m._id,
    _creationTime: m._creationTime,
    name: m.name,
    familyId: m.familyId ?? null,
    variantLabel: m.variantLabel ?? null,
    dimensions: m.dimensions ?? null,
    sku: m.sku ?? null,
    category: m.category ?? null,
    unit: m.unit ?? null,
    spec: m.spec ?? null,
    brandPreference: m.brandPreference ?? null,
    technicalAttributes: m.technicalAttributes ?? null,
    active: m.active,
    status: m.status ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt ?? null,
  };
}

export function parseSkuSequence(sku: string): number | null {
  const match = /^MAT-(\d+)$/i.exec(sku.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) ? value : null;
}
