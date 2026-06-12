import { v } from "convex/values";
import { getShipmentLinesWithProducts } from "./lib/enrich";
import { staffMutation, staffQuery } from "./lib/functions";

// Listar todos os sites
export const list = staffQuery({
  args: {
    onlyActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.onlyActive) {
      return await ctx.db
        .query("sites")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("sites").collect();
  },
});

// Buscar site por ID
export const get = staffQuery({
  args: { id: v.id("sites") },
  handler: async (ctx, args) => {
    return await ctx.db.get("sites", args.id);
  },
});

// Criar site
export const create = staffMutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
    responsiblePhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const siteId = await ctx.db.insert("sites", {
      name: args.name,
      address: args.address,
      responsibleName: args.responsibleName,
      responsiblePhone: args.responsiblePhone,
      isActive: true,
    });
    return siteId;
  },
});

// Atualizar site
export const update = staffMutation({
  args: {
    id: v.id("sites"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    responsibleName: v.optional(v.string()),
    responsiblePhone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get("sites", id);
    if (!existing) {
      throw new Error("Site não encontrado");
    }
    
    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    await ctx.db.patch("sites", id, filteredUpdates);
    return id;
  },
});

// Deletar site (soft delete)
export const remove = staffMutation({
  args: { id: v.id("sites") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("sites", args.id);
    if (!existing) {
      throw new Error("Site não encontrado");
    }
    await ctx.db.patch("sites", args.id, { isActive: false });
    return args.id;
  },
});

// Buscar remessas entregues a um site
export const getDeliveries = staffQuery({
  args: { siteId: v.id("sites") },
  handler: async (ctx, args) => {
    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_site", (q) => q.eq("toSiteId", args.siteId))
      .collect();

    const delivered = shipments.filter(
      (s) => s.status === "DeliveredConfirmed"
    );

    return Promise.all(
      delivered.map(async (shipment) => {
        const lines = await getShipmentLinesWithProducts(ctx, shipment._id);
        return { ...shipment, lines };
      })
    );
  },
});
