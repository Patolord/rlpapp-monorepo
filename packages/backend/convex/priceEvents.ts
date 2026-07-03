import { v } from "convex/values";
import {
  engineeringOrPurchasingQuery,
  purchasingMutation,
  purchasingQuery,
} from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { priceEventReviewStatus, priceEventSource } from "./schema";
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

    events = events.filter(
      (e) => e.reviewStatus !== "ignored" && e.reviewStatus !== "duplicate"
    );

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
    notes: v.optional(v.string()),
  },
  returns: v.id("priceEvents"),
  handler: async (ctx, args) => {
    if (args.unitPriceCents < 0) throw new Error("Preço inválido");

    const needsReview = computeNeedsReview({
      materialId: args.materialId,
      supplierId: args.supplierId,
      supplierNameRaw: args.supplierNameRaw,
      unit: args.unit,
      rawDescription: args.rawDescription,
    });

    const now = Date.now();
    const eventId = await ctx.db.insert("priceEvents", {
      rawDescription: args.rawDescription?.trim() || undefined,
      materialId: args.materialId,
      supplierId: args.supplierId,
      supplierNameRaw: args.supplierNameRaw?.trim() || undefined,
      unitPriceCents: args.unitPriceCents,
      unit: args.unit?.trim() || undefined,
      quantity: args.quantity,
      source: args.source,
      occurredAt: args.occurredAt,
      validUntil: args.validUntil,
      projectId: args.projectId,
      takeoffId: args.takeoffId,
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
