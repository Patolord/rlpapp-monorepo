import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { accessRoles } from "./schema/identity";
import {
  adminMutation,
  adminQuery,
  anyPermissionQuery,
  requirePermission,
  requireUser,
} from "./lib/rbac";
import {
  createUser,
  createUserWithClerkId,
  deactivateUser,
  getUserViewByEmail,
  getUserViewById,
  listUsers,
  listUsersForPicker,
  reactivateUser,
  updateUser,
  updateUserLastLogin,
} from "./model/identity/userAdministration";
import {
  deleteInvitedUser,
  getUserViewByNormalizedEmail,
  getUserWithInvitation,
  markUserInviteResent,
  upsertInvitedUser,
} from "./model/identity/userInvites";
import {
  deactivateUserFromClerk,
  ensureUserForIdentity,
  getCurrentUserView,
  upsertUserFromClerk,
} from "./model/identity/userSessions";
import {
  currentUserValidator,
  permissionValidator,
  rolesArg,
  userPickerValidator,
  userValidator,
} from "./model/identity/userValidators";

export const getCurrentUser = query({
  args: {},
  returns: v.union(currentUserValidator, v.null()),
  handler: async (ctx) => {
    return await getCurrentUserView(ctx);
  },
});

export const ensureUser = mutation({
  args: {
    // "qr" quando o login partiu de uma página /q/$token (scan de QR code)
    origin: v.optional(v.literal("qr")),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await ensureUserForIdentity(ctx, args);
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
    return await upsertUserFromClerk(ctx, args);
  },
});

// Sync via webhook do Clerk (user.deleted) — soft delete para preservar histórico
export const deactivateFromClerk = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deactivateUserFromClerk(ctx, args.clerkId);
    return null;
  },
});

// Lista completa de usuários (email, telefone, acessos, ajustes): só para
// quem administra usuários (Configurações → Usuários). Telas que só precisam
// escolher uma pessoa usam `listForPicker`.
export const list = adminQuery({
  args: {
    onlyActive: v.optional(v.boolean()),
    /** Só quem tem este acesso (ex.: técnicos de campo). */
    role: v.optional(accessRoles),
  },
  returns: v.array(userValidator),
  handler: async (ctx, args) => {
    return await listUsers(ctx, args);
  },
});

/**
 * Pessoas para escolher num seletor (técnicos de uma obra, usuário do app de
 * um funcionário): só nome e login, sem email, telefone nem acessos.
 */
export const listForPicker = anyPermissionQuery(
  "obras.gestao",
  "rh.funcionarios.write"
)({
  args: {
    onlyActive: v.optional(v.boolean()),
    /** Só quem tem este acesso (ex.: técnicos de campo para atribuir a obras). */
    role: v.optional(accessRoles),
  },
  returns: v.array(userPickerValidator),
  handler: async (ctx, args) => {
    return await listUsersForPicker(ctx, args);
  },
});

// Buscar usuário por ID
export const get = adminQuery({
  args: { id: v.id("users") },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await getUserViewById(ctx, args.id);
  },
});

// Buscar usuário por email
export const getByEmail = adminQuery({
  args: { email: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await getUserViewByEmail(ctx, args.email);
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
    return await createUser(ctx, args);
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
    return await updateUser(ctx, ctx.user, args);
  },
});

// Atualizar último login
export const updateLastLogin = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await updateUserLastLogin(ctx, args.id);
  },
});

// Deletar usuário (soft delete)
export const remove = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await deactivateUser(ctx, ctx.user, args.id);
  },
});

// Reativar usuário
export const reactivate = adminMutation({
  args: { id: v.id("users") },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    return await reactivateUser(ctx, args.id);
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
    return await createUserWithClerkId(ctx, args);
  },
});

// --- Convites por email (chamados por userAdmin.ts) ---

export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, args) => {
    return await getUserViewByNormalizedEmail(ctx, args.email);
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("users") },
  returns: v.union(
    v.object({ ...userValidator.fields, clerkInvitationId: v.optional(v.string()) }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await getUserWithInvitation(ctx, args.id);
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
    return await upsertInvitedUser(ctx, args);
  },
});

/** Registra um reenvio: novo id de invitation e nova data. */
export const markInviteResent = internalMutation({
  args: { id: v.id("users"), clerkInvitationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markUserInviteResent(ctx, args);
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
    await deleteInvitedUser(ctx, args.id);
    return null;
  },
});
