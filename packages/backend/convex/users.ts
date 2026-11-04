import {
  PERMISSIONS,
  getPermissions,
  hasPermission,
  isStaff,
  normalizePermissionOverrides,
  resolveHomeArea,
  resolveRoles,
} from "@rlpapp/shared/auth/permissions";
import { capitalizeFirst } from "@rlpapp/shared/usernames";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { accessRoles, departments } from "./schema";
import {
  adminMutation,
  authedQuery,
  hasRole,
  requirePermission,
  requireUser,
  staffQuery,
} from "./lib/rbac";
import { forbidden } from "./lib/accessErrors";
import { accessFields, normalizeEmail, toUserView } from "./lib/users";
import { enforceAgentTokenPolicy } from "./lib/agentTokens";

/** Remove campos undefined — padrão dos updates parciais (ctx.db.patch). */
function filterDefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export const permissionValidator = v.union(
  ...PERMISSIONS.map((permission) => v.literal(permission))
);

export const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.string(),
  email: v.optional(v.string()),
  username: v.optional(v.string()),
  clerkId: v.optional(v.string()),
  /** Acessos (ver ROLES no shared); documentos antigos chegam traduzidos. */
  roles: v.array(accessRoles),
  /** Ajustes individuais: permissões concedidas além das do acesso. */
  permissionGrants: v.array(permissionValidator),
  /** Ajustes individuais: permissões do acesso retiradas. */
  permissionDenials: v.array(permissionValidator),
  phone: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  lastLoginAt: v.optional(v.number()),
  /** Convite por email enviado; pendente enquanto não há `clerkId`. */
  invitedAt: v.optional(v.number()),
});

/** Lista de acessos recebida dos formulários (ver ROLES no shared). */
export const rolesArg = v.array(accessRoles);


/**
 * Usuário atual com o acesso já resolvido pela política
 * (@rlpapp/shared/auth/permissions). Os apps decidem navegação e ações a
 * partir de `permissions`, `roles`, `isStaff` e `homeArea`.
 */
export const currentUserValidator = v.object({
  ...userValidator.fields,
  permissions: v.array(permissionValidator),
  isStaff: v.boolean(),
  homeArea: v.union(departments, v.literal("qr-operador"), v.null()),
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(currentUserValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    await enforceAgentTokenPolicy(ctx, identity);

    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    // Fallback para usuários criados antes do vínculo por clerkId
    const user =
      byClerkId ??
      (identity.email
        ? await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", identity.email!))
            .first()
        : null);
    if (!user) return null;
    return {
      ...toUserView(user),
      permissions: getPermissions(user),
      isStaff: isStaff(user),
      homeArea: resolveHomeArea(user),
    };
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
    await enforceAgentTokenPolicy(ctx, identity);
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
        // Convite aceito sem o webhook ter chegado antes: nome e login vêm do
        // que a pessoa preencheu ao criar a conta.
        const invited = byEmail.invitedAt !== undefined;
        await ctx.db.patch("users", byEmail._id, {
          clerkId,
          lastLoginAt: Date.now(),
          ...(invited && identity.name ? { name: identity.name } : {}),
          ...(invited && username ? { username } : {}),
        });
        return byEmail._id;
      }
    }

    const name =
      identity.name ??
      identity.givenName ??
      (username ? capitalizeFirst(username) : undefined) ??
      identity.email?.split("@")[0] ??
      "Usuário";

    // Quem entra pelo QR é técnico de campo; os demais ficam sem acesso até
    // um administrador atribuir os acessos em Configurações → Usuários.
    const userId = await ctx.db.insert("users", {
      name,
      email: identity.email,
      username,
      clerkId,
      ...accessFields(args.origin === "qr" ? ["qr_operator"] : []),
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
    /** Telefone informado ao aceitar um convite (unsafe_metadata do Clerk). */
    phone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const byClerkId = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (byClerkId) {
      // Telefone do convite: também quando ensureUser vinculou antes do webhook.
      await ctx.db.patch("users", byClerkId._id, {
        name: args.name,
        email: args.email,
        username: args.username,
        ...(args.phone && !byClerkId.phone ? { phone: args.phone } : {}),
      });
      return byClerkId._id;
    }

    // Vincula usuários criados antes do webhook (sem clerkId) e convites
    // pendentes pelo email
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
          ...(args.phone && !byEmail.phone ? { phone: args.phone } : {}),
        });
        return byEmail._id;
      }
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      username: args.username,
      phone: args.phone,
      ...accessFields([]),
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

// Listar todos os usuários. Equipe interna, ou quem atribui técnicos às obras
// (um técnico líder com obras.gestao também escolhe a equipe da obra).
export const list = authedQuery({
  args: {
    onlyActive: v.optional(v.boolean()),
    /** Só quem tem este acesso (ex.: técnicos de campo para atribuir a obras). */
    role: v.optional(accessRoles),
  },
  returns: v.array(userValidator),
  handler: async (ctx, args) => {
    if (!isStaff(ctx.user) && !hasPermission(ctx.user, "obras.gestao")) {
      throw forbidden();
    }
    const users = args.onlyActive
      ? await ctx.db
          .query("users")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect()
      : await ctx.db.query("users").collect();
    const role = args.role;
    // Acessos se combinam (um técnico pode ser também da equipe), então o
    // filtro olha o conjunto inteiro.
    return (role ? users.filter((user) => hasRole(user, role)) : users).map(toUserView);
  },
});

// Buscar usuário por ID
export const get = staffQuery({
  args: { id: v.id("users") },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.id);
    return user ? toUserView(user) : null;
  },
});

// Buscar usuário por email
export const getByEmail = staffQuery({
  args: { email: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    return user ? toUserView(user) : null;
  },
});

// Criar usuário
export const create = adminMutation({
  args: {
    name: v.string(),
    email: v.string(),
    roles: rolesArg,
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
      ...accessFields(args.roles),
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
    // null limpa o campo; undefined (omitido) mantém o valor atual.
    email: v.optional(v.union(v.string(), v.null())),
    roles: v.optional(rolesArg),
    /**
     * Ajustes individuais (lista completa, substitui a atual). Só o que difere
     * dos acessos é gravado (normalizePermissionOverrides).
     */
    permissionGrants: v.optional(v.array(permissionValidator)),
    permissionDenials: v.optional(v.array(permissionValidator)),
    phone: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const {
      id,
      email,
      phone,
      roles,
      permissionGrants,
      permissionDenials,
      ...updates
    } = args;
    const existing = await ctx.db.get("users", id);
    
    if (!existing) {
      throw new Error("Usuário não encontrado");
    }
    
    if (
      email !== undefined &&
      email !== existing.email &&
      existing.clerkId === undefined &&
      existing.invitedAt !== undefined
    ) {
      throw new Error(
        "O email é a chave do convite pendente. Cancele o convite e envie outro para o email certo."
      );
    }

    if (email && email !== existing.email) {
      const emailExists = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      
      if (emailExists) {
        throw new Error("Já existe um usuário com este email");
      }
    }
    
    const patch: Partial<Doc<"users">> = filterDefined(updates);
    if (email !== undefined) patch.email = email ?? undefined;
    if (phone !== undefined) patch.phone = phone ?? undefined;
    if (roles !== undefined) {
      Object.assign(patch, accessFields(roles));
    }
    if (
      roles !== undefined ||
      permissionGrants !== undefined ||
      permissionDenials !== undefined
    ) {
      // Reavalia os ajustes contra os acessos finais: um acesso novo pode
      // tornar uma concessão redundante ou uma retirada sem efeito.
      const overrides = normalizePermissionOverrides(
        roles ?? resolveRoles(existing),
        permissionGrants ?? existing.permissionGrants ?? [],
        permissionDenials ?? existing.permissionDenials ?? []
      );
      patch.permissionGrants =
        overrides.permissionGrants.length > 0 ? overrides.permissionGrants : undefined;
      patch.permissionDenials =
        overrides.permissionDenials.length > 0 ? overrides.permissionDenials : undefined;
      if (
        existing._id === ctx.user._id &&
        !hasPermission(
          { roles: roles ?? resolveRoles(existing), ...overrides },
          "admin.manage"
        )
      ) {
        throw new Error("Você não pode remover o próprio acesso de administração");
      }
    }

    await ctx.db.patch("users", id, patch);
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
    if (existing._id === ctx.user._id) {
      throw new Error("Você não pode desativar o próprio acesso");
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

// --- Funções internas para actions ---

/**
 * Gate de permissão para actions (que não têm `ctx.db`): mesma verificação
 * dos wrappers de lib/rbac.ts, sob a identidade de quem chamou a action.
 * Lança UNAUTHENTICATED/FORBIDDEN; use via `requireActionPermission`.
 */
export const assertPermission = internalQuery({
  args: { permission: permissionValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requirePermission(user, args.permission);
    return null;
  },
});

export const createWithClerkId = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    roles: rolesArg,
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
      ...accessFields(args.roles),
      phone: args.phone,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

// --- Convites por email (chamados por userAdmin.ts) ---

export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .first();
    return user ? toUserView(user) : null;
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("users") },
  returns: v.union(
    v.object({ ...userValidator.fields, clerkInvitationId: v.optional(v.string()) }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.id);
    return user
      ? { ...toUserView(user), clerkInvitationId: user.clerkInvitationId }
      : null;
  },
});

/**
 * Cria o cadastro de um convite enviado, ou atualiza o convite pendente que já
 * existe para o email (reenvio). Quem já tem conta (clerkId), ou um cadastro
 * antigo que nunca foi convite (sem invitedAt), não entra por aqui: o cancelar
 * do convite apaga o cadastro, e um cadastro com histórico não pode ser apagado.
 */
export const upsertInvited = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    roles: rolesArg,
    clerkInvitationId: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    // Reenvio sem nome mantém o nome que já aparecia na lista.
    const name = args.name?.trim() || existing?.name || email.split("@")[0] || email;

    if (existing) {
      if (existing.clerkId || existing.invitedAt === undefined) {
        throw new Error("Já existe um usuário com este email");
      }
      await ctx.db.patch("users", existing._id, {
        name,
        phone: args.phone ?? existing.phone,
        ...accessFields(args.roles),
        isActive: true,
        invitedAt: Date.now(),
        clerkInvitationId: args.clerkInvitationId,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      name,
      email,
      phone: args.phone,
      ...accessFields(args.roles),
      isActive: true,
      createdAt: Date.now(),
      invitedAt: Date.now(),
      clerkInvitationId: args.clerkInvitationId,
    });
  },
});

/** Registra um reenvio: novo id de invitation e nova data. */
export const markInviteResent = internalMutation({
  args: { id: v.id("users"), clerkInvitationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.id);
    if (!user) throw new Error("Usuário não encontrado");
    if (user.clerkId) throw new Error("Este usuário já aceitou o convite");
    await ctx.db.patch("users", args.id, {
      invitedAt: Date.now(),
      clerkInvitationId: args.clerkInvitationId,
    });
    return null;
  },
});

/**
 * Apaga um convite pendente. Só cadastros sem conta (sem clerkId) e sem
 * histórico: um usuário que já entrou é desativado, nunca apagado.
 */
export const deleteInvited = internalMutation({
  args: { id: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.id);
    if (!user) return null;
    if (user.clerkId || user.invitedAt === undefined) {
      throw new Error("Este usuário já aceitou o convite");
    }
    await ctx.db.delete("users", args.id);
    return null;
  },
});
