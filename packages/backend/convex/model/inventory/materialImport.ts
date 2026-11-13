import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { createInventoryDocument } from "./documents";
import { postInventoryDocument } from "./posting";
import {
  emptyBulkImportResult,
  requireTrimmedName,
  type BulkImportResult,
} from "../kernel/bulkImport";
import {
  allocateNextSku,
  buildMaterialSearchText,
  deriveVariantLabel,
  findMaterialByIdentity,
  normalizeUnit,
  sanitizeDimensions,
} from "../procurement/catalog";
import {
  findOrCreateFamily,
  insertUniqueAlias,
  materialIdentityInput,
  sanitizeTechnicalAttributes,
} from "../procurement/materialIdentity";
import type { bulkMaterialItemValidator } from "../procurement/materialValidators";
import { ruleViolation } from "../../lib/domainErrors";

export type BulkMaterialItemInput = Infer<typeof bulkMaterialItemValidator>;

export type BulkCreateMaterialsInput = {
  items: BulkMaterialItemInput[];
  source?: string;
};

/**
 * Importação em lote do catálogo (planilha de origem): cria os materiais que
 * faltam, registra cada linha importada e lança o saldo inicial no estoque.
 */
export async function bulkCreateMaterials(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: BulkCreateMaterialsInput
): Promise<BulkImportResult> {
  if (args.items.length > 200) {
    throw ruleViolation("Máximo de 200 materiais por importação");
  }

  const result = emptyBulkImportResult();
  const now = Date.now();
  const source = args.source?.trim() || "catalog-import";
  let firstCreatedId: string | null = null;
  const inventoryLines = new Map<
    Id<"materials">,
    { quantity: number; unitCostCents?: number }
  >();

  for (let i = 0; i < args.items.length; i++) {
    const row = i + 1;
    const item = args.items[i]!;
    const nameCheck = requireTrimmedName(item.name, row, "Nome");
    if (!nameCheck.ok) {
      result.errors.push(nameCheck.error);
      continue;
    }
    if (
      item.quantity !== undefined &&
      (!Number.isFinite(item.quantity) || item.quantity < 0)
    ) {
      result.errors.push({
        row,
        message: "Quantidade deve ser um número não negativo",
      });
      continue;
    }
    if (
      !Number.isInteger(item.sourceRowNumber) ||
      item.sourceRowNumber <= 0
    ) {
      result.errors.push({
        row,
        message: "Número da linha de origem deve ser um inteiro positivo",
      });
      continue;
    }
    if (
      item.unitCostCents !== undefined &&
      (!Number.isFinite(item.unitCostCents) || item.unitCostCents < 0)
    ) {
      result.errors.push({
        row,
        message: "Custo unitário deve ser um número não negativo",
      });
      continue;
    }

    const family = await findOrCreateFamily(ctx, {
      name: nameCheck.name,
      category: item.category?.trim() || undefined,
      baseUnit: normalizeUnit(item.unit),
    });
    const dimensions = sanitizeDimensions(item.dimensions);
    const technicalAttributes = sanitizeTechnicalAttributes(
      item.technicalAttributes
    );
    const variantLabel = deriveVariantLabel({
      variantLabel: item.variantLabel,
      dimensions,
    });
    const unit = normalizeUnit(item.unit);
    const identityKey = materialIdentityInput({
      familyId: family._id,
      unit,
      variantLabel,
      dimensions,
      technicalAttributes,
    });
    const sourceMaterialId = item.sourceMaterialId?.trim() ?? "";
    const sourceDetailId = item.sourceDetailId?.trim() ?? "";
    const rowKey =
      sourceMaterialId && sourceDetailId
        ? `${sourceMaterialId}:${sourceDetailId}`
        : sourceMaterialId
          ? `${sourceMaterialId}:${sourceDetailId}:${identityKey}:${item.sourceRowNumber}`
          : identityKey;
    const importedRow = await ctx.db
      .query("materialImportRows")
      .withIndex("by_source_row", (q) =>
        q.eq("source", source).eq("rowKey", rowKey)
      )
      .first();
    if (importedRow) {
      result.skipped++;
      continue;
    }
    const existingIdentity = await findMaterialByIdentity(ctx, {
      identityKey,
    });
    let materialId = existingIdentity?._id;
    if (materialId) {
      result.skipped++;
    } else {
      const sku = await allocateNextSku(ctx);
      materialId = await ctx.db.insert("materials", {
        name: family.name,
        familyId: family._id,
        variantLabel,
        dimensions,
        identityKey,
        sku,
        category: item.category?.trim() || undefined,
        unit,
        spec: item.spec?.trim() || undefined,
        brandPreference: item.brandPreference?.trim() || undefined,
        technicalAttributes,
        searchText: buildMaterialSearchText({
          name: family.name,
          variantLabel,
          sku,
          category: item.category?.trim() || undefined,
          brandPreference: item.brandPreference?.trim() || undefined,
          spec: item.spec?.trim() || undefined,
        }),
        trackInventory: true,
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      if (!firstCreatedId) firstCreatedId = materialId;
      result.created++;
    }

    for (const alias of item.aliases ?? []) {
      const trimmed = alias.trim();
      if (!trimmed) continue;
      await insertUniqueAlias(ctx, materialId, trimmed, now);
    }

    await ctx.db.insert("materialImportRows", {
      source,
      rowKey,
      materialId,
      sourceMaterialId: item.sourceMaterialId?.trim() || undefined,
      sourceDetailId: item.sourceDetailId?.trim() || undefined,
      sourceRowNumber: item.sourceRowNumber,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
      importedAt: now,
    });
    if (item.quantity !== undefined && item.quantity > 0) {
      const current = inventoryLines.get(materialId);
      inventoryLines.set(materialId, {
        quantity: (current?.quantity ?? 0) + item.quantity,
        unitCostCents: item.unitCostCents ?? current?.unitCostCents,
      });
    }
  }

  if (inventoryLines.size > 0) {
    const document = await createInventoryDocument(ctx, user, {
      type: "entry",
      reference: `Importação ${source}`,
      notes: "Saldo inicial importado da planilha de origem",
      lines: [...inventoryLines.entries()].map(([materialId, line]) => ({
        materialId,
        quantity: line.quantity,
        unitCostCents: line.unitCostCents,
      })),
    });
    await postInventoryDocument(ctx, user, document.documentId);
  }

  if (result.created > 0 && firstCreatedId) {
    await logAudit(ctx, user, {
      action: "create",
      tableName: "materials",
      recordId: firstCreatedId,
      details: `Importação CSV: ${result.created} criados, ${result.skipped} ignorados`,
    });
  }

  return result;
}
