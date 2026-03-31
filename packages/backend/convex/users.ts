import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { userRoles } from "./schema";
import { requireAuth } from "./lib/auth";

// Listar todos os usuários
export const list = query({
  args: {
    onlyActive: v.optional(v.boolean()),
    role: v.optional(userRoles),
  },
  handler: async (ctx, args) => {
    if (args.role) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", args.role!))
        .collect();
      
      if (args.onlyActive) {
        return users.filter((u) => u.isActive);
      }
      return users;
    }
    
    if (args.onlyActive) {
      return await ctx.db
        .query("users")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    
    return await ctx.db.query("users").collect();
  },
});

// Buscar usuário por ID
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Buscar usuário por email
export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

// Criar usuário
export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: userRoles,
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    
    if (existing) {
      throw new Error("Já existe um usuário com este email");
    }
    
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      role: args.role,
      phone: args.phone,
      isActive: true,
      createdAt: Date.now(),
    });
    
    return userId;
  },
});

// Atualizar usuário
export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(userRoles),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    if (updates.email && updates.email !== existing.email) {
      const emailExists = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", updates.email!))
        .first();
      
      if (emailExists) {
        throw new Error("Já existe um usuário com este email");
      }
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

// Atualizar último login
export const updateLastLogin = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch(args.id, { lastLoginAt: Date.now() });
    return args.id;
  },
});

// Deletar usuário (soft delete)
export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch(args.id, { isActive: false });
    return args.id;
  },
});

// Reativar usuário
export const reactivate = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch(args.id, { isActive: true });
    return args.id;
  },
});
