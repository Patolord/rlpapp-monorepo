import {
  hasPermission,
  normalizePermissionOverrides,
  resolveRoles,
  type Permission,
} from "@rlpapp/shared/auth/permissions";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { hasRole } from "../../lib/rbac";
import type { accessRoles } from "../../schema/identity";
import { accessFields, toUserView } from "./users";
import { alreadyExists, notFound, ruleViolation } from "../../lib/domainErrors";

/** Cadastro de usuários em Configurações → Usuários (e o bootstrap interno). */

type AccessRole = Infer<typeof accessRoles>;

/** Remove campos undefined — padrão dos updates parciais (ctx.db.patch). */
function filterDefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

async function collectUsers(
  ctx: QueryCtx,
  onlyActive: boolean | undefined
): Promise<Doc<"users">[]> {
  return onlyActive
    ? await ctx.db
        .query("users")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect()
    : await ctx.db.query("users").collect();
}

export type ListUsersInput = {
  onlyActive?: boolean;
  /** Só quem tem este acesso (ex.: técnicos de campo). */
  role?: AccessRole;
};

export async function listUsers(ctx: QueryCtx, input: ListUsersInput) {
  const users = await collectUsers(ctx, input.onlyActive);
  const role = input.role;
  // Acessos se combinam (um técnico pode ser também da equipe), então o
  // filtro olha o conjunto inteiro.
  return (role ? users.filter((user) => hasRole(user, role)) : users).map(
    toUserView
  );
}

/** Só nome e login, sem email, telefone nem acessos. */
export async function listUsersForPicker(ctx: QueryCtx, input: ListUsersInput) {
  const users = await collectUsers(ctx, input.onlyActive);
  const role = input.role;
  return (role ? users.filter((user) => hasRole(user, role)) : users).map(
    (user) => ({
      _id: user._id,
      name: user.name,
      username: user.username,
      isActive: user.isActive,
    })
  );
}

export async function getUserViewById(ctx: QueryCtx, id: Id<"users">) {
  const user = await ctx.db.get("users", id);
  return user ? toUserView(user) : null;
}

/** Pelo email exatamente como informado (sem normalizar). */
export async function getUserViewByEmail(ctx: QueryCtx, email: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return user ? toUserView(user) : null;
}

export async function createUser(
  ctx: MutationCtx,
  input: { name: string; email: string; roles: AccessRole[]; phone?: string }
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", input.email))
    .first();

  if (existing) {
    throw alreadyExists("Já existe um usuário com este email");
  }

  const userId = await ctx.db.insert("users", {
    name: input.name,
    email: input.email,
    ...accessFields(input.roles),
    phone: input.phone,
    isActive: true,
    createdAt: Date.now(),
  });

  return userId;
}

export type UpdateUserInput = {
  id: Id<"users">;
  name?: string;
  /** null limpa o campo; undefined (omitido) mantém o valor atual. */
  email?: string | null;
  roles?: AccessRole[];
  /** Lista completa, substitui a atual; só o que difere dos acessos é gravado. */
  permissionGrants?: Permission[];
  permissionDenials?: Permission[];
  phone?: string | null;
  isActive?: boolean;
};

/**
 * Atualiza um usuário. Ajustes individuais são reavaliados contra os acessos
 * finais, e ninguém retira de si mesmo o acesso de administração.
 */
export async function updateUser(
  ctx: MutationCtx,
  currentUser: Doc<"users">,
  input: UpdateUserInput
): Promise<Id<"users">> {
  const {
    id,
    email,
    phone,
    roles,
    permissionGrants,
    permissionDenials,
    ...updates
  } = input;
  const existing = await ctx.db.get("users", id);

  if (!existing) {
    throw notFound("Usuário não encontrado");
  }

  if (
    email !== undefined &&
    email !== existing.email &&
    existing.clerkId === undefined &&
    existing.invitedAt !== undefined
  ) {
    throw ruleViolation(
      "O email é a chave do convite pendente. Cancele o convite e envie outro para o email certo."
    );
  }

  if (email && email !== existing.email) {
    const emailExists = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (emailExists) {
      throw alreadyExists("Já existe um usuário com este email");
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
      existing._id === currentUser._id &&
      !hasPermission(
        { roles: roles ?? resolveRoles(existing), ...overrides },
        "admin.manage"
      )
    ) {
      throw ruleViolation("Você não pode remover o próprio acesso de administração");
    }
  }

  await ctx.db.patch("users", id, patch);
  return id;
}

export async function updateUserLastLogin(
  ctx: MutationCtx,
  id: Id<"users">
): Promise<Id<"users">> {
  const existing = await ctx.db.get("users", id);

  if (!existing) {
    throw notFound("Usuário não encontrado");
  }

  await ctx.db.patch("users", id, { lastLoginAt: Date.now() });
  return id;
}

/** Soft delete: o histórico do usuário continua apontando para o cadastro. */
export async function deactivateUser(
  ctx: MutationCtx,
  currentUser: Doc<"users">,
  id: Id<"users">
): Promise<Id<"users">> {
  const existing = await ctx.db.get("users", id);

  if (!existing) {
    throw notFound("Usuário não encontrado");
  }
  if (existing._id === currentUser._id) {
    throw ruleViolation("Você não pode desativar o próprio acesso");
  }

  await ctx.db.patch("users", id, { isActive: false });
  return id;
}

export async function reactivateUser(
  ctx: MutationCtx,
  id: Id<"users">
): Promise<Id<"users">> {
  const existing = await ctx.db.get("users", id);

  if (!existing) {
    throw notFound("Usuário não encontrado");
  }

  await ctx.db.patch("users", id, { isActive: true });
  return id;
}

export type CreateUserWithClerkIdInput = {
  clerkId: string;
  name: string;
  email?: string;
  username?: string;
  roles: AccessRole[];
  phone?: string;
};

export async function createUserWithClerkId(
  ctx: MutationCtx,
  input: CreateUserWithClerkIdInput
): Promise<Id<"users">> {
  if (input.email) {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", input.email!))
      .first();
    if (existing) {
      throw alreadyExists("Já existe um usuário com este email");
    }
  }

  const existingClerk = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", input.clerkId))
    .first();
  if (existingClerk) {
    throw ruleViolation("Usuário Clerk já vinculado");
  }

  return await ctx.db.insert("users", {
    clerkId: input.clerkId,
    name: input.name,
    email: input.email,
    username: input.username,
    ...accessFields(input.roles),
    phone: input.phone,
    isActive: true,
    createdAt: Date.now(),
  });
}
