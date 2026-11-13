import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { diffFields, logAudit } from "../../lib/audit";
import type { materialStatus } from "../../schema/procurement";
import {
  allocateNextSku,
  assertUniqueBarcode,
  assertUniqueSku,
  buildMaterialSearchText,
  deriveVariantLabel,
  normalizeBarcode,
  normalizeSku,
  normalizeUnit,
  sanitizeDimensions,
  validateLaborPriceCents,
  validateUnitsPerPurchaseUnit,
} from "./catalog";
import {
  assertUniqueIdentity,
  findOrCreateFamily,
  insertUniqueAlias,
  materialIdentityInput,
  sanitizeTechnicalAttributes,
  type MaterialDimensionsInput,
} from "./materialIdentity";
import { notFound, ruleViolation } from "../../lib/domainErrors";

type TechnicalAttributeInput = { key: string; value: string };

export type CreateMaterialInput = {
  name: string;
  familyId?: Id<"materialFamilies">;
  variantLabel?: string;
  dimensions?: MaterialDimensionsInput;
  sku?: string;
  barcode?: string;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  category?: string;
  unit?: string;
  purchaseUnit?: string;
  unitsPerPurchaseUnit?: number;
  trackInventory?: boolean;
  spec?: string;
  brandPreference?: string;
  technicalAttributes?: TechnicalAttributeInput[];
  aliases?: string[];
  imageId?: Id<"_storage">;
  /** Mão de obra por unidade, em centavos (orçamentos do RLP Takeoff). */
  laborPriceCents?: number;
};

export type UpdateMaterialInput = {
  materialId: Id<"materials">;
  name?: string;
  familyId?: Id<"materialFamilies">;
  variantLabel?: string | null;
  dimensions?: MaterialDimensionsInput | null;
  sku?: string;
  barcode?: string | null;
  manufacturer?: string;
  manufacturerPartNumber?: string;
  category?: string;
  unit?: string;
  purchaseUnit?: string;
  unitsPerPurchaseUnit?: number;
  trackInventory?: boolean;
  spec?: string;
  brandPreference?: string;
  technicalAttributes?: TechnicalAttributeInput[];
  active?: boolean;
  status?: Infer<typeof materialStatus>;
  imageId?: Id<"_storage"> | null;
  /** Mão de obra por unidade, em centavos; `null` remove o preço. */
  laborPriceCents?: number | null;
};

export type AddMaterialAliasInput = {
  materialId: Id<"materials">;
  alias: string;
};

const ALLOWED_MATERIAL_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

async function assertAllowedMaterialImage(
  ctx: MutationCtx,
  imageId: Id<"_storage">
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", imageId);
  if (!metadata) {
    throw notFound("Imagem não encontrada");
  }
  if (
    !metadata.contentType ||
    !ALLOWED_MATERIAL_IMAGE_TYPES.has(metadata.contentType)
  ) {
    throw ruleViolation("A imagem deve ser JPG, PNG ou WebP");
  }
}

async function replaceMaterialImage(
  ctx: MutationCtx,
  previous: Id<"_storage"> | undefined,
  next: Id<"_storage"> | null | undefined
): Promise<Id<"_storage"> | undefined> {
  if (next === undefined) return previous;
  if (next) await assertAllowedMaterialImage(ctx, next);
  if (previous && previous !== next) {
    await ctx.storage.delete(previous);
  }
  return next ?? undefined;
}

export async function createMaterialInternal(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateMaterialInput
): Promise<{
  materialId: Id<"materials">;
  name: string;
  variantLabel: string | undefined;
  sku: string;
  unit: string | undefined;
}> {
  const name = args.name.trim();
  if (!name) throw ruleViolation("Informe o nome do material");

  validateUnitsPerPurchaseUnit(args.unitsPerPurchaseUnit);
  validateLaborPriceCents(args.laborPriceCents);
  if (args.imageId) {
    await assertAllowedMaterialImage(ctx, args.imageId);
  }
  const dimensions = sanitizeDimensions(args.dimensions);
  const technicalAttributes = sanitizeTechnicalAttributes(
    args.technicalAttributes
  );

  const sku = args.sku?.trim()
    ? normalizeSku(args.sku)
    : await allocateNextSku(ctx);
  await assertUniqueSku(ctx, sku);

  const barcode = args.barcode?.trim()
    ? normalizeBarcode(args.barcode)
    : undefined;
  if (barcode) await assertUniqueBarcode(ctx, barcode);

  const now = Date.now();
  const category = args.category?.trim() || undefined;
  const manufacturer = args.manufacturer?.trim() || undefined;
  const manufacturerPartNumber =
    args.manufacturerPartNumber?.trim() || undefined;
  const unit = normalizeUnit(args.unit);
  const purchaseUnit = args.purchaseUnit?.trim() || undefined;
  const spec = args.spec?.trim() || undefined;
  const brandPreference = args.brandPreference?.trim() || undefined;
  const variantLabel = deriveVariantLabel({
    variantLabel: args.variantLabel,
    dimensions,
  });
  const family = await findOrCreateFamily(ctx, {
    familyId: args.familyId,
    name,
    category,
    baseUnit: unit,
  });
  const identityKey = materialIdentityInput({
    familyId: family._id,
    manufacturer,
    manufacturerPartNumber,
    unit,
    variantLabel,
    dimensions,
    technicalAttributes,
  });
  await assertUniqueIdentity(ctx, identityKey);

  const materialId = await ctx.db.insert("materials", {
    name: family.name,
    familyId: family._id,
    variantLabel,
    dimensions,
    identityKey,
    sku,
    barcode,
    manufacturer,
    manufacturerPartNumber,
    category,
    unit,
    purchaseUnit,
    unitsPerPurchaseUnit: args.unitsPerPurchaseUnit,
    trackInventory: args.trackInventory ?? true,
    spec,
    brandPreference,
    technicalAttributes,
    searchText: buildMaterialSearchText({
      name: family.name,
      variantLabel,
      sku,
      barcode,
      category,
      manufacturer,
      manufacturerPartNumber,
      brandPreference,
      spec,
    }),
    imageId: args.imageId,
    laborPriceCents: args.laborPriceCents,
    laborPriceUpdatedAt:
      args.laborPriceCents !== undefined ? now : undefined,
    active: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  for (const alias of args.aliases ?? []) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    await insertUniqueAlias(ctx, materialId, trimmed, now);
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "materials",
    recordId: materialId,
    details: `${sku} — ${family.name}${variantLabel ? ` (${variantLabel})` : ""}`,
  });

  return {
    materialId,
    name: family.name,
    variantLabel,
    sku,
    unit,
  };
}

export async function updateMaterial(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdateMaterialInput
): Promise<void> {
  const material = await ctx.db.get("materials", args.materialId);
  if (!material) throw notFound("Material não encontrado");

  const before = {
    name: material.name,
    category: material.category,
    unit: material.unit,
    spec: material.spec,
    brandPreference: material.brandPreference,
    active: material.active,
    status: material.status,
    laborPriceCents: material.laborPriceCents,
  };
  validateUnitsPerPurchaseUnit(args.unitsPerPurchaseUnit);
  validateLaborPriceCents(args.laborPriceCents);

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  let familyId = args.familyId ?? material.familyId;
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw ruleViolation("Informe o nome do material");
    const family = await findOrCreateFamily(ctx, {
      familyId: args.familyId,
      name,
      category: args.category?.trim() || material.category,
      baseUnit: normalizeUnit(args.unit) ?? material.unit,
    });
    familyId = family._id;
    updates.familyId = family._id;
    updates.name = family.name;
  } else if (args.familyId !== undefined) {
    const family = await ctx.db.get("materialFamilies", args.familyId);
    if (!family) throw notFound("Família de material não encontrada");
    updates.name = family.name;
    updates.familyId = family._id;
  }
  if (args.sku !== undefined) {
    const sku = normalizeSku(args.sku);
    if (!sku) throw ruleViolation("Informe o SKU");
    await assertUniqueSku(ctx, sku, args.materialId);
    updates.sku = sku;
  }
  if (args.barcode !== undefined) {
    const barcode =
      args.barcode === null ? undefined : normalizeBarcode(args.barcode);
    if (barcode) {
      await assertUniqueBarcode(ctx, barcode, args.materialId);
    }
    updates.barcode = barcode;
  }
  if (args.manufacturer !== undefined) {
    updates.manufacturer = args.manufacturer.trim() || undefined;
  }
  if (args.manufacturerPartNumber !== undefined) {
    updates.manufacturerPartNumber =
      args.manufacturerPartNumber.trim() || undefined;
  }
  if (args.category !== undefined) {
    updates.category = args.category.trim() || undefined;
  }
  if (args.unit !== undefined) updates.unit = normalizeUnit(args.unit);
  if (args.purchaseUnit !== undefined) {
    updates.purchaseUnit = args.purchaseUnit.trim() || undefined;
  }
  if (args.unitsPerPurchaseUnit !== undefined) {
    updates.unitsPerPurchaseUnit = args.unitsPerPurchaseUnit;
  }
  if (args.trackInventory !== undefined) {
    updates.trackInventory = args.trackInventory;
  }
  if (args.spec !== undefined) updates.spec = args.spec.trim() || undefined;
  if (args.brandPreference !== undefined) {
    updates.brandPreference = args.brandPreference.trim() || undefined;
  }
  if (args.technicalAttributes !== undefined) {
    updates.technicalAttributes = sanitizeTechnicalAttributes(
      args.technicalAttributes
    );
  }
  if (args.variantLabel !== undefined) {
    updates.variantLabel = args.variantLabel?.trim() || undefined;
  }
  if (args.dimensions !== undefined) {
    updates.dimensions = sanitizeDimensions(args.dimensions ?? undefined);
  }
  if (args.active !== undefined) {
    updates.active = args.active;
    if (args.status === undefined) {
      updates.status = args.active ? "active" : "archived";
    }
  }
  if (args.status !== undefined) updates.status = args.status;
  if (args.laborPriceCents !== undefined) {
    const laborPriceCents = args.laborPriceCents ?? undefined;
    if (laborPriceCents !== material.laborPriceCents) {
      updates.laborPriceCents = laborPriceCents;
      updates.laborPriceUpdatedAt =
        laborPriceCents === undefined ? undefined : updates.updatedAt;
    }
  }
  if (args.imageId !== undefined) {
    updates.imageId = await replaceMaterialImage(
      ctx,
      material.imageId,
      args.imageId
    );
  }

  const next = { ...material, ...updates } as Doc<"materials">;
  if (!familyId) {
    throw ruleViolation(
      "Material sem família — defina a família antes de atualizar"
    );
  }
  const identityKey = materialIdentityInput({
    familyId,
    manufacturer: next.manufacturer,
    manufacturerPartNumber: next.manufacturerPartNumber,
    unit: next.unit,
    variantLabel: next.variantLabel,
    dimensions: next.dimensions,
    technicalAttributes: next.technicalAttributes,
  });
  await assertUniqueIdentity(ctx, identityKey, args.materialId);
  updates.identityKey = identityKey;
  updates.searchText = buildMaterialSearchText({
    name: next.name,
    variantLabel: next.variantLabel,
    sku: next.sku,
    barcode: next.barcode,
    category: next.category,
    manufacturer: next.manufacturer,
    manufacturerPartNumber: next.manufacturerPartNumber,
    brandPreference: next.brandPreference,
    spec: next.spec,
  });

  await ctx.db.patch("materials", args.materialId, updates);
  const afterDoc = await ctx.db.get("materials", args.materialId);
  const after = afterDoc
    ? {
        name: afterDoc.name,
        category: afterDoc.category,
        unit: afterDoc.unit,
        spec: afterDoc.spec,
        brandPreference: afterDoc.brandPreference,
        active: afterDoc.active,
        status: afterDoc.status,
        laborPriceCents: afterDoc.laborPriceCents,
      }
    : before;
  await logAudit(ctx, user, {
    action: "update",
    tableName: "materials",
    recordId: args.materialId,
    entityLabel: after.name,
    changes: diffFields(before, after, [
      "name",
      "category",
      "unit",
      "spec",
      "brandPreference",
      "active",
      "status",
      "laborPriceCents",
    ]),
    snapshotBefore: before,
    snapshotAfter: after,
  });
}

export async function addMaterialAlias(
  ctx: MutationCtx,
  args: AddMaterialAliasInput
): Promise<Id<"materialAliases">> {
  const material = await ctx.db.get("materials", args.materialId);
  if (!material) throw notFound("Material não encontrado");
  const alias = args.alias.trim();
  if (!alias) throw ruleViolation("Informe o alias");

  return await insertUniqueAlias(
    ctx,
    args.materialId,
    alias,
    Date.now()
  );
}
