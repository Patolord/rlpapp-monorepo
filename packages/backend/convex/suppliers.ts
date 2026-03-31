import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

// Listar todos os fornecedores
export const list = query({
  args: {
    onlyActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.onlyActive) {
      return await ctx.db
        .query("suppliers")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("suppliers").collect();
  },
});

// Buscar fornecedor por ID
export const get = query({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Criar fornecedor
export const create = mutation({
  args: {
    name: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const supplierId = await ctx.db.insert("suppliers", {
      name: args.name,
      contactName: args.contactName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      isActive: true,
    });
    return supplierId;
  },
});

// Atualizar fornecedor
export const update = mutation({
  args: {
    id: v.id("suppliers"),
    name: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Fornecedor não encontrado");
    }
    
    // Filter out undefined values
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    await ctx.db.patch(id, filteredUpdates);
    return id;
  },
});

// Deletar fornecedor (soft delete)
export const remove = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Fornecedor não encontrado");
    }
    await ctx.db.patch(args.id, { isActive: false });
    return args.id;
  },
});
