import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  inventoryCaptureMutation,
  inventoryCaptureQuery,
} from "./lib/rbac";
import {
  captureCatalogPage,
  captureMaterial,
  getCaptureReview,
  listMyCaptures,
  lookupCapture,
} from "./model/inventory/capture";
import {
  materialCaptureMatchReason,
  materialCaptureOutcome,
  materialCaptureQuantityMode,
} from "./schema/inventory";
import { materialStatus } from "./schema/procurement";

// Cadastro em campo pelo celular: identificar, cadastrar e contar itens no
// estoque central ou numa obra, sem criar duplicatas.

const captureItemValidator = v.object({
  name: v.string(),
  variantLabel: v.optional(v.string()),
  unit: v.optional(v.string()),
  category: v.optional(v.string()),
  barcode: v.optional(v.string()),
  manufacturer: v.optional(v.string()),
  manufacturerPartNumber: v.optional(v.string()),
  spec: v.optional(v.string()),
});

const candidateValidator = v.object({
  materialId: v.id("materials"),
  name: v.string(),
  variantLabel: v.union(v.string(), v.null()),
  sku: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  barcode: v.union(v.string(), v.null()),
  status: materialStatus,
  reason: v.union(
    v.literal("barcode"),
    v.literal("sku"),
    v.literal("identity"),
    v.literal("alias"),
    v.literal("similar")
  ),
  quantityHere: v.union(v.number(), v.null()),
  physicalAddress: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
});

/** O item lido ou digitado já existe? Traz o certo e os parecidos. */
export const lookup = inventoryCaptureQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    code: v.optional(v.string()),
    item: v.optional(captureItemValidator),
  },
  returns: v.object({
    exact: v.union(candidateValidator, v.null()),
    similar: v.array(candidateValidator),
  }),
  handler: async (ctx, args) => {
    return await lookupCapture(ctx, ctx.user, args);
  },
});

/** Registra um item capturado (idempotente pelo `clientId` do aparelho). */
export const capture = inventoryCaptureMutation({
  args: {
    clientId: v.string(),
    projectId: v.optional(v.id("projects")),
    materialId: v.optional(v.id("materials")),
    item: v.optional(captureItemValidator),
    confirmedNew: v.optional(v.boolean()),
    quantityMode: v.optional(materialCaptureQuantityMode),
    quantity: v.number(),
    physicalAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    offline: v.optional(v.boolean()),
    capturedAt: v.number(),
  },
  returns: v.object({
    captureId: v.id("materialCaptures"),
    replayed: v.boolean(),
    outcome: materialCaptureOutcome,
    matchReason: materialCaptureMatchReason,
    materialId: v.id("materials"),
    name: v.string(),
    variantLabel: v.union(v.string(), v.null()),
    sku: v.union(v.string(), v.null()),
    unit: v.union(v.string(), v.null()),
    quantityDelta: v.number(),
    quantityHere: v.number(),
    similarCount: v.number(),
  }),
  handler: async (ctx, args) => {
    return await captureMaterial(ctx, ctx.user, args);
  },
});

/** URL de upload da foto do item. */
export const generateUploadUrl = inventoryCaptureMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Últimos cadastros feitos pela pessoa. */
export const listMine = inventoryCaptureQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("materialCaptures"),
      clientId: v.string(),
      outcome: materialCaptureOutcome,
      matchReason: materialCaptureMatchReason,
      materialId: v.id("materials"),
      name: v.string(),
      variantLabel: v.union(v.string(), v.null()),
      sku: v.union(v.string(), v.null()),
      unit: v.union(v.string(), v.null()),
      materialStatus: materialStatus,
      locationName: v.string(),
      quantityMode: materialCaptureQuantityMode,
      countedQuantity: v.number(),
      physicalAddress: v.union(v.string(), v.null()),
      offline: v.boolean(),
      capturedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await listMyCaptures(ctx, ctx.user, args);
  },
});

/** Catálogo enxuto, por páginas, para conferir duplicatas sem sinal. */
export const catalogPage = inventoryCaptureQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.string(),
    page: v.array(
      v.object({
        _id: v.id("materials"),
        name: v.string(),
        variantLabel: v.union(v.string(), v.null()),
        sku: v.union(v.string(), v.null()),
        barcode: v.union(v.string(), v.null()),
        unit: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    return await captureCatalogPage(ctx, args);
  },
});

/** Origem em campo e parecidos de um material (revisão de rascunhos em Compras). */
export const reviewForMaterial = engineeringOrPurchasingQuery({
  args: { materialId: v.id("materials") },
  returns: v.union(
    v.null(),
    v.object({
      captures: v.array(
        v.object({
          _id: v.id("materialCaptures"),
          outcome: materialCaptureOutcome,
          capturedAt: v.number(),
          capturedByName: v.string(),
          locationName: v.string(),
          countedQuantity: v.number(),
          offline: v.boolean(),
          photoUrl: v.union(v.string(), v.null()),
        })
      ),
      similar: v.array(
        v.object({
          materialId: v.id("materials"),
          name: v.string(),
          variantLabel: v.union(v.string(), v.null()),
          sku: v.union(v.string(), v.null()),
          unit: v.union(v.string(), v.null()),
          status: materialStatus,
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    return await getCaptureReview(ctx, args.materialId);
  },
});
