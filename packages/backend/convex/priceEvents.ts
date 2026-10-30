import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  purchasingMutation,
  purchasingQuery,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import {
  materialDimensions,
  priceEventReviewStatus,
  priceEventSource,
} from "./schema";
import { isUsablePriceEvent } from "./model/procurement/priceSelection";
import {
  buildPriceHistory,
  priceChangeValidator,
  type PriceChange,
} from "./model/procurement/priceHistory";
import {
  suggestEstimate as suggestEstimateFromCandidates,
  type EstimateCandidate,
} from "./model/procurement/estimateSuggestion";
import { promoteTakeoffItem } from "./model/procurement/takeoffPromotion";
import { sanitizeDimensions } from "./lib/compras/catalog";
import {
  computeNeedsReview,
  normalizeText,
  priceAgeDays,
  priceFreshness,
  suggestedUnitPriceCents,
} from "./lib/compras/procurement";

export const priceEventValidator = v.object({
  _id: v.id("priceEvents"),
  _creationTime: v.number(),
  rawDescription: v.union(v.string(), v.null()),
  materialId: v.union(v.id("materials"), v.null()),
  materialName: v.union(v.string(), v.null()),
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  unitPriceCents: v.number(),
  unit: v.union(v.string(), v.null()),
  quantity: v.union(v.number(), v.null()),
  source: priceEventSource,
  occurredAt: v.number(),
  validUntil: v.union(v.number(), v.null()),
  projectId: v.union(v.id("projects"), v.null()),
  takeoffId: v.union(v.id("takeoffs"), v.null()),
  takeoffItemId: v.union(v.id("takeoffItems"), v.null()),
  dimensions: v.union(materialDimensions, v.null()),
  notes: v.union(v.string(), v.null()),
  reviewStatus: v.union(priceEventReviewStatus, v.null()),
  needsReview: v.boolean(),
  createdAt: v.number(),
  ageDays: v.number(),
  freshness: v.union(
    v.literal("fresh"),
    v.literal("usable"),
    v.literal("old"),
    v.literal("stale")
  ),
  suggestedUnitPriceCents: v.union(v.number(), v.null()),
  warnings: v.array(v.string()),
});

async function enrichEvent(
  ctx: { db: import("./_generated/server").QueryCtx["db"] },
  event: {
    _id: import("./_generated/dataModel").Id<"priceEvents">;
    _creationTime: number;
    rawDescription?: string;
    materialId?: import("./_generated/dataModel").Id<"materials">;
    supplierId?: import("./_generated/dataModel").Id<"suppliers">;
    supplierNameRaw?: string;
    unitPriceCents: number;
    unit?: string;
    quantity?: number;
    source: "manual" | "quote" | "purchase" | "invoice" | "whatsapp" | "supplier_form" | "excel_import";
    occurredAt: number;
    validUntil?: number;
    projectId?: import("./_generated/dataModel").Id<"projects">;
    takeoffId?: import("./_generated/dataModel").Id<"takeoffs">;
    takeoffItemId?: import("./_generated/dataModel").Id<"takeoffItems">;
    dimensions?: import("./lib/compras/catalog").MaterialDimensions;
    notes?: string;
    reviewStatus?: "unreviewed" | "reviewed" | "ignored" | "duplicate";
    needsReview: boolean;
    createdAt: number;
  },
  now: number
) {
  let materialName: string | null = null;
  if (event.materialId) {
    const material = await ctx.db.get("materials", event.materialId);
    materialName = material?.name ?? null;
  }

  let supplierName = event.supplierNameRaw ?? "Fornecedor desconhecido";
  if (event.supplierId) {
    const supplier = await ctx.db.get("suppliers", event.supplierId);
    if (supplier) supplierName = supplier.name;
  }

  const freshness = priceFreshness(event.occurredAt, now);
  const warnings: string[] = [];
  if (event.needsReview) warnings.push("Precisa revisão");
  if (!event.materialId) warnings.push("Sem material vinculado");
  if (!event.supplierId && !event.supplierNameRaw?.trim()) {
    warnings.push("Sem fornecedor vinculado");
  }
  if (!event.unit?.trim()) warnings.push("Unidade ausente");
  if (freshness === "old") warnings.push("Preço antigo — use com cautela");
  if (freshness === "stale") warnings.push("Preço obsoleto — solicite cotação");

  return {
    _id: event._id,
    _creationTime: event._creationTime,
    rawDescription: event.rawDescription ?? null,
    materialId: event.materialId ?? null,
    materialName,
    supplierId: event.supplierId ?? null,
    supplierName,
    unitPriceCents: event.unitPriceCents,
    unit: event.unit ?? null,
    quantity: event.quantity ?? null,
    source: event.source,
    occurredAt: event.occurredAt,
    validUntil: event.validUntil ?? null,
    projectId: event.projectId ?? null,
    takeoffId: event.takeoffId ?? null,
    takeoffItemId: event.takeoffItemId ?? null,
    dimensions: event.dimensions ?? null,
    notes: event.notes ?? null,
    reviewStatus: event.reviewStatus ?? null,
    needsReview: event.needsReview,
    createdAt: event.createdAt,
    ageDays: priceAgeDays(event.occurredAt, now),
    freshness,
    suggestedUnitPriceCents: suggestedUnitPriceCents(
      event.unitPriceCents,
      freshness
    ),
    warnings,
  };
}

export const list = engineeringOrPurchasingQuery({
  args: {
    now: v.number(),
    materialId: v.optional(v.id("materials")),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    limit: v.optional(v.number()),
  },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    let events;

    if (args.materialId) {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
        .order("desc")
        .take(limit);
    } else if (args.projectId) {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    } else if (args.takeoffId) {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_takeoff", (q) => q.eq("takeoffId", args.takeoffId))
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("priceEvents")
        .withIndex("by_occurred_at")
        .order("desc")
        .take(limit);
    }

    const out = [];
    for (const event of events) {
      out.push(await enrichEvent(ctx, event, args.now));
    }
    return out;
  },
});

export const latestForMaterial = engineeringOrPurchasingQuery({
  args: {
    materialId: v.optional(v.id("materials")),
    rawDescription: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    let events = args.materialId
      ? await ctx.db
          .query("priceEvents")
          .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
          .order("desc")
          .take(50)
      : [];

    if (events.length === 0 && args.rawDescription?.trim()) {
      const term = normalizeText(args.rawDescription);
      const all = await ctx.db.query("priceEvents").order("desc").take(200);
      events = all.filter(
        (e) =>
          e.rawDescription && normalizeText(e.rawDescription).includes(term)
      );
    }

    events = events.filter(isUsablePriceEvent);

    const bySupplier = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      const key = event.supplierId ?? event.supplierNameRaw ?? event._id;
      if (!bySupplier.has(key)) bySupplier.set(key, event);
    }

    const out = [];
    for (const event of bySupplier.values()) {
      out.push(await enrichEvent(ctx, event, args.now));
    }
    return out.sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 10);
  },
});

const nullablePriceChange = v.union(priceChangeValidator, v.null());

export function toPriceChange(change: PriceChange | null) {
  return change
    ? {
        deltaCents: change.deltaCents,
        deltaPercent: change.deltaPercent,
        fromCents: change.fromCents,
        fromAt: change.fromAt,
      }
    : null;
}

const priceHistoryPointValidator = v.object({
  _id: v.id("priceEvents"),
  occurredAt: v.number(),
  unitPriceCents: v.number(),
  unit: v.union(v.string(), v.null()),
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  source: priceEventSource,
  needsReview: v.boolean(),
  change: nullablePriceChange,
});

export const priceHistoryValidator = v.object({
  unit: v.union(v.string(), v.null()),
  current: v.union(priceEventValidator, v.null()),
  summary: v.union(
    v.object({
      change30d: nullablePriceChange,
      change90d: nullablePriceChange,
      changeFromPrevious: nullablePriceChange,
      minCents: v.number(),
      minAt: v.number(),
      maxCents: v.number(),
      maxAt: v.number(),
      count: v.number(),
      firstAt: v.number(),
      lastAt: v.number(),
    }),
    v.null()
  ),
  points: v.array(priceHistoryPointValidator),
  suppliers: v.array(
    v.object({
      /** Chave única da série (id, nome bruto ou evento). */
      key: v.string(),
      supplierId: v.union(v.id("suppliers"), v.null()),
      supplierName: v.string(),
      unitPriceCents: v.number(),
      unit: v.union(v.string(), v.null()),
      occurredAt: v.number(),
      source: priceEventSource,
      freshness: v.union(
        v.literal("fresh"),
        v.literal("usable"),
        v.literal("old"),
        v.literal("stale")
      ),
      change: nullablePriceChange,
      count: v.number(),
    })
  ),
  excludedCount: v.number(),
});

/**
 * Histórico de preços de um material com variação: série cronológica na
 * unidade de referência (cada ponto comparado ao anterior do mesmo
 * fornecedor), último preço por fornecedor e resumo (30/90 dias, mín/máx).
 */
export const historyForMaterial = engineeringOrPurchasingQuery({
  args: {
    materialId: v.id("materials"),
    now: v.number(),
  },
  returns: priceHistoryValidator,
  handler: async (ctx, args) => {
    const [material, events] = await Promise.all([
      ctx.db.get("materials", args.materialId),
      ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", args.materialId))
        .collect(),
    ]);
    const history = buildPriceHistory(events, args.now, {
      materialUnit: material?.unit ?? null,
    });

    const supplierNames = new Map<string, string>();
    const supplierNameOf = async (event: {
      supplierId?: import("./_generated/dataModel").Id<"suppliers">;
      supplierNameRaw?: string;
    }) => {
      const fallback = event.supplierNameRaw ?? "Fornecedor desconhecido";
      if (!event.supplierId) return fallback;
      const cached = supplierNames.get(event.supplierId);
      if (cached) return cached;
      const supplier = await ctx.db.get("suppliers", event.supplierId);
      const name = supplier?.name ?? fallback;
      supplierNames.set(event.supplierId, name);
      return name;
    };

    const points = [];
    for (const point of history.points) {
      points.push({
        _id: point.event._id,
        occurredAt: point.event.occurredAt,
        unitPriceCents: point.event.unitPriceCents,
        unit: point.event.unit ?? null,
        supplierId: point.event.supplierId ?? null,
        supplierName: await supplierNameOf(point.event),
        source: point.event.source,
        needsReview: point.event.needsReview,
        change: toPriceChange(point.change),
      });
    }

    const suppliers = [];
    for (const supplier of history.suppliers) {
      suppliers.push({
        key: supplier.key,
        supplierId: supplier.supplierId,
        supplierName: await supplierNameOf(supplier.latest),
        unitPriceCents: supplier.latest.unitPriceCents,
        unit: supplier.latest.unit ?? null,
        occurredAt: supplier.latest.occurredAt,
        source: supplier.latest.source,
        freshness: priceFreshness(supplier.latest.occurredAt, args.now),
        change: toPriceChange(supplier.change),
        count: supplier.count,
      });
    }

    return {
      unit: history.unit,
      current: history.current
        ? await enrichEvent(ctx, history.current, args.now)
        : null,
      summary: history.summary
        ? {
            change30d: toPriceChange(history.summary.change30d),
            change90d: toPriceChange(history.summary.change90d),
            changeFromPrevious: toPriceChange(
              history.summary.changeFromPrevious
            ),
            minCents: history.summary.minCents,
            minAt: history.summary.minAt,
            maxCents: history.summary.maxCents,
            maxAt: history.summary.maxAt,
            count: history.summary.count,
            firstAt: history.summary.firstAt,
            lastAt: history.summary.lastAt,
          }
        : null,
      points,
      suppliers,
      excludedCount: history.excludedCount,
    };
  },
});

export const add = purchasingMutation({
  args: {
    rawDescription: v.optional(v.string()),
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
    supplierNameRaw: v.optional(v.string()),
    unitPriceCents: v.number(),
    unit: v.optional(v.string()),
    quantity: v.optional(v.number()),
    source: priceEventSource,
    occurredAt: v.number(),
    validUntil: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    takeoffId: v.optional(v.id("takeoffs")),
    /**
     * Item do takeoff cotado. Preenche material, takeoff, obra, unidade,
     * descrição e medidas a partir do item; um item sem material ganha o SKU
     * da sua medida, para a cotação contar na família.
     */
    takeoffItemId: v.optional(v.id("takeoffItems")),
    /** Medidas do item cotado (fabricados sob medida). */
    dimensions: v.optional(materialDimensions),
    notes: v.optional(v.string()),
  },
  returns: v.id("priceEvents"),
  handler: async (ctx, args) => {
    if (args.unitPriceCents < 0) throw new Error("Preço inválido");

    let materialId = args.materialId;
    let takeoffId = args.takeoffId;
    let projectId = args.projectId;
    let unit = args.unit?.trim() || undefined;
    let rawDescription = args.rawDescription?.trim() || undefined;
    let dimensions = sanitizeDimensions(args.dimensions);

    if (args.takeoffItemId) {
      const item = await ctx.db.get("takeoffItems", args.takeoffItemId);
      if (!item) throw new Error("Item do takeoff não encontrado");
      if (materialId && item.materialId && materialId !== item.materialId) {
        throw new Error("Material diferente do vinculado ao item do takeoff");
      }
      if (!item.materialId) {
        const promoted = await promoteTakeoffItem(ctx, ctx.user, item);
        materialId = promoted.materialId;
      } else {
        materialId = item.materialId;
      }
      takeoffId ??= item.takeoffId;
      projectId ??= item.projectId;
      unit ??= item.unit?.trim() || undefined;
      rawDescription ??= item.rawDescription;
      dimensions ??= sanitizeDimensions(item.customDimensions);
    }

    if (!dimensions && materialId) {
      const material = await ctx.db.get("materials", materialId);
      dimensions = material?.dimensions;
    }

    const needsReview = computeNeedsReview({
      materialId,
      supplierId: args.supplierId,
      supplierNameRaw: args.supplierNameRaw,
      unit,
      rawDescription,
    });

    const now = Date.now();
    const eventId = await ctx.db.insert("priceEvents", {
      rawDescription,
      materialId,
      supplierId: args.supplierId,
      supplierNameRaw: args.supplierNameRaw?.trim() || undefined,
      unitPriceCents: args.unitPriceCents,
      unit,
      quantity: args.quantity,
      source: args.source,
      occurredAt: args.occurredAt,
      validUntil: args.validUntil,
      projectId,
      takeoffId,
      takeoffItemId: args.takeoffItemId,
      dimensions,
      notes: args.notes?.trim() || undefined,
      reviewStatus: needsReview ? "unreviewed" : "reviewed",
      needsReview,
      createdAt: now,
      createdByUserId: ctx.user._id,
    });

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "priceEvents",
      recordId: eventId,
    });

    return eventId;
  },
});

const estimatePrecedentValidator = v.object({
  eventId: v.id("priceEvents"),
  unitPriceCents: v.number(),
  occurredAt: v.number(),
  dimensions: materialDimensions,
  supplierId: v.union(v.id("suppliers"), v.null()),
  supplierName: v.string(),
  materialId: v.union(v.id("materials"), v.null()),
  variantLabel: v.union(v.string(), v.null()),
  sizeDifferencePercent: v.number(),
});

export const estimateSuggestionValidator = v.object({
  familyId: v.union(v.id("materialFamilies"), v.null()),
  familyName: v.union(v.string(), v.null()),
  method: v.union(
    v.literal("exact"),
    v.literal("nearest"),
    v.literal("regression"),
    v.null()
  ),
  suggestedUnitPriceCents: v.union(v.number(), v.null()),
  confidence: v.union(
    v.literal("high"),
    v.literal("medium"),
    v.literal("low"),
    v.null()
  ),
  compatibleCount: v.number(),
  usedCount: v.number(),
  minCents: v.union(v.number(), v.null()),
  maxCents: v.union(v.number(), v.null()),
  supplierOnly: v.boolean(),
  precedents: v.array(estimatePrecedentValidator),
});

/**
 * Estimativa por tamanho para um item fabricado sob medida, a partir das
 * cotações da mesma família de material. A família vem do material, do id
 * informado ou do nome (descrição livre). Devolve o método usado (medida
 * exata, vizinhos de tamanho próximo ou curva ajustada), a confiança e os
 * precedentes considerados.
 */
export const suggestEstimate = engineeringOrPurchasingQuery({
  args: {
    materialId: v.optional(v.id("materials")),
    familyId: v.optional(v.id("materialFamilies")),
    familyName: v.optional(v.string()),
    dimensions: materialDimensions,
    supplierId: v.optional(v.id("suppliers")),
    now: v.number(),
  },
  returns: estimateSuggestionValidator,
  handler: async (ctx, args) => {
    let family: import("./_generated/dataModel").Doc<"materialFamilies"> | null =
      null;
    if (args.materialId) {
      const material = await ctx.db.get("materials", args.materialId);
      if (material?.familyId) {
        family = await ctx.db.get("materialFamilies", material.familyId);
      }
    }
    if (!family && args.familyId) {
      family = await ctx.db.get("materialFamilies", args.familyId);
    }
    if (!family && args.familyName?.trim()) {
      family = await ctx.db
        .query("materialFamilies")
        .withIndex("by_name_normalized", (q) =>
          q.eq("nameNormalized", normalizeText(args.familyName!))
        )
        .first();
    }

    const empty = {
      familyId: family?._id ?? null,
      familyName: family?.name ?? null,
      method: null,
      suggestedUnitPriceCents: null,
      confidence: null,
      compatibleCount: 0,
      usedCount: 0,
      minCents: null,
      maxCents: null,
      supplierOnly: false,
      precedents: [],
    };
    if (!family) return empty;

    const materials = await ctx.db
      .query("materials")
      .withIndex("by_family", (q) => q.eq("familyId", family!._id))
      .collect();
    const materialById = new Map(materials.map((m) => [m._id, m]));

    const candidates: EstimateCandidate[] = [];
    for (const material of materials) {
      const events = await ctx.db
        .query("priceEvents")
        .withIndex("by_material", (q) => q.eq("materialId", material._id))
        .collect();
      for (const event of events) {
        if (!isUsablePriceEvent(event)) continue;
        const dimensions = event.dimensions ?? material.dimensions;
        if (!dimensions) continue;
        candidates.push({
          eventId: event._id,
          unitPriceCents: event.unitPriceCents,
          occurredAt: event.occurredAt,
          dimensions,
          supplierId: event.supplierId,
          supplierNameRaw: event.supplierNameRaw,
          materialId: material._id,
          needsReview: event.needsReview,
        });
      }
    }

    const result = suggestEstimateFromCandidates(
      candidates,
      args.dimensions,
      args.now,
      { supplierId: args.supplierId ?? null }
    );

    const supplierNames = new Map<string, string>();
    const precedents = [];
    for (const precedent of result.precedents) {
      let supplierName = precedent.supplierNameRaw ?? "Fornecedor desconhecido";
      if (precedent.supplierId) {
        const cached = supplierNames.get(precedent.supplierId);
        if (cached) {
          supplierName = cached;
        } else {
          const supplier = await ctx.db.get("suppliers", precedent.supplierId);
          if (supplier) supplierName = supplier.name;
          supplierNames.set(precedent.supplierId, supplierName);
        }
      }
      precedents.push({
        eventId: precedent.eventId,
        unitPriceCents: precedent.unitPriceCents,
        occurredAt: precedent.occurredAt,
        dimensions: precedent.dimensions,
        supplierId: precedent.supplierId,
        supplierName,
        materialId: precedent.materialId,
        variantLabel: precedent.materialId
          ? (materialById.get(precedent.materialId)?.variantLabel ?? null)
          : null,
        sizeDifferencePercent: precedent.sizeDifferencePercent,
      });
    }

    if (result.method === null) {
      return { ...empty, compatibleCount: result.compatibleCount, precedents };
    }
    return {
      familyId: family._id,
      familyName: family.name,
      method: result.method,
      suggestedUnitPriceCents: result.suggestedUnitPriceCents,
      confidence: result.confidence,
      compatibleCount: result.compatibleCount,
      usedCount: result.usedCount,
      minCents: result.minCents,
      maxCents: result.maxCents,
      supplierOnly: result.supplierOnly,
      precedents,
    };
  },
});

export const reviewQueue = purchasingQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  returns: v.array(priceEventValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const events = await ctx.db
      .query("priceEvents")
      .withIndex("by_needs_review", (q) => q.eq("needsReview", true))
      .order("desc")
      .take(limit);

    const out = [];
    for (const event of events) {
      out.push(await enrichEvent(ctx, event, args.now));
    }
    return out;
  },
});

export const updateReview = purchasingMutation({
  args: {
    eventId: v.id("priceEvents"),
    reviewStatus: priceEventReviewStatus,
    materialId: v.optional(v.id("materials")),
    supplierId: v.optional(v.id("suppliers")),
    unit: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("priceEvents", args.eventId);
    if (!event) throw new Error("Evento de preço não encontrado");

    const materialId = args.materialId ?? event.materialId;
    const supplierId = args.supplierId ?? event.supplierId;
    const unit = args.unit ?? event.unit;

    const needsReview =
      args.reviewStatus === "ignored" || args.reviewStatus === "duplicate"
        ? false
        : computeNeedsReview({
            materialId,
            supplierId,
            supplierNameRaw: event.supplierNameRaw,
            unit,
            rawDescription: event.rawDescription,
          });

    await ctx.db.patch("priceEvents", args.eventId, {
      reviewStatus: args.reviewStatus,
      materialId,
      supplierId,
      unit: unit?.trim() || undefined,
      needsReview,
    });

    await logAudit(ctx, ctx.user, {
      action: "review",
      tableName: "priceEvents",
      recordId: args.eventId,
      details: args.reviewStatus,
    });

    return null;
  },
});

export const dashboardStats = engineeringOrPurchasingQuery({
  args: { now: v.number() },
  returns: v.object({
    activeMaterials: v.number(),
    activeSuppliers: v.number(),
    unreviewedPrices: v.number(),
    stalePrices: v.number(),
    recentEvents: v.number(),
    takeoffsNeedingPricing: v.number(),
  }),
  handler: async (ctx, args) => {
    const materials = await ctx.db.query("materials").collect();
    const suppliers = await ctx.db.query("suppliers").collect();
    const unreviewed = await ctx.db
      .query("priceEvents")
      .withIndex("by_needs_review", (q) => q.eq("needsReview", true))
      .collect();

    const recentEvents = await ctx.db
      .query("priceEvents")
      .withIndex("by_occurred_at")
      .order("desc")
      .take(30);

    let stalePrices = 0;
    for (const event of recentEvents) {
      if (priceFreshness(event.occurredAt, args.now) === "stale") {
        stalePrices += 1;
      }
    }

    const takeoffItems = await ctx.db.query("takeoffItems").collect();
    const takeoffsNeedingPricing = takeoffItems.filter(
      (i) => i.estimatedUnitPriceCents === undefined
    ).length;

    return {
      activeMaterials: materials.filter((m) => m.active).length,
      activeSuppliers: suppliers.filter((s) => s.active).length,
      unreviewedPrices: unreviewed.length,
      stalePrices,
      recentEvents: recentEvents.length,
      takeoffsNeedingPricing,
    };
  },
});
