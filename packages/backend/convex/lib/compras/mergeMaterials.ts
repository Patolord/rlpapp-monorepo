import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../audit";
import { buildMaterialSearchText } from "./catalog";
import { normalizeText } from "./procurement";

export type MergeMaterialSummary = {
  _id: Id<"materials">;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  active: boolean;
};

export type MergeLocationPreview = {
  locationId: Id<"inventoryLocations">;
  locationName: string;
  sourceQuantity: number;
  targetQuantity: number;
  mergedQuantity: number;
};

export type MergePreview = {
  source: MergeMaterialSummary;
  target: MergeMaterialSummary;
  locations: MergeLocationPreview[];
  takeoffItemCount: number;
  priceEventCount: number;
  offeringCount: number;
  aliasCount: number;
};

function summarize(material: Doc<"materials">): MergeMaterialSummary {
  return {
    _id: material._id,
    name: material.name,
    variantLabel: material.variantLabel ?? null,
    sku: material.sku ?? null,
    active: material.active,
  };
}

export async function loadMergePair(
  ctx: QueryCtx | MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">
): Promise<{ source: Doc<"materials">; target: Doc<"materials"> }> {
  if (sourceId === targetId) {
    throw new Error("Escolha dois materiais diferentes para mesclar");
  }
  const [source, target] = await Promise.all([
    ctx.db.get("materials", sourceId),
    ctx.db.get("materials", targetId),
  ]);
  if (!source) throw new Error("Material de origem não encontrado");
  if (!target) throw new Error("Material canônico não encontrado");
  if (!target.active || target.status === "archived") {
    throw new Error("O material que permanece não pode estar arquivado");
  }
  if (!source.active || source.status === "archived") {
    throw new Error("Material de origem já foi mesclado ou arquivado");
  }
  return { source, target };
}

async function countByMaterial(
  ctx: QueryCtx | MutationCtx,
  table:
    | "takeoffItems"
    | "priceEvents"
    | "supplierMaterials"
    | "materialAliases",
  materialId: Id<"materials">
): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_material", (q) => q.eq("materialId", materialId))
    .collect();
  return rows.length;
}

export async function previewMaterialMerge(
  ctx: QueryCtx | MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">
): Promise<MergePreview> {
  const { source, target } = await loadMergePair(ctx, sourceId, targetId);
  const sourceBalances = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  const targetBalances = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_material", (q) => q.eq("materialId", targetId))
    .collect();
  const targetQtyByLocation = new Map(
    targetBalances.map((balance) => [balance.locationId, balance.quantity])
  );
  const locationIds = new Set<Id<"inventoryLocations">>([
    ...sourceBalances.map((balance) => balance.locationId),
    ...targetBalances.map((balance) => balance.locationId),
  ]);

  const locations: MergeLocationPreview[] = [];
  for (const locationId of locationIds) {
    const location = await ctx.db.get("inventoryLocations", locationId);
    const sourceQuantity =
      sourceBalances.find((balance) => balance.locationId === locationId)
        ?.quantity ?? 0;
    const targetQuantity = targetQtyByLocation.get(locationId) ?? 0;
    locations.push({
      locationId,
      locationName: location?.name ?? "Local",
      sourceQuantity,
      targetQuantity,
      mergedQuantity: sourceQuantity + targetQuantity,
    });
  }
  locations.sort((a, b) =>
    a.locationName.localeCompare(b.locationName, "pt-BR")
  );

  return {
    source: summarize(source),
    target: summarize(target),
    locations,
    takeoffItemCount: await countByMaterial(ctx, "takeoffItems", sourceId),
    priceEventCount: await countByMaterial(ctx, "priceEvents", sourceId),
    offeringCount: await countByMaterial(ctx, "supplierMaterials", sourceId),
    aliasCount: await countByMaterial(ctx, "materialAliases", sourceId),
  };
}

async function repointMaterialId(
  ctx: MutationCtx,
  table:
    | "inventoryDocumentItems"
    | "inventoryEvents"
    | "takeoffItems"
    | "priceEvents"
    | "materialImportRows",
  sourceId: Id<"materials">,
  targetId: Id<"materials">
): Promise<void> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  for (const row of rows) {
    await ctx.db.patch(table, row._id, { materialId: targetId });
  }
}

async function mergeBalances(
  ctx: MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">,
  now: number
): Promise<number> {
  const sourceBalances = await ctx.db
    .query("inventoryBalances")
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  let totalMoved = 0;
  for (const sourceBalance of sourceBalances) {
    totalMoved += sourceBalance.quantity;
    const targetBalance = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location_material", (q) =>
        q
          .eq("locationId", sourceBalance.locationId)
          .eq("materialId", targetId)
      )
      .unique();
    if (targetBalance) {
      await ctx.db.patch("inventoryBalances", targetBalance._id, {
        quantity: targetBalance.quantity + sourceBalance.quantity,
        updatedAt: now,
      });
      await ctx.db.delete("inventoryBalances", sourceBalance._id);
    } else {
      await ctx.db.patch("inventoryBalances", sourceBalance._id, {
        materialId: targetId,
        updatedAt: now,
      });
    }
  }
  return totalMoved;
}

async function mergeStockPolicies(
  ctx: MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">,
  now: number
): Promise<void> {
  const sourcePolicies = await ctx.db
    .query("inventoryStockPolicies")
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  for (const sourcePolicy of sourcePolicies) {
    const targetPolicy = await ctx.db
      .query("inventoryStockPolicies")
      .withIndex("by_location_material", (q) =>
        q
          .eq("locationId", sourcePolicy.locationId)
          .eq("materialId", targetId)
      )
      .unique();
    if (targetPolicy) {
      await ctx.db.delete("inventoryStockPolicies", sourcePolicy._id);
    } else {
      await ctx.db.patch("inventoryStockPolicies", sourcePolicy._id, {
        materialId: targetId,
        updatedAt: now,
      });
    }
  }
}

async function mergeSupplierOfferings(
  ctx: MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">
): Promise<void> {
  const sourceOfferings = await ctx.db
    .query("supplierMaterials")
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  for (const offering of sourceOfferings) {
    const existing = await ctx.db
      .query("supplierMaterials")
      .withIndex("by_supplier_material", (q) =>
        q.eq("supplierId", offering.supplierId).eq("materialId", targetId)
      )
      .unique();
    if (existing) {
      await ctx.db.delete("supplierMaterials", offering._id);
    } else {
      await ctx.db.patch("supplierMaterials", offering._id, {
        materialId: targetId,
      });
    }
  }
}

async function mergeAliases(
  ctx: MutationCtx,
  source: Doc<"materials">,
  targetId: Id<"materials">,
  now: number
): Promise<void> {
  const sourceAliases = await ctx.db
    .query("materialAliases")
    .withIndex("by_material", (q) => q.eq("materialId", source._id))
    .collect();
  for (const alias of sourceAliases) {
    const existing = await ctx.db
      .query("materialAliases")
      .withIndex("by_alias_normalized", (q) =>
        q.eq("aliasNormalized", alias.aliasNormalized)
      )
      .collect();
    const targetHas = existing.some((row) => row.materialId === targetId);
    if (targetHas) {
      await ctx.db.delete("materialAliases", alias._id);
    } else {
      await ctx.db.patch("materialAliases", alias._id, {
        materialId: targetId,
      });
    }
  }

  const extraAliases = [source.name, source.variantLabel, source.sku].filter(
    (value): value is string => Boolean(value?.trim())
  );
  for (const alias of extraAliases) {
    const aliasNormalized = normalizeText(alias);
    if (!aliasNormalized) continue;
    const existing = await ctx.db
      .query("materialAliases")
      .withIndex("by_alias_normalized", (q) =>
        q.eq("aliasNormalized", aliasNormalized)
      )
      .collect();
    if (existing.some((row) => row.materialId === targetId)) continue;
    await ctx.db.insert("materialAliases", {
      alias: alias.trim(),
      aliasNormalized,
      materialId: targetId,
      createdAt: now,
    });
  }
}

async function mergeCompatibility(
  ctx: MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">,
  now: number
): Promise<void> {
  const rules = await ctx.db.query("inventoryCompatibilityRules").collect();
  for (const rule of rules) {
    const nextA =
      rule.materialAId === sourceId ? targetId : rule.materialAId;
    const nextB =
      rule.materialBId === sourceId ? targetId : rule.materialBId;
    if (nextA === rule.materialAId && nextB === rule.materialBId) continue;
    if (nextA && nextB && nextA === nextB) {
      await ctx.db.delete("inventoryCompatibilityRules", rule._id);
      continue;
    }
    await ctx.db.patch("inventoryCompatibilityRules", rule._id, {
      materialAId: nextA,
      materialBId: nextB,
      updatedAt: now,
    });
  }
}

async function mergeDocumentIssues(
  ctx: MutationCtx,
  sourceId: Id<"materials">,
  targetId: Id<"materials">,
  documentIds: Iterable<Id<"inventoryDocuments">>
): Promise<void> {
  for (const documentId of documentIds) {
    const document = await ctx.db.get("inventoryDocuments", documentId);
    if (!document?.compatibilityIssues?.length) continue;
    const issues = document.compatibilityIssues.map((issue) => ({
      ...issue,
      materialAId:
        issue.materialAId === sourceId ? targetId : issue.materialAId,
      materialBId:
        issue.materialBId === sourceId ? targetId : issue.materialBId,
    }));
    await ctx.db.patch("inventoryDocuments", documentId, {
      compatibilityIssues: issues,
    });
  }
}

export async function executeMaterialMerge(
  ctx: MutationCtx,
  user: Doc<"users">,
  sourceId: Id<"materials">,
  targetId: Id<"materials">
): Promise<{ sourceId: Id<"materials">; targetId: Id<"materials"> }> {
  const { source, target } = await loadMergePair(ctx, sourceId, targetId);
  const now = Date.now();

  const totalQuantityMoved = await mergeBalances(ctx, sourceId, targetId, now);
  await mergeStockPolicies(ctx, sourceId, targetId, now);
  const sourceDocumentItems = await ctx.db
    .query("inventoryDocumentItems")
    .withIndex("by_material", (q) => q.eq("materialId", sourceId))
    .collect();
  const sourceDocumentIds = new Set(
    sourceDocumentItems.map((item) => item.documentId)
  );
  await repointMaterialId(ctx, "inventoryDocumentItems", sourceId, targetId);
  await repointMaterialId(ctx, "inventoryEvents", sourceId, targetId);
  await mergeDocumentIssues(ctx, sourceId, targetId, sourceDocumentIds);
  await repointMaterialId(ctx, "takeoffItems", sourceId, targetId);
  await repointMaterialId(ctx, "priceEvents", sourceId, targetId);
  await repointMaterialId(ctx, "materialImportRows", sourceId, targetId);
  await mergeSupplierOfferings(ctx, sourceId, targetId);
  await mergeAliases(ctx, source, targetId, now);
  await mergeCompatibility(ctx, sourceId, targetId, now);

  const extraSearch = [source.name, source.variantLabel, source.sku]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => normalizeText(value))
    .join(" ");
  await ctx.db.patch("materials", targetId, {
    searchText: [
      buildMaterialSearchText({
        name: target.name,
        variantLabel: target.variantLabel,
        sku: target.sku,
        barcode: target.barcode,
        category: target.category,
        manufacturer: target.manufacturer,
        manufacturerPartNumber: target.manufacturerPartNumber,
        brandPreference: target.brandPreference,
        spec: target.spec,
      }),
      extraSearch,
    ]
      .filter(Boolean)
      .join(" "),
    updatedAt: now,
  });

  await ctx.db.patch("materials", sourceId, {
    active: false,
    status: "archived",
    identityKey: `merged:${sourceId}`,
    sku: undefined,
    barcode: undefined,
    updatedAt: now,
  });

  await logAudit(ctx, user, {
    action: "merge",
    tableName: "materials",
    recordId: targetId,
    entityLabel: target.name,
    details: `Mesclou ${source.name}${source.variantLabel ? ` (${source.variantLabel})` : ""} em ${target.name}${target.variantLabel ? ` (${target.variantLabel})` : ""}; saldo movido: ${totalQuantityMoved}`,
    snapshotBefore: {
      sourceId,
      targetId,
      sourceSku: source.sku,
      targetSku: target.sku,
    },
    snapshotAfter: {
      sourceId,
      targetId,
      totalQuantityMoved,
    },
  });

  return { sourceId, targetId };
}
