import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  inventoryQuery,
  materiaisMutation,
  permissionQuery,
} from "./lib/rbac";
import { materialStatus } from "./schema/procurement";
import { bulkImportResultValidator } from "./model/kernel/bulkImport";
import {
  executeMaterialMerge,
  previewMaterialMerge,
} from "./model/procurement/mergeMaterials";
import {
  addMaterialAlias,
  createMaterialInternal,
  updateMaterial,
} from "./model/procurement/materials";
import { bulkCreateMaterials } from "./model/inventory/materialImport";
import {
  getMaterialCatalogRow,
  listMaterialCatalog,
} from "./model/inventory/materialCatalogRows";
import {
  findMaterialDuplicateCandidates,
  listMaterialAliases,
  listMaterialCategories,
  listMaterialFamilies,
  listMaterials,
  listMaterialVariants,
  suggestMaterials,
} from "./model/procurement/materialQueries";
import {
  bulkMaterialItemValidator,
  materialAliasValidator,
  materialCatalogPageValidator,
  materialCatalogValidator,
  materialDimensionsValidator,
  materialDuplicateCandidateValidator,
  materialFamilyValidator,
  materialMergePreviewValidator,
  materialSuggestionValidator,
  materialValidator,
  technicalAttributeValidator,
} from "./model/procurement/materialValidators";

export const listFamilies = engineeringOrPurchasingQuery({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(materialFamilyValidator),
  handler: async (ctx, args) => {
    return await listMaterialFamilies(ctx, args);
  },
});

export const listVariants = engineeringOrPurchasingQuery({
  args: { familyId: v.id("materialFamilies") },
  returns: v.array(materialValidator),
  handler: async (ctx, args) => {
    return await listMaterialVariants(ctx, args.familyId);
  },
});

export const findDuplicateCandidates = inventoryQuery({
  args: {
    name: v.string(),
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    unit: v.optional(v.string()),
    dimensions: v.optional(materialDimensionsValidator),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    excludeMaterialId: v.optional(v.id("materials")),
  },
  returns: v.array(materialDuplicateCandidateValidator),
  handler: async (ctx, args) => {
    return await findMaterialDuplicateCandidates(ctx, args);
  },
});

export const list = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(materialValidator),
  handler: async (ctx, args) => {
    return await listMaterials(ctx, args);
  },
});

export const listCatalog = engineeringOrPurchasingQuery({
  args: {
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    activeOnly: v.optional(v.boolean()),
    // Filtro por situação do cadastro; "active" exclui rascunhos e arquivados.
    status: v.optional(materialStatus),
    // Referência de tempo para a idade do último preço (padrão: agora).
    now: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: materialCatalogPageValidator,
  handler: async (ctx, args) => {
    return await listMaterialCatalog(ctx, ctx.user, args);
  },
});

export const listCategories = engineeringOrPurchasingQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    return await listMaterialCategories(ctx);
  },
});

export const get = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.union(materialCatalogValidator, v.null()),
  handler: async (ctx, args) => {
    return await getMaterialCatalogRow(ctx, ctx.user, args.materialId);
  },
});

export const suggest = inventoryQuery({
  args: { term: v.string(), limit: v.optional(v.number()) },
  returns: v.array(materialSuggestionValidator),
  handler: async (ctx, args) => {
    return await suggestMaterials(ctx, args);
  },
});

export const create = materiaisMutation({
  args: {
    name: v.string(),
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.string()),
    dimensions: v.optional(materialDimensionsValidator),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    aliases: v.optional(v.array(v.string())),
    imageId: v.optional(v.id("_storage")),
    laborPriceCents: v.optional(v.number()),
  },
  returns: v.id("materials"),
  handler: async (ctx, args) => {
    const created = await createMaterialInternal(ctx, ctx.user, args);
    return created.materialId;
  },
});

export const generateUploadUrl = materiaisMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const bulkCreate = materiaisMutation({
  args: {
    items: v.array(bulkMaterialItemValidator),
    source: v.optional(v.string()),
  },
  returns: bulkImportResultValidator,
  handler: async (ctx, args) => {
    return await bulkCreateMaterials(ctx, ctx.user, args);
  },
});

export const update = materiaisMutation({
  args: {
    materialId: v.id("materials"),
    name: v.optional(v.string()),
    familyId: v.optional(v.id("materialFamilies")),
    variantLabel: v.optional(v.union(v.string(), v.null())),
    dimensions: v.optional(v.union(materialDimensionsValidator, v.null())),
    sku: v.optional(v.string()),
    barcode: v.optional(v.union(v.string(), v.null())),
    manufacturer: v.optional(v.string()),
    manufacturerPartNumber: v.optional(v.string()),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    purchaseUnit: v.optional(v.string()),
    unitsPerPurchaseUnit: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
    spec: v.optional(v.string()),
    brandPreference: v.optional(v.string()),
    technicalAttributes: v.optional(v.array(technicalAttributeValidator)),
    active: v.optional(v.boolean()),
    status: v.optional(materialStatus),
    imageId: v.optional(v.union(v.id("_storage"), v.null())),
    // Mão de obra por unidade, em centavos; `null` remove o preço.
    laborPriceCents: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateMaterial(ctx, ctx.user, args);
    return null;
  },
});

export const addAlias = materiaisMutation({
  args: {
    materialId: v.id("materials"),
    alias: v.string(),
  },
  returns: v.id("materialAliases"),
  handler: async (ctx, args) => {
    return await addMaterialAlias(ctx, args);
  },
});

export const listAliases = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.array(materialAliasValidator),
  handler: async (ctx, args) => {
    return await listMaterialAliases(ctx, args.materialId);
  },
});

export const mergePreview = permissionQuery("materiais.write")({
  args: {
    sourceId: v.id("materials"),
    targetId: v.id("materials"),
  },
  returns: materialMergePreviewValidator,
  handler: async (ctx, args) => {
    return await previewMaterialMerge(ctx, args.sourceId, args.targetId);
  },
});

export const merge = materiaisMutation({
  args: {
    sourceId: v.id("materials"),
    targetId: v.id("materials"),
  },
  returns: v.object({
    sourceId: v.id("materials"),
    targetId: v.id("materials"),
  }),
  handler: async (ctx, args) => {
    return await executeMaterialMerge(
      ctx,
      ctx.user,
      args.sourceId,
      args.targetId
    );
  },
});
