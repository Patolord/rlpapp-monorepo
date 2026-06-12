import { v } from "convex/values";
import { staffMutation, staffQuery } from "./lib/functions";

// Listar todos os produtos
export const list = staffQuery({
  args: {
    onlyActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.onlyActive) {
      return await ctx.db
        .query("products")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("products").collect();
  },
});

// Buscar produto por ID
export const get = staffQuery({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get("products", args.id);
  },
});

// Criar produto
export const create = staffMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    unit: v.string(),
    minQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const productId = await ctx.db.insert("products", {
      name: args.name,
      description: args.description,
      unit: args.unit,
      minQuantity: args.minQuantity,
      isActive: true,
    });
    return productId;
  },
});

// Atualizar produto
export const update = staffMutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    unit: v.optional(v.string()),
    minQuantity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get("products", id);
    if (!existing) {
      throw new Error("Produto não encontrado");
    }
    
    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    await ctx.db.patch("products", id, filteredUpdates);
    return id;
  },
});

// Deletar produto (soft delete)
export const remove = staffMutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("products", args.id);
    if (!existing) {
      throw new Error("Produto não encontrado");
    }
    await ctx.db.patch("products", args.id, { isActive: false });
    return args.id;
  },
});

// Buscar produtos com estoque baixo
export const getLowStock = staffQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    const lowStockProducts = [];
    
    for (const product of products) {
      const snapshot = await ctx.db
        .query("inventorySnapshot")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .first();
      
      const warehouseQty = snapshot?.qtyOnHand ?? 0;
      
      if (warehouseQty < product.minQuantity) {
        lowStockProducts.push({
          ...product,
          currentStock: warehouseQty,
          deficit: product.minQuantity - warehouseQty,
        });
      }
    }
    
    return lowStockProducts;
  },
});
