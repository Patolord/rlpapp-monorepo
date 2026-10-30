import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  allocateNextSku,
  buildMaterialIdentityKey,
  buildMaterialSearchText,
  deriveVariantLabel,
  findMaterialByIdentity,
  normalizeUnit,
  sanitizeDimensions,
} from "../../lib/compras/catalog";
import { normalizeText } from "../../lib/compras/procurement";
import { logAudit } from "../../lib/audit";

/**
 * Vincula um item do takeoff a um material do catálogo: acha a família pelo
 * nome (ou cria), monta a identidade pela medida/detalhe e reutiliza o SKU
 * existente ou cria um novo. Usado pela promoção manual e ao registrar uma
 * cotação de um item ainda sem material, para a cotação alimentar a família.
 * A criação do material é auditada aqui, para cobrir todos os chamadores.
 */
export async function promoteTakeoffItem(
  ctx: MutationCtx,
  user: Doc<"users">,
  item: Doc<"takeoffItems">,
  options: { familyName?: string; category?: string } = {}
): Promise<{
  materialId: Id<"materials">;
  created: boolean;
  familyName: string;
}> {
  const familyName = (options.familyName ?? item.rawDescription).trim();
  if (!familyName) throw new Error("Informe o nome da família");
  const nameNormalized = normalizeText(familyName);
  let family = await ctx.db
    .query("materialFamilies")
    .withIndex("by_name_normalized", (q) =>
      q.eq("nameNormalized", nameNormalized)
    )
    .first();
  const now = Date.now();
  if (!family) {
    const familyId = await ctx.db.insert("materialFamilies", {
      name: familyName,
      nameNormalized,
      category: options.category?.trim() || undefined,
      baseUnit: normalizeUnit(item.unit),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    family = await ctx.db.get("materialFamilies", familyId);
  }
  if (!family) throw new Error("Falha ao criar família de material");

  const dimensions = sanitizeDimensions(item.customDimensions);
  const variantLabel = deriveVariantLabel({
    variantLabel: item.customSpecification,
    dimensions,
  });
  const unit = normalizeUnit(item.unit);
  const identityKey = buildMaterialIdentityKey({
    familyId: family._id,
    unit,
    variantLabel,
    dimensions,
  });
  const existing = await findMaterialByIdentity(ctx, { identityKey });
  if (existing) {
    await ctx.db.patch("takeoffItems", item._id, {
      materialId: existing._id,
      status: "matched",
      updatedAt: now,
    });
    return { materialId: existing._id, created: false, familyName: family.name };
  }

  const sku = await allocateNextSku(ctx);
  const category = options.category?.trim() || family.category;
  const materialId = await ctx.db.insert("materials", {
    name: family.name,
    familyId: family._id,
    variantLabel,
    dimensions,
    identityKey,
    sku,
    category,
    unit,
    spec: item.customSpecification,
    searchText: buildMaterialSearchText({
      name: family.name,
      variantLabel,
      sku,
      category,
      spec: item.customSpecification,
    }),
    trackInventory: true,
    active: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch("takeoffItems", item._id, {
    materialId,
    status: "matched",
    updatedAt: now,
  });
  await ctx.db.patch("takeoffs", item.takeoffId, { updatedAt: now });
  await logAudit(ctx, user, {
    action: "create",
    tableName: "materials",
    recordId: materialId,
    details: `Promovido do takeoff: ${family.name}`,
  });
  return { materialId, created: true, familyName: family.name };
}
