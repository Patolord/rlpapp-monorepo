import {
  DAY_MS,
  REFERENCE_WINDOW_DAYS,
} from "@rlpapp/shared/compras/priceReference";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  isComparableUnit,
  materialEventsBetween,
  materialReferenceStats,
  referenceStatsOf,
  withTruncation,
  type MaterialReference,
  type MaterialReferenceRead,
  supplierKeyOf,
} from "./priceHistory";
import { isSupplierQuote } from "./priceSelection";

/**
 * Histórico de preços de um equipamento comparável: a família do catálogo
 * (ex.: "Split hi-wall 9.000 BTU/h") com todas as variantes (marca, ciclo,
 * tecnologia) e as cotações de cada uma, de todos os fornecedores. A
 * referência de orçamento é a da variante padrão da família.
 */

// Reads stay well under a query's document limit: per variant, up to
// EVENTS_PER_VARIANT for the history plus REFERENCE_EVENT_LIMIT for the
// reference when the history does not cover its six months.
const MAX_VARIANTS = 20;
const EVENTS_PER_VARIANT = 400;
const DEFAULT_MONTHS_BACK = 12;
const AVERAGE_MONTH_MS = 30.44 * DAY_MS;

export type FamilyQuote = {
  _id: Id<"priceEvents">;
  materialId: Id<"materials">;
  supplierId: Id<"suppliers"> | null;
  supplierKey: string;
  supplierName: string;
  unitPriceCents: number;
  unit: string | null;
  quantity: number | null;
  occurredAt: number;
  validUntil: number | null;
  source: Doc<"priceEvents">["source"];
  quoteProposalId: Id<"quoteProposals"> | null;
  needsReview: boolean;
};

export type FamilyVariant = {
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | null;
  manufacturer: string | null;
  attributes: { key: string; value: string }[];
  unit: string | null;
  sku: string | null;
  status: "draft" | "active" | "archived";
  isDefault: boolean;
  reference: MaterialReference | null;
  /** A janela de 6 meses não foi lida inteira (com ou sem referência calculada). */
  referenceTruncated: boolean;
};

function variantStatus(material: Doc<"materials">): FamilyVariant["status"] {
  if (!material.active) return "archived";
  return material.status === "draft" ? "draft" : "active";
}

/**
 * Família (pelo id ou pelo material), variantes, cotações dos últimos
 * `monthsBack` meses e a referência de cada variante. Um material sem família
 * é tratado como uma família de uma variante só.
 */
export async function getFamilyPriceHistory(
  ctx: QueryCtx,
  input: {
    familyId?: Id<"materialFamilies">;
    materialId?: Id<"materials">;
    now: number;
    monthsBack?: number;
  }
) {
  let family: Doc<"materialFamilies"> | null = null;
  let materials: Doc<"materials">[] = [];
  if (input.familyId) {
    family = await ctx.db.get("materialFamilies", input.familyId);
    if (!family) throw new Error("Família não encontrada");
  } else if (input.materialId) {
    const material = await ctx.db.get("materials", input.materialId);
    if (!material) throw new Error("Material não encontrado");
    if (material.familyId) {
      family = await ctx.db.get("materialFamilies", material.familyId);
    }
    if (!family) materials = [material];
  } else {
    throw new Error("Informe familyId ou materialId");
  }
  if (family) {
    const familyId = family._id;
    materials = (
      await ctx.db
        .query("materials")
        .withIndex("by_family", (q) => q.eq("familyId", familyId))
        .take(MAX_VARIANTS)
    ).filter((material) => material.active);
  }

  const monthsBack = Math.min(Math.max(input.monthsBack ?? DEFAULT_MONTHS_BACK, 1), 60);
  const since = input.now - monthsBack * AVERAGE_MONTH_MS;

  const referenceFrom = input.now - REFERENCE_WINDOW_DAYS * DAY_MS;
  const events: Doc<"priceEvents">[] = [];
  const references = new Map<Id<"materials">, MaterialReferenceRead>();
  let historyTruncated = false;
  for (const material of materials) {
    const read = await materialEventsBetween(
      ctx,
      material._id,
      since,
      input.now,
      EVENTS_PER_VARIANT
    );
    const truncated = read.length === EVENTS_PER_VARIANT;
    historyTruncated ||= truncated;
    const recent = read.filter(
      (event) =>
        isSupplierQuote(event) && isComparableUnit(event.unit, material.unit)
    );
    events.push(...recent);
    // The reference always covers its own six months, whatever monthsBack is;
    // the history read is reused only when it holds that whole window.
    references.set(
      material._id,
      since <= referenceFrom && !truncated
        ? {
            reference: withTruncation(referenceStatsOf(recent, material, input.now), false),
            truncated: false,
          }
        : await materialReferenceStats(ctx, material, input.now)
    );
  }

  const supplierNames = new Map<Id<"suppliers">, string>();
  for (const event of events) {
    if (event.supplierId && !supplierNames.has(event.supplierId)) {
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      supplierNames.set(event.supplierId, supplier?.name ?? "Fornecedor removido");
    }
  }
  const toQuote = (event: Doc<"priceEvents">): FamilyQuote => ({
    _id: event._id,
    materialId: event.materialId!,
    supplierId: event.supplierId ?? null,
    supplierKey: supplierKeyOf(event),
    supplierName:
      (event.supplierId ? supplierNames.get(event.supplierId) : undefined) ??
      event.supplierNameRaw ??
      "Fornecedor desconhecido",
    unitPriceCents: event.unitPriceCents,
    unit: event.unit ?? null,
    quantity: event.quantity ?? null,
    occurredAt: event.occurredAt,
    validUntil: event.validUntil ?? null,
    source: event.source,
    quoteProposalId: event.quoteProposalId ?? null,
    needsReview: event.needsReview,
  });

  const defaultMaterialId =
    family?.defaultMaterialId &&
    materials.some((material) => material._id === family.defaultMaterialId)
      ? family.defaultMaterialId
      : null;

  const variants: FamilyVariant[] = materials
    .map((material) => ({
      materialId: material._id,
      name: material.name,
      variantLabel: material.variantLabel?.trim() || null,
      manufacturer: material.manufacturer?.trim() || null,
      attributes: material.technicalAttributes ?? [],
      unit: material.unit ?? null,
      sku: material.sku ?? null,
      status: variantStatus(material),
      isDefault: material._id === defaultMaterialId,
      reference: references.get(material._id)?.reference ?? null,
      referenceTruncated: references.get(material._id)?.truncated ?? false,
    }))
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        (b.reference?.count ?? 0) - (a.reference?.count ?? 0) ||
        (a.variantLabel ?? a.name).localeCompare(b.variantLabel ?? b.name, "pt-BR")
    );

  return {
    family: family
      ? {
          _id: family._id,
          name: family.name,
          category: family.category ?? null,
          baseUnit: family.baseUnit ?? null,
        }
      : null,
    defaultMaterialId,
    variants,
    /** Some variant has more quotes in the period than one read returns. */
    historyTruncated,
    quotes: events
      .map(toQuote)
      .sort((a, b) => b.occurredAt - a.occurredAt),
  };
}

/** Escolhe (ou limpa, com null) a variante de referência da família. */
export async function setFamilyDefaultVariant(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    familyId: Id<"materialFamilies">;
    materialId: Id<"materials"> | null;
  }
): Promise<void> {
  const family = await ctx.db.get("materialFamilies", input.familyId);
  if (!family) throw new Error("Família não encontrada");
  if (input.materialId) {
    const material = await ctx.db.get("materials", input.materialId);
    if (!material || material.familyId !== family._id) {
      throw new Error("O material não é uma variante desta família");
    }
  }
  await ctx.db.patch("materialFamilies", family._id, {
    defaultMaterialId: input.materialId ?? undefined,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "materialFamilies",
    recordId: family._id,
  });
}
