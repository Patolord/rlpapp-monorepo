import { v } from "convex/values";
import {
  engineeringMutation,
  engineeringOrPurchasingQuery,
  purchasingMutation,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import {
  materialDimensions,
  takeoffBudgetMeta,
  takeoffItemStatus,
  takeoffSource,
  takeoffStatus,
} from "./schema";
import { sanitizeDimensions } from "./lib/compras/catalog";
import {
  normalizeText,
  priceFreshness,
  suggestedUnitPriceCents,
} from "./lib/compras/procurement";
import { promoteTakeoffItem } from "./model/procurement/takeoffPromotion";
import { isUsablePriceEvent } from "./model/procurement/priceSelection";
import { computePriceChange } from "./model/procurement/priceHistory";
import {
  publishDesktopBudget,
  publishDesktopBudgetArgs,
  publishDesktopBudgetResult,
} from "./model/procurement/desktopBudget";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const takeoffValidator = v.object({
  _id: v.id("takeoffs"),
  _creationTime: v.number(),
  projectId: v.union(v.id("projects"), v.null()),
  projectName: v.union(v.string(), v.null()),
  projectSlug: v.union(v.string(), v.null()),
  name: v.string(),
  status: v.union(takeoffStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  itemCount: v.number(),
  /** "desktop" quando publicado pelo app desktop de takeoff. */
  source: v.union(takeoffSource, v.null()),
  externalId: v.union(v.string(), v.null()),
  /** Cabeçalho e resumo por aba do orçamento publicado pelo desktop. */
  budget: v.union(takeoffBudgetMeta, v.null()),
  publishedAt: v.union(v.number(), v.null()),
  publishedByName: v.union(v.string(), v.null()),
});

export const takeoffItemValidator = v.object({
  _id: v.id("takeoffItems"),
  _creationTime: v.number(),
  takeoffId: v.id("takeoffs"),
  projectId: v.union(v.id("projects"), v.null()),
  rawDescription: v.string(),
  quantity: v.union(v.number(), v.null()),
  unit: v.union(v.string(), v.null()),
  materialId: v.union(v.id("materials"), v.null()),
  materialName: v.union(v.string(), v.null()),
  customDimensions: v.union(materialDimensions, v.null()),
  customSpecification: v.union(v.string(), v.null()),
  estimatedUnitPriceCents: v.union(v.number(), v.null()),
  notes: v.union(v.string(), v.null()),
  status: v.union(takeoffItemStatus, v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  /** Linhas do desktop: id estável, aba, seção, mão de obra e posição. */
  externalLineId: v.union(v.string(), v.null()),
  sheet: v.union(v.string(), v.null()),
  section: v.union(v.string(), v.null()),
  laborUnitPriceCents: v.union(v.number(), v.null()),
  /** Totais da linha como o desktop calculou (null: quantidade × preço). */
  materialTotalCents: v.union(v.number(), v.null()),
  laborTotalCents: v.union(v.number(), v.null()),
  sortOrder: v.union(v.number(), v.null()),
  /** Saiu do orçamento desktop mas foi mantida pela Compras. */
  externalRemovedAt: v.union(v.number(), v.null()),
  warnings: v.array(v.string()),
  latestPrices: v.array(
    v.object({
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      source: v.string(),
      freshness: v.union(
        v.literal("fresh"),
        v.literal("usable"),
        v.literal("old"),
        v.literal("stale")
      ),
      suggestedUnitPriceCents: v.union(v.number(), v.null()),
    })
  ),
  /** Cotações registradas para este item, mais recente primeiro. */
  quotes: v.array(
    v.object({
      _id: v.id("priceEvents"),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      validUntil: v.union(v.number(), v.null()),
      source: v.string(),
      /** Desvio da cotação em relação ao preço estimado do item. */
      versusEstimate: v.union(
        v.object({
          deltaCents: v.number(),
          deltaPercent: v.union(v.number(), v.null()),
          fromCents: v.number(),
          fromAt: v.number(),
        }),
        v.null()
      ),
    })
  ),
});

async function resolveItemQuotes(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  item: {
    _id: import("./_generated/dataModel").Id<"takeoffItems">;
    estimatedUnitPriceCents?: number;
    updatedAt?: number;
    createdAt: number;
  }
) {
  const events = await ctx.db
    .query("priceEvents")
    .withIndex("by_takeoff_item", (q) => q.eq("takeoffItemId", item._id))
    .collect();
  const out = [];
  for (const event of events) {
    if (!isUsablePriceEvent(event)) continue;
    let supplierName = event.supplierNameRaw ?? "Fornecedor";
    if (event.supplierId) {
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      if (supplier) supplierName = supplier.name;
    }
    out.push({
      _id: event._id,
      supplierId: event.supplierId ?? null,
      supplierName,
      unitPriceCents: event.unitPriceCents,
      unit: event.unit ?? null,
      occurredAt: event.occurredAt,
      validUntil: event.validUntil ?? null,
      source: event.source,
      versusEstimate:
        item.estimatedUnitPriceCents !== undefined
          ? computePriceChange(event, {
              unitPriceCents: item.estimatedUnitPriceCents,
              occurredAt: item.updatedAt ?? item.createdAt,
            })
          : null,
    });
  }
  return out.sort((a, b) => b.occurredAt - a.occurredAt);
}

type PriceLookupCache = {
  recent?: Doc<"priceEvents">[];
  byMaterial?: Map<string, Doc<"priceEvents">[]>;
};

async function resolveLatestPrices(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  params: {
    materialId?: import("./_generated/dataModel").Id<"materials">;
    rawDescription: string;
    now: number;
  },
  cache: PriceLookupCache = {}
) {
  const materialId = params.materialId;
  let events: Doc<"priceEvents">[] = [];
  if (materialId) {
    cache.byMaterial ??= new Map();
    const cached = cache.byMaterial.get(materialId);
    if (cached) {
      events = cached;
    } else {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", materialId))
        .order("desc")
        .take(50);
      cache.byMaterial.set(materialId, events);
    }
  }

  let filtered = events.filter(
    (e) => e.reviewStatus !== "ignored" && e.reviewStatus !== "duplicate"
  );

  if (filtered.length === 0 && params.rawDescription.trim()) {
    const term = normalizeText(params.rawDescription);
    cache.recent ??= await ctx.db
      .query("priceEvents")
      .order("desc")
      .take(200);
    const all = cache.recent;
    filtered = all.filter(
      (e) =>
        e.reviewStatus !== "ignored" &&
        e.reviewStatus !== "duplicate" &&
        e.rawDescription &&
        normalizeText(e.rawDescription).includes(term)
    );
  }

  const bySupplier = new Map<string, (typeof filtered)[number]>();
  for (const event of filtered) {
    const key = event.supplierId ?? event.supplierNameRaw ?? event._id;
    if (!bySupplier.has(key)) bySupplier.set(key, event);
  }

  const results = [];
  for (const event of bySupplier.values()) {
    let supplierName = event.supplierNameRaw ?? "Fornecedor";
    if (event.supplierId) {
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      if (supplier) supplierName = supplier.name;
    }
    const freshness = priceFreshness(event.occurredAt, params.now);
    results.push({
      supplierId: event.supplierId ?? null,
      supplierName,
      unitPriceCents: event.unitPriceCents,
      unit: event.unit ?? null,
      occurredAt: event.occurredAt,
      source: event.source,
      freshness,
      suggestedUnitPriceCents: suggestedUnitPriceCents(
        event.unitPriceCents,
        freshness
      ),
    });
  }

  return results.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 5);
}

function itemWarnings(item: {
  materialId?: import("./_generated/dataModel").Id<"materials">;
  unit?: string;
  estimatedUnitPriceCents?: number;
}): string[] {
  const warnings: string[] = [];
  if (!item.materialId) warnings.push("Sem material vinculado");
  if (!item.unit?.trim()) warnings.push("Unidade ausente");
  if (item.estimatedUnitPriceCents === undefined) {
    warnings.push("Sem preço estimado");
  }
  return warnings;
}

async function takeoffSummary(
  ctx: { db: QueryCtx["db"] },
  t: Doc<"takeoffs">,
  itemCount: number
) {
  let projectName: string | null = null;
  let projectSlug: string | null = null;
  if (t.projectId) {
    const project = await ctx.db.get("projects", t.projectId);
    projectName = project?.name ?? null;
    projectSlug = project ? (project.slug ?? project._id) : null;
  }
  let publishedByName: string | null = null;
  if (t.publishedByUserId) {
    const user = await ctx.db.get("users", t.publishedByUserId);
    publishedByName = user?.name ?? null;
  }
  return {
    _id: t._id,
    _creationTime: t._creationTime,
    projectId: t.projectId ?? null,
    projectName,
    projectSlug,
    name: t.name,
    status: t.status ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt ?? null,
    itemCount,
    source: t.source ?? null,
    externalId: t.externalId ?? null,
    budget: t.budget ?? null,
    publishedAt: t.publishedAt ?? null,
    publishedByName,
  };
}

export const list = engineeringOrPurchasingQuery({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  returns: v.array(takeoffValidator),
  handler: async (ctx, args) => {
    const takeoffs = args.projectId
      ? await ctx.db
          .query("takeoffs")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .collect()
      : await ctx.db.query("takeoffs").order("desc").collect();

    const out = [];
    for (const t of takeoffs) {
      const items = await ctx.db
        .query("takeoffItems")
        .withIndex("by_takeoff", (q) => q.eq("takeoffId", t._id))
        .collect();
      out.push(await takeoffSummary(ctx, t, items.length));
    }
    return out;
  },
});

export const get = engineeringOrPurchasingQuery({
  args: {
    takeoffId: v.id("takeoffs"),
    now: v.number(),
  },
  returns: v.union(
    v.object({
      takeoff: takeoffValidator,
      items: v.array(takeoffItemValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const takeoff = await ctx.db.get("takeoffs", args.takeoffId);
    if (!takeoff) return null;

    const items = await ctx.db
      .query("takeoffItems")
      .withIndex("by_takeoff", (q) => q.eq("takeoffId", args.takeoffId))
      .collect();
    // Linhas do desktop na ordem da planilha; as manuais seguem pela criação.
    items.sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    );

    // Orçamentos do desktop têm centenas de linhas: a busca por descrição
    // (sem material) lê os eventos recentes uma vez só.
    const priceCache: PriceLookupCache = {};
    const itemsOut = [];
    for (const item of items) {
      let materialName: string | null = null;
      if (item.materialId) {
        const material = await ctx.db.get("materials", item.materialId);
        materialName = material?.name ?? null;
      }
      const [latestPrices, quotes] = await Promise.all([
        resolveLatestPrices(
          ctx,
          {
            materialId: item.materialId,
            rawDescription: item.rawDescription,
            now: args.now,
          },
          priceCache
        ),
        resolveItemQuotes(ctx, item),
      ]);
      itemsOut.push({
        _id: item._id,
        _creationTime: item._creationTime,
        takeoffId: item.takeoffId,
        projectId: item.projectId ?? null,
        rawDescription: item.rawDescription,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        materialId: item.materialId ?? null,
        materialName,
        customDimensions: item.customDimensions ?? null,
        customSpecification: item.customSpecification ?? null,
        estimatedUnitPriceCents: item.estimatedUnitPriceCents ?? null,
        notes: item.notes ?? null,
        status: item.status ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt ?? null,
        externalLineId: item.externalLineId ?? null,
        sheet: item.sheet ?? null,
        section: item.section ?? null,
        laborUnitPriceCents: item.laborUnitPriceCents ?? null,
        materialTotalCents: item.materialTotalCents ?? null,
        laborTotalCents: item.laborTotalCents ?? null,
        sortOrder: item.sortOrder ?? null,
        externalRemovedAt: item.externalRemovedAt ?? null,
        warnings: itemWarnings(item),
        latestPrices,
        quotes,
      });
    }

    return {
      takeoff: await takeoffSummary(ctx, takeoff, itemsOut.length),
      items: itemsOut,
    };
  },
});

export const create = engineeringMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
  },
  returns: v.id("takeoffs"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Informe o nome do takeoff");

    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project) throw new Error("Obra não encontrada");
    }

    const now = Date.now();
    const takeoffId = await ctx.db.insert("takeoffs", {
      projectId: args.projectId,
      name,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "takeoffs",
      recordId: takeoffId,
      details: name,
    });

    return takeoffId;
  },
});

export const addItem = engineeringMutation({
  args: {
    takeoffId: v.id("takeoffs"),
    rawDescription: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    customDimensions: v.optional(materialDimensions),
    customSpecification: v.optional(v.string()),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  returns: v.id("takeoffItems"),
  handler: async (ctx, args) => {
    const takeoff = await ctx.db.get("takeoffs", args.takeoffId);
    if (!takeoff) throw new Error("Takeoff não encontrado");

    const rawDescription = args.rawDescription.trim();
    if (!rawDescription) throw new Error("Informe a descrição do item");

    const now = Date.now();
    const customDimensions = sanitizeDimensions(args.customDimensions);
    const itemId = await ctx.db.insert("takeoffItems", {
      takeoffId: args.takeoffId,
      projectId: takeoff.projectId,
      rawDescription,
      quantity: args.quantity,
      unit: args.unit?.trim() || undefined,
      materialId: args.materialId,
      customDimensions,
      customSpecification: args.customSpecification?.trim() || undefined,
      estimatedUnitPriceCents: args.estimatedUnitPriceCents,
      notes: args.notes?.trim() || undefined,
      status: args.materialId ? "matched" : "draft",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch("takeoffs", args.takeoffId, { updatedAt: now });
    return itemId;
  },
});

export const updateItem = engineeringMutation({
  args: {
    itemId: v.id("takeoffItems"),
    rawDescription: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    customDimensions: v.optional(materialDimensions),
    customSpecification: v.optional(v.string()),
    estimatedUnitPriceCents: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(takeoffItemStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("takeoffItems", args.itemId);
    if (!item) throw new Error("Item não encontrado");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.rawDescription !== undefined) {
      const desc = args.rawDescription.trim();
      if (!desc) throw new Error("Informe a descrição do item");
      updates.rawDescription = desc;
    }
    if (args.quantity !== undefined) updates.quantity = args.quantity;
    // Totais publicados pelo desktop deixam de valer quando a conta muda.
    if (args.quantity !== undefined && args.quantity !== item.quantity) {
      updates.materialTotalCents = undefined;
      updates.laborTotalCents = undefined;
    }
    if (
      args.estimatedUnitPriceCents !== undefined &&
      args.estimatedUnitPriceCents !== item.estimatedUnitPriceCents
    ) {
      updates.materialTotalCents = undefined;
    }
    if (args.unit !== undefined) updates.unit = args.unit.trim() || undefined;
    if (args.materialId !== undefined) {
      updates.materialId = args.materialId;
      if (args.materialId && !args.status) updates.status = "matched";
    }
    if (args.customDimensions !== undefined) {
      updates.customDimensions = sanitizeDimensions(args.customDimensions);
    }
    if (args.customSpecification !== undefined) {
      updates.customSpecification =
        args.customSpecification.trim() || undefined;
    }
    if (args.estimatedUnitPriceCents !== undefined) {
      updates.estimatedUnitPriceCents = args.estimatedUnitPriceCents;
    }
    if (args.notes !== undefined) updates.notes = args.notes.trim() || undefined;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch("takeoffItems", args.itemId, updates);
    await ctx.db.patch("takeoffs", item.takeoffId, { updatedAt: Date.now() });
    return null;
  },
});

export const promoteItemToMaterial = purchasingMutation({
  args: {
    itemId: v.id("takeoffItems"),
    familyName: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.object({
    materialId: v.id("materials"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("takeoffItems", args.itemId);
    if (!item) throw new Error("Item não encontrado");
    if (item.materialId) {
      return { materialId: item.materialId, created: false };
    }

    const promoted = await promoteTakeoffItem(ctx, ctx.user, item, {
      familyName: args.familyName,
      category: args.category,
    });
    return { materialId: promoted.materialId, created: promoted.created };
  },
});

export const removeItem = engineeringMutation({
  args: { itemId: v.id("takeoffItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("takeoffItems", args.itemId);
    if (!item) throw new Error("Item não encontrado");
    await ctx.db.delete("takeoffItems", args.itemId);
    await ctx.db.patch("takeoffs", item.takeoffId, { updatedAt: Date.now() });
    return null;
  },
});

export const applySuggestedPrice = engineeringMutation({
  args: {
    itemId: v.id("takeoffItems"),
    unitPriceCents: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get("takeoffItems", args.itemId);
    if (!item) throw new Error("Item não encontrado");
    await ctx.db.patch("takeoffItems", args.itemId, {
      estimatedUnitPriceCents: args.unitPriceCents,
      // o total publicado pelo desktop era do preço anterior, que pode ter
      // frações de centavo mesmo quando arredonda para este mesmo valor
      materialTotalCents: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Publica (ou republica) um orçamento do app desktop de takeoff. Idempotente
 * por `externalId`: cria o takeoff na primeira vez e depois atualiza linhas
 * por `externalLineId`, apagando as que saíram do orçamento — menos as que a
 * Compras já cotou ou levou adiante, que o desktop não altera nem apaga e
 * voltam em `kept`. Só aceita orçamentos em reais (BRL).
 */
export const publishFromDesktop = engineeringMutation({
  args: publishDesktopBudgetArgs,
  returns: publishDesktopBudgetResult,
  handler: async (ctx, args) => {
    const result = await publishDesktopBudget(ctx, ctx.user, args);
    await logAudit(ctx, ctx.user, {
      action: result.created ? "create" : "update",
      tableName: "takeoffs",
      recordId: result.takeoffId,
      entityLabel: args.name.trim(),
      source: "desktop",
      details:
        `Orçamento desktop publicado: ${result.inserted} novas, ` +
        `${result.updated} atualizadas, ${result.removed} removidas, ` +
        `${result.kept.length} mantidas pela Compras`,
    });
    return result;
  },
});
