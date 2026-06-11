import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { departments, userRoles } from "./schema";
import { requireAuth } from "./lib/auth";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (byClerkId) return byClerkId;

    // Fallback para usuários criados antes do vínculo por clerkId
    if (!identity.email) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
  },
});

export const ensureUser = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) {
      throw new Error("Not authenticated or no email in identity");
    }
    const clerkId = identity.subject;

    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (byClerkId) {
      await ctx.db.patch(byClerkId._id, { lastLoginAt: Date.now() });
      return byClerkId._id;
    }

    // Vincula usuários antigos (sem clerkId) pelo email
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        clerkId,
        lastLoginAt: Date.now(),
      });
      return byEmail._id;
    }

    const name =
      identity.name ??
      identity.givenName ??
      identity.email!.split("@")[0];

    const userId = await ctx.db.insert("users", {
      name,
      email: identity.email!,
      clerkId,
      role: "operator",
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    return userId;
  },
});

// Sync via webhook do Clerk (user.created / user.updated)
export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (byClerkId) {
      await ctx.db.patch(byClerkId._id, {
        name: args.name,
        email: args.email,
      });
      return byClerkId._id;
    }

    // Vincula usuários criados antes do webhook (sem clerkId) pelo email
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        clerkId: args.clerkId,
        name: args.name,
      });
      return byEmail._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      role: "operator",
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

// Sync via webhook do Clerk (user.deleted) — soft delete para preservar histórico
export const deactivateFromClerk = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (user) {
      await ctx.db.patch(user._id, { isActive: false });
    } else {
      console.warn(
        `Clerk webhook: user.deleted para clerkId ${args.clerkId} sem usuário correspondente`
      );
    }
    return null;
  },
});

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
    department: v.optional(departments),
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
      department: args.department,
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
    department: v.optional(departments),
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
