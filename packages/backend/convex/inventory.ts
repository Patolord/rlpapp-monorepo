import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  inventoryCompatibilityRuleType,
  inventoryDocumentStatus,
  inventoryEventType,
  inventoryMovementType,
} from "./schema";
import {
  inventoryMutation,
  inventoryQuery,
  inventoryRulesMutation,
  staffMutation,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import {
  createInventoryDocument,
  findInventoryLocation,
  postInventoryDocument,
  reviewInventoryDocument,
  reverseInventoryDocument,
  updateInventoryAddress,
} from "./lib/inventory/operations";
import {
  enrichInventoryDocument,
  listProjectInventorySummaries,
} from "./lib/inventory/queries";
import { enrichBalanceWithReplenishment } from "./lib/inventory/stockPolicy";
import { replenishmentState } from "./schema";

const movementInputType = v.union(
  v.literal("entry"),
  v.literal("transfer"),
  v.literal("consumption"),
  v.literal("return"),
  v.literal("adjustment")
);

const documentItemInput = v.object({
  materialId: v.id("materials"),
  quantity: v.number(),
  unitCostCents: v.optional(v.number()),
});

const compatibilityIssueValidator = v.object({
  ruleId: v.id("inventoryCompatibilityRules"),
  materialAId: v.id("materials"),
  materialAName: v.string(),
  materialBId: v.id("materials"),
  materialBName: v.string(),
  message: v.string(),
});

const documentRowValidator = v.object({
  _id: v.id("inventoryDocuments"),
  type: inventoryMovementType,
  status: inventoryDocumentStatus,
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  sourceLocationName: v.union(v.string(), v.null()),
  destinationLocationName: v.union(v.string(), v.null()),
  reference: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  approvalReason: v.union(v.string(), v.null()),
  createdByName: v.string(),
  createdAt: v.number(),
  postedAt: v.union(v.number(), v.null()),
  items: v.array(
    v.object({
      _id: v.id("inventoryDocumentItems"),
      materialId: v.id("materials"),
      materialName: v.string(),
      quantity: v.number(),
      unitCostCents: v.union(v.number(), v.null()),
    })
  ),
  compatibilityIssues: v.array(compatibilityIssueValidator),
});

export const getAccess = inventoryQuery({
  args: {},
  returns: v.object({
    canViewCentral: v.boolean(),
    canWriteCentral: v.boolean(),
    canCreateEntry: v.boolean(),
    canCreateProjectMovement: v.boolean(),
    canConfigureRules: v.boolean(),
    isEngineer: v.boolean(),
  }),
  handler: async (ctx) => {
    const isAdmin =
      ctx.user.role === "director" || ctx.user.role === "admin";
    const isWarehouse = ctx.user.department === "estoque";
    const isEngineer =
      ctx.user.role === "engenheiro" ||
      ctx.user.department === "engenharia";
    return {
      canViewCentral:
        isAdmin ||
        isWarehouse ||
        ctx.user.department === "compras",
      canWriteCentral: isAdmin || isWarehouse,
      canCreateEntry:
        isAdmin || isWarehouse || ctx.user.department === "compras",
      canCreateProjectMovement: isAdmin || isWarehouse || isEngineer,
      canConfigureRules: isAdmin,
      isEngineer: ctx.user.role === "engenheiro",
    };
  },
});

export const listMaterialOptions = inventoryQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(
    v.object({
      _id: v.id("materials"),
      name: v.string(),
      sku: v.union(v.string(), v.null()),
      category: v.union(v.string(), v.null()),
      unit: v.union(v.string(), v.null()),
      technicalAttributes: v.array(
        v.object({ key: v.string(), value: v.string() })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const search = args.search?.trim().toLocaleLowerCase("pt-BR");
    const materials = await ctx.db
      .query("materials")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(500);
    return materials
      .filter(
        (material) =>
          !search ||
          material.name.toLocaleLowerCase("pt-BR").includes(search) ||
          material.category?.toLocaleLowerCase("pt-BR").includes(search) ||
          material.sku?.toLocaleLowerCase("pt-BR").includes(search)
      )
      .map((material) => ({
        _id: material._id,
        name: material.name,
        sku: material.sku ?? null,
        category: material.category ?? null,
        unit: material.unit ?? null,
        technicalAttributes: material.technicalAttributes ?? [],
      }));
  },
});

export const listProjects = inventoryQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      responsibleId: v.union(v.id("users"), v.null()),
    })
  ),
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("desc").take(200);
    return projects.map((project) => ({
      _id: project._id,
      name: project.name,
      responsibleId: project.responsibleId ?? null,
    }));
  },
});

export const listBalances = inventoryQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("inventoryBalances"),
        locationId: v.id("inventoryLocations"),
        locationName: v.string(),
        materialId: v.id("materials"),
        materialName: v.string(),
        materialSku: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
        unit: v.union(v.string(), v.null()),
        quantity: v.number(),
        physicalAddress: v.union(v.string(), v.null()),
        replenishmentState: replenishmentState,
        suggestedOrderQuantity: v.union(v.number(), v.null()),
        minimumQuantity: v.union(v.number(), v.null()),
        reorderPoint: v.union(v.number(), v.null()),
        targetQuantity: v.union(v.number(), v.null()),
        leadTimeDays: v.union(v.number(), v.null()),
        updatedAt: v.number(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const canViewCentral =
      ctx.user.role === "director" ||
      ctx.user.role === "admin" ||
      ctx.user.department === "estoque" ||
      ctx.user.department === "compras";
    if (!args.projectId && !canViewCentral) {
      throw new Error("A Engenharia só pode consultar estoques de obras");
    }
    const location = await findInventoryLocation(ctx, args.projectId);
    if (!location) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const results = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location", (q) => q.eq("locationId", location._id))
      .paginate(args.paginationOpts);
    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (balance) => {
          const material = await ctx.db.get(
            "materials",
            balance.materialId
          );
          const replenishment = await enrichBalanceWithReplenishment(
            ctx,
            balance,
            material
          );
          return {
            _id: balance._id,
            locationId: location._id,
            locationName: location.name,
            materialId: balance.materialId,
            materialName: material?.name ?? "Material removido",
            materialSku: replenishment.materialSku,
            category: material?.category ?? null,
            unit: material?.unit ?? null,
            quantity: balance.quantity,
            physicalAddress: balance.physicalAddress ?? null,
            replenishmentState: replenishment.replenishmentState,
            suggestedOrderQuantity: replenishment.suggestedOrderQuantity,
            minimumQuantity: replenishment.minimumQuantity,
            reorderPoint: replenishment.reorderPoint,
            targetQuantity: replenishment.targetQuantity,
            leadTimeDays: replenishment.leadTimeDays,
            updatedAt: balance.updatedAt,
          };
        })
      ),
    };
  },
});

export const listProjectSummaries = inventoryQuery({
  args: {},
  returns: v.array(
    v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      responsibleId: v.union(v.id("users"), v.null()),
      materialCount: v.number(),
      transferCount: v.number(),
      consumptionCount: v.number(),
      returnCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    return await listProjectInventorySummaries(ctx);
  },
});

export const listDocuments = inventoryQuery({
  args: {
    status: v.optional(inventoryDocumentStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(documentRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const results = args.status
      ? await ctx.db
          .query("inventoryDocuments")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("inventoryDocuments")
          .order("desc")
          .paginate(args.paginationOpts);
    const canViewCentral =
      ctx.user.role === "director" ||
      ctx.user.role === "admin" ||
      ctx.user.department === "estoque" ||
      ctx.user.department === "compras";
    const visiblePage = canViewCentral
      ? results.page
      : results.page.filter((document) => document.projectId !== undefined);
    return {
      ...results,
      page: await Promise.all(
        visiblePage.map(async (document) => {
          return await enrichInventoryDocument(ctx, document);
        })
      ),
    };
  },
});

export const listPendingApprovals = inventoryQuery({
  args: {},
  returns: v.array(documentRowValidator),
  handler: async (ctx) => {
    if (ctx.user.role !== "engenheiro") return [];
    const pending = await ctx.db
      .query("inventoryDocuments")
      .withIndex("by_status", (q) => q.eq("status", "pending_approval"))
      .order("desc")
      .take(100);
    const mine = [];
    for (const document of pending) {
      if (!document.projectId) continue;
      const project = await ctx.db.get("projects", document.projectId);
      if (project?.responsibleId === ctx.user._id) mine.push(document);
    }
    return await Promise.all(
      mine.map(async (document) => {
        return await enrichInventoryDocument(ctx, document);
      })
    );
  },
});

export const listEventsPaginated = inventoryQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("inventoryEvents"),
        type: inventoryEventType,
        documentId: v.id("inventoryDocuments"),
        materialId: v.id("materials"),
        materialName: v.string(),
        unit: v.union(v.string(), v.null()),
        locationName: v.string(),
        quantityDelta: v.number(),
        createdAt: v.number(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(v.union(v.string(), v.null())),
    splitCursor: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const location = await findInventoryLocation(ctx, args.projectId);
    if (!location) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const results = await ctx.db
      .query("inventoryEvents")
      .withIndex("by_location", (q) => q.eq("locationId", location._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (event) => {
          const material = await ctx.db.get("materials", event.materialId);
          return {
            _id: event._id,
            type: event.type,
            documentId: event.documentId,
            materialId: event.materialId,
            materialName: material?.name ?? "Material removido",
            unit: material?.unit ?? null,
            locationName: location.name,
            quantityDelta: event.quantityDelta,
            createdAt: event.createdAt,
          };
        })
      ),
    };
  },
});

const legacyEventType = v.union(
  v.literal("RegisteredIn"),
  v.literal("RegisteredOut"),
  v.literal("Reversal"),
  v.literal("InventoryAdjust")
);

// Compatibilidade com a tela nativa existente. O MVP web usa o endpoint
// paginado acima; este adaptador permanece limitado a 200 eventos.
export const listEvents = inventoryQuery({
  args: {
    type: v.optional(legacyEventType),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("inventoryEvents"),
      type: legacyEventType,
      qtyDelta: v.number(),
      product: v.union(
        v.object({
          name: v.string(),
          unit: v.union(v.string(), v.null()),
        }),
        v.null()
      ),
      refType: v.union(
        v.literal("receipt"),
        v.literal("shipment"),
        v.literal("adjustment")
      ),
      refId: v.string(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 200);
    const events = await ctx.db
      .query("inventoryEvents")
      .order("desc")
      .take(limit);
    const rows = await Promise.all(
      events.map(async (event) => {
        const [material, document] = await Promise.all([
          ctx.db.get("materials", event.materialId),
          ctx.db.get("inventoryDocuments", event.documentId),
        ]);
        const type =
          event.type === "in"
            ? ("RegisteredIn" as const)
            : event.type === "out"
              ? ("RegisteredOut" as const)
              : event.type === "adjustment"
                ? ("InventoryAdjust" as const)
                : ("Reversal" as const);
        const refType =
          document?.type === "entry"
            ? ("receipt" as const)
            : document?.type === "adjustment"
              ? ("adjustment" as const)
              : ("shipment" as const);
        return {
          _id: event._id,
          type,
          qtyDelta: event.quantityDelta,
          product: material
            ? { name: material.name, unit: material.unit ?? null }
            : null,
          refType,
          refId: event.documentId,
          createdAt: event.createdAt,
        };
      })
    );
    return args.type ? rows.filter((row) => row.type === args.type) : rows;
  },
});

export const createDocument = staffMutation({
  args: {
    type: movementInputType,
    projectId: v.optional(v.id("projects")),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(documentItemInput),
  },
  returns: v.object({
    documentId: v.id("inventoryDocuments"),
    status: v.union(v.literal("draft"), v.literal("pending_approval")),
    issueCount: v.number(),
  }),
  handler: async (ctx, args) => {
    return await createInventoryDocument(ctx, ctx.user, args);
  },
});

export const postDocument = staffMutation({
  args: { documentId: v.id("inventoryDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await postInventoryDocument(ctx, ctx.user, args.documentId);
    return null;
  },
});

export const reviewDocument = staffMutation({
  args: {
    documentId: v.id("inventoryDocuments"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reviewInventoryDocument(ctx, ctx.user, args);
    return null;
  },
});

export const reverseDocument = inventoryMutation({
  args: {
    documentId: v.id("inventoryDocuments"),
    reason: v.string(),
  },
  returns: v.id("inventoryDocuments"),
  handler: async (ctx, args) => {
    return await reverseInventoryDocument(ctx, ctx.user, args);
  },
});

export const updatePhysicalAddress = inventoryMutation({
  args: {
    balanceId: v.id("inventoryBalances"),
    physicalAddress: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateInventoryAddress(ctx, ctx.user, args);
    return null;
  },
});

const ruleRowValidator = v.object({
  _id: v.id("inventoryCompatibilityRules"),
  type: inventoryCompatibilityRuleType,
  name: v.string(),
  materialAId: v.union(v.id("materials"), v.null()),
  materialAName: v.union(v.string(), v.null()),
  materialBId: v.union(v.id("materials"), v.null()),
  materialBName: v.union(v.string(), v.null()),
  categoryA: v.union(v.string(), v.null()),
  categoryB: v.union(v.string(), v.null()),
  attributeKey: v.union(v.string(), v.null()),
  message: v.string(),
  active: v.boolean(),
});

export const listRules = inventoryQuery({
  args: {},
  returns: v.array(ruleRowValidator),
  handler: async (ctx) => {
    const rules = await ctx.db
      .query("inventoryCompatibilityRules")
      .order("desc")
      .take(500);
    return await Promise.all(
      rules.map(async (rule) => {
        const [materialA, materialB] = await Promise.all([
          rule.materialAId
            ? ctx.db.get("materials", rule.materialAId)
            : null,
          rule.materialBId
            ? ctx.db.get("materials", rule.materialBId)
            : null,
        ]);
        return {
          _id: rule._id,
          type: rule.type,
          name: rule.name,
          materialAId: rule.materialAId ?? null,
          materialAName: materialA?.name ?? null,
          materialBId: rule.materialBId ?? null,
          materialBName: materialB?.name ?? null,
          categoryA: rule.categoryA ?? null,
          categoryB: rule.categoryB ?? null,
          attributeKey: rule.attributeKey ?? null,
          message: rule.message,
          active: rule.active,
        };
      })
    );
  },
});

export const createRule = inventoryRulesMutation({
  args: {
    type: inventoryCompatibilityRuleType,
    name: v.string(),
    materialAId: v.optional(v.id("materials")),
    materialBId: v.optional(v.id("materials")),
    categoryA: v.optional(v.string()),
    categoryB: v.optional(v.string()),
    attributeKey: v.optional(v.string()),
    message: v.string(),
  },
  returns: v.id("inventoryCompatibilityRules"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const message = args.message.trim();
    const categoryA = args.categoryA?.trim();
    const categoryB = args.categoryB?.trim();
    const attributeKey = args.attributeKey?.trim().toLocaleLowerCase("pt-BR");
    if (!name || !message) {
      throw new Error("Informe o nome e a mensagem da regra");
    }
    if ((!args.materialAId && !categoryA) || (!args.materialBId && !categoryB)) {
      throw new Error("Defina os dois lados da regra");
    }
    if (args.type === "attributes_must_match" && !attributeKey) {
      throw new Error("Informe o atributo que deve coincidir");
    }

    const now = Date.now();
    const ruleId = await ctx.db.insert("inventoryCompatibilityRules", {
      type: args.type,
      name,
      materialAId: args.materialAId,
      materialBId: args.materialBId,
      categoryA: categoryA || undefined,
      categoryB: categoryB || undefined,
      attributeKey:
        args.type === "attributes_must_match" ? attributeKey : undefined,
      message,
      active: true,
      createdByUserId: ctx.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "inventoryCompatibilityRules",
      recordId: ruleId,
      details: name,
    });
    return ruleId;
  },
});

export const setRuleActive = inventoryRulesMutation({
  args: {
    ruleId: v.id("inventoryCompatibilityRules"),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(
      "inventoryCompatibilityRules",
      args.ruleId
    );
    if (!rule) throw new Error("Regra não encontrada");
    await ctx.db.patch("inventoryCompatibilityRules", args.ruleId, {
      active: args.active,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: args.active ? "activate" : "deactivate",
      tableName: "inventoryCompatibilityRules",
      recordId: args.ruleId,
    });
    return null;
  },
});
