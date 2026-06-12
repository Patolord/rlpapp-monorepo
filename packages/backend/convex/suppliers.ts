import { v } from "convex/values";
import { staffMutation, staffQuery } from "./lib/functions";

// Listar todos os fornecedores
export const list = staffQuery({
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
export const get = staffQuery({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    return await ctx.db.get("suppliers", args.id);
  },
});

// Criar fornecedor
export const create = staffMutation({
  args: {
    name: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
export const update = staffMutation({
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
    const { id, ...updates } = args;
    const existing = await ctx.db.get("suppliers", id);
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
    
    await ctx.db.patch("suppliers", id, filteredUpdates);
    return id;
  },
});

// Deletar fornecedor (soft delete)
export const remove = staffMutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("suppliers", args.id);
    if (!existing) {
      throw new Error("Fornecedor não encontrado");
    }
    await ctx.db.patch("suppliers", args.id, { isActive: false });
    return args.id;
  },
});
