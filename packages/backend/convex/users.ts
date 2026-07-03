import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { departments, userRoles } from "./schema";
import { adminMutation, staffQuery } from "./lib/rbac";

/** Remove campos undefined — padrão dos updates parciais (ctx.db.patch). */
function filterDefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  clerkId: v.optional(v.string()),
  role: userRoles,
  department: v.optional(departments),
  phone: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  lastLoginAt: v.optional(v.number()),
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(userValidator, v.null()),
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
  args: {
    // "qr" quando o login partiu de uma página /q/$token (scan de QR code)
    origin: v.optional(v.literal("qr")),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const clerkId = identity.subject;
    // No JWT template "convex" do Clerk, nickname = username
    const username = identity.nickname ?? identity.preferredUsername;

    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (byClerkId) {
      await ctx.db.patch("users", byClerkId._id, { lastLoginAt: Date.now() });
      return byClerkId._id;
    }

    // Vincula usuários antigos (sem clerkId) pelo email
    if (identity.email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .first();

      if (byEmail) {
        await ctx.db.patch("users", byEmail._id, {
          clerkId,
          lastLoginAt: Date.now(),
        });
        return byEmail._id;
      }
    }

    const name =
      identity.name ??
      identity.givenName ??
      username ??
      identity.email?.split("@")[0] ??
      "Usuário";

    const userId = await ctx.db.insert("users", {
      name,
      email: identity.email,
      username,
      clerkId,
      role: args.origin === "qr" ? "qr_operator" : "operator",
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
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    name: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (byClerkId) {
      await ctx.db.patch("users", byClerkId._id, {
        name: args.name,
        email: args.email,
        username: args.username,
      });
      return byClerkId._id;
    }

    // Vincula usuários criados antes do webhook (sem clerkId) pelo email
    if (args.email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email))
        .first();

      if (byEmail) {
        await ctx.db.patch("users", byEmail._id, {
          clerkId: args.clerkId,
          name: args.name,
          username: args.username,
        });
        return byEmail._id;
      }
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      username: args.username,
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
      await ctx.db.patch("users", user._id, { isActive: false });
    } else {
      console.warn(
        `Clerk webhook: user.deleted para clerkId ${args.clerkId} sem usuário correspondente`
      );
    }
    return null;
  },
});

// Listar todos os usuários
export const list = staffQuery({
  args: {
    onlyActive: v.optional(v.boolean()),
    role: v.optional(userRoles),
  },
  returns: v.array(userValidator),
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
export const get = staffQuery({
  args: { id: v.id("users") },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("users", args.id);
  },
});

// Buscar usuário por email
export const getByEmail = staffQuery({
  args: { email: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

// Criar usuário
export const create = adminMutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: userRoles,
    department: v.optional(departments),
    phone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
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
export const update = adminMutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(userRoles),
    department: v.optional(departments),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get("users", id);
    
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
    
    const filteredUpdates = filterDefined(updates);

    await ctx.db.patch("users", id, filteredUpdates);
    return id;
  },
});

// Atualizar último login
export const updateLastLogin = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("users", args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch("users", args.id, { lastLoginAt: Date.now() });
    return args.id;
  },
});

// Deletar usuário (soft delete)
export const remove = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("users", args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch("users", args.id, { isActive: false });
    return args.id;
  },
});

// Reativar usuário
export const reactivate = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get("users", args.id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    await ctx.db.patch("users", args.id, { isActive: true });
    return args.id;
  },
});

// --- Internal functions for userAdmin action ---

export const getCallerRole = internalQuery({
  args: {},
  returns: v.union(
    v.object({ role: v.string() }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (user) return { role: user.role };

    if (identity.email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .first();
      if (byEmail) return { role: byEmail.role };
    }

    return null;
  },
});

export const createWithClerkId = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    role: userRoles,
    department: v.optional(departments),
    phone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    if (args.email) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
      if (existing) {
        throw new Error("Já existe um usuário com este email");
      }
    }

    const existingClerk = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (existingClerk) {
      throw new Error("Usuário Clerk já vinculado");
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      username: args.username,
      role: args.role,
      department: args.department,
      phone: args.phone,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});
