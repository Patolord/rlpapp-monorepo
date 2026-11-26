import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/** Ofertas de material por fornecedor (código, embalagem, prazo, preferido). */

export async function listSupplierMaterialOfferings(
  ctx: QueryCtx,
  input: { materialId?: Id<"materials">; supplierId?: Id<"suppliers"> }
) {
  const materialId = input.materialId;
  const supplierId = input.supplierId;
  const offerings = materialId
    ? await ctx.db
        .query("supplierMaterials")
        .withIndex("by_material", (q) => q.eq("materialId", materialId))
        .collect()
    : supplierId
      ? await ctx.db
          .query("supplierMaterials")
          .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
          .collect()
      : [];
  // Guarda a promessa, não o resultado: as leituras rodam em paralelo e o
  // mesmo fornecedor não pode ser buscado uma vez por oferta.
  const supplierCache = new Map<string, Promise<Doc<"suppliers"> | null>>();
  const loadSupplier = (id: Id<"suppliers">) => {
    let pending = supplierCache.get(id);
    if (!pending) {
      pending = ctx.db.get("suppliers", id);
      supplierCache.set(id, pending);
    }
    return pending;
  };
  const rows = await Promise.all(
    offerings.map(async (offering) => {
      const [material, supplier] = await Promise.all([
        ctx.db.get("materials", offering.materialId),
        loadSupplier(offering.supplierId),
      ]);
      return {
        _id: offering._id,
        supplierId: offering.supplierId,
        materialId: offering.materialId,
        materialName: material?.name ?? "Material removido",
        materialVariantLabel: material?.variantLabel ?? null,
        supplierCode: offering.supplierCode ?? null,
        supplierDescription: offering.supplierDescription ?? null,
        purchaseUnit: offering.purchaseUnit ?? null,
        unitsPerPurchaseUnit: offering.unitsPerPurchaseUnit ?? null,
        leadTimeDays: offering.leadTimeDays ?? null,
        preferred: offering.preferred,
        active: offering.active,
        supplierName: supplier?.name ?? "Fornecedor removido",
        supplierActive: supplier?.active ?? false,
        supplierPaymentTerms: supplier?.paymentTerms ?? null,
        supplierDefaultLeadTimeDays: supplier?.defaultLeadTimeDays ?? null,
        effectiveLeadTimeDays:
          offering.leadTimeDays ?? supplier?.defaultLeadTimeDays ?? null,
      };
    })
  );
  // Preferidos primeiro, depois por nome do fornecedor / material.
  return rows.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    return (a.supplierName + a.materialName).localeCompare(
      b.supplierName + b.materialName,
      "pt-BR",
      { sensitivity: "base" }
    );
  });
}

export type UpsertSupplierMaterialOfferingInput = {
  supplierId: Id<"suppliers">;
  materialId: Id<"materials">;
  supplierCode?: string;
  supplierDescription?: string;
  purchaseUnit?: string;
  unitsPerPurchaseUnit?: number;
  leadTimeDays?: number;
  preferred?: boolean;
  active?: boolean;
};

/** Cria ou atualiza a oferta do par fornecedor + material. */
export async function upsertSupplierMaterialOffering(
  ctx: MutationCtx,
  input: UpsertSupplierMaterialOfferingInput
): Promise<Id<"supplierMaterials">> {
  const [supplier, material] = await Promise.all([
    ctx.db.get("suppliers", input.supplierId),
    ctx.db.get("materials", input.materialId),
  ]);
  if (!supplier) throw notFound("Fornecedor não encontrado");
  if (!material) throw notFound("Material não encontrado");
  if (
    input.unitsPerPurchaseUnit !== undefined &&
    (!Number.isFinite(input.unitsPerPurchaseUnit) ||
      input.unitsPerPurchaseUnit <= 0)
  ) {
    throw ruleViolation("Unidades por embalagem deve ser maior que zero");
  }
  if (
    input.leadTimeDays !== undefined &&
    (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0)
  ) {
    throw ruleViolation("Prazo deve ser um número inteiro não negativo");
  }
  const supplierCode = input.supplierCode?.trim() || undefined;
  if (supplierCode) {
    const codeOwner = await ctx.db
      .query("supplierMaterials")
      .withIndex("by_supplier_code", (q) =>
        q.eq("supplierId", input.supplierId).eq("supplierCode", supplierCode)
      )
      .first();
    if (codeOwner && codeOwner.materialId !== input.materialId) {
      throw ruleViolation(
        `Código ${supplierCode} já está vinculado a outro material deste fornecedor`
      );
    }
  }

  const existing = await ctx.db
    .query("supplierMaterials")
    .withIndex("by_supplier_material", (q) =>
      q.eq("supplierId", input.supplierId).eq("materialId", input.materialId)
    )
    .unique();
  const now = Date.now();
  const values = {
    supplierCode,
    supplierDescription: input.supplierDescription?.trim() || undefined,
    purchaseUnit: input.purchaseUnit?.trim() || undefined,
    unitsPerPurchaseUnit: input.unitsPerPurchaseUnit,
    leadTimeDays: input.leadTimeDays,
    preferred: input.preferred ?? existing?.preferred ?? false,
    active: input.active ?? existing?.active ?? true,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch("supplierMaterials", existing._id, values);
    return existing._id;
  }
  return await ctx.db.insert("supplierMaterials", {
    supplierId: input.supplierId,
    materialId: input.materialId,
    ...values,
    createdAt: now,
  });
}

export async function removeSupplierMaterialOffering(
  ctx: MutationCtx,
  offeringId: Id<"supplierMaterials">
): Promise<void> {
  const offering = await ctx.db.get("supplierMaterials", offeringId);
  if (!offering) throw notFound("Oferta do fornecedor não encontrada");
  await ctx.db.delete("supplierMaterials", offeringId);
}
