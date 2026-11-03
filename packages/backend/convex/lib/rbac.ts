import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  ADMIN_ROLES,
  PERMISSION_DENIED_MESSAGES,
  STAFF_ROLES,
  getPermissions,
  hasPermission,
  isAdmin,
  isStaff,
  type Department,
  type Permission,
  type UserRole,
} from "@rlpapp/shared/auth/permissions";
import { mutation, query } from "../_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getUserByIdentity } from "./auth";
import { forbidden, unauthenticated } from "./accessErrors";

// ---------------------------------------------------------------------------
// Política de acesso
// ---------------------------------------------------------------------------
//
// A política (quem tem qual permissão) mora em @rlpapp/shared/auth/permissions
// e é compartilhada com os apps, que só a usam para esconder navegação; quem
// aplica é este módulo, nos wrappers abaixo. Este arquivo reexporta o que o
// restante do backend precisa para não depender do caminho do shared.

export {
  ADMIN_ROLES,
  STAFF_ROLES,
  getPermissions,
  hasPermission,
  isAdmin,
  isStaff,
};
export type { Permission };

// Falha de compilação se os validadores de schema.ts e a política do shared
// divergirem (uma role ou departamento criado só de um lado).
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const SCHEMA_ROLES_MATCH_POLICY: Equals<Doc<"users">["role"], UserRole> = true;
export const SCHEMA_DEPARTMENTS_MATCH_POLICY: Equals<
  NonNullable<Doc<"users">["department"]>,
  Department
> = true;

// ---------------------------------------------------------------------------
// Gates (verificações que lançam erro)
// ---------------------------------------------------------------------------

/** Usuário autenticado e ativo (qualquer role, inclui qr_operator). */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw unauthenticated();
  }
  if (!user.isActive) {
    throw forbidden("Usuário desativado");
  }
  return user;
}

export function assertStaff(user: Doc<"users">) {
  if (!isStaff(user)) {
    throw forbidden();
  }
}

export function assertAdmin(user: Doc<"users">) {
  if (!isAdmin(user)) {
    throw forbidden();
  }
}

export function requirePermission(
  user: Doc<"users">,
  permission: Permission
): void {
  assertStaff(user);
  if (!hasPermission(user, permission)) {
    throw forbidden(PERMISSION_DENIED_MESSAGES[permission], permission);
  }
}

/** Gate baseado em ctx (uso manual em handlers, ex.: qrCodes). */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: readonly string[]
) {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw unauthenticated("User not found in database");
  }
  if (!allowedRoles.includes(user.role)) {
    throw forbidden();
  }
  return user;
}

/** Qualquer role interna (exclui qr_operator, que só acessa /q/$token). */
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  return await requireRole(ctx, STAFF_ROLES);
}

/**
 * Gate para actions, que não têm `ctx.db`: roda `requireUser` +
 * `requirePermission` numa query interna sob a mesma identidade. Use no
 * início do handler, antes de qualquer efeito externo (OpenAI, Clerk...).
 */
export async function requireActionPermission(
  ctx: ActionCtx,
  permission: Permission
): Promise<void> {
  await ctx.runQuery(internal.users.assertPermission, { permission });
}

// ---------------------------------------------------------------------------
// Fábricas de wrappers (injetam ctx.user autenticado e ativo)
// ---------------------------------------------------------------------------

export function permissionQuery(permission: Permission) {
  return customQuery(
    query,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requirePermission(user, permission);
      return { user };
    })
  );
}

export function permissionMutation(permission: Permission) {
  return customMutation(
    mutation,
    customCtx(async (ctx) => {
      const user = await requireUser(ctx);
      requirePermission(user, permission);
      return { user };
    })
  );
}

// ---------------------------------------------------------------------------
// Wrappers nomeados (usar nas funções públicas em vez de query/mutation puros)
// ---------------------------------------------------------------------------

/** Qualquer usuário autenticado e ativo (inclui qr_operator). */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) }))
);

/** Qualquer usuário autenticado e ativo (inclui qr_operator). */
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ user: await requireUser(ctx) }))
);

/** Roles internas (exclui qr_operator). */
export const staffQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    return { user };
  })
);

/** Roles internas (exclui qr_operator). */
export const staffMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    return { user };
  })
);

/** Apenas director/admin (gestão de usuários e operações sensíveis). */
export const adminQuery = permissionQuery("admin.manage");

/** Apenas director/admin (gestão de usuários e operações sensíveis). */
export const adminMutation = permissionMutation("admin.manage");

/** Director/admin, engenheiro, ou staff do departamento engenharia. */
export const engineeringQuery = permissionQuery("engenharia.read");

/** Director/admin, engenheiro, ou staff do departamento engenharia. */
export const engineeringMutation = permissionMutation("engenharia.write");

/** Director/admin ou staff do departamento compras. */
export const purchasingQuery = permissionQuery("compras.read");

/** Director/admin ou staff do departamento compras. */
export const purchasingMutation = permissionMutation("compras.write");

/** Engenharia ou Compras — consultas compartilhadas (preços, takeoffs). */
export const engineeringOrPurchasingQuery = permissionQuery("suprimentos.read");

/** Estoque, Engenharia ou Compras — consultas de saldo e movimentações. */
export const inventoryQuery = permissionQuery("estoque.read");

/** Equipe de Estoque — conclusão, transferência, ajuste e estorno. */
export const inventoryMutation = permissionMutation("estoque.write");

/** Estoque ou Compras — cadastro rápido de material a partir da movimentação. */
export const warehouseOrPurchasingMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    if (
      !hasPermission(user, "estoque.write") &&
      !hasPermission(user, "compras.write")
    ) {
      throw forbidden("Acesso restrito à equipe de estoque ou compras");
    }
    return { user };
  })
);

/**
 * Engenharia ou Compras — propor material ao catálogo a partir do RLP Takeoff
 * (vira rascunho que compras avalia; não altera material existente).
 */
export const engineeringOrPurchasingMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const user = await requireUser(ctx);
    assertStaff(user);
    if (
      !hasPermission(user, "engenharia.write") &&
      !hasPermission(user, "compras.write")
    ) {
      throw forbidden(PERMISSION_DENIED_MESSAGES["suprimentos.read"]);
    }
    return { user };
  })
);

/** Director/admin — configuração das regras de compatibilidade. */
export const inventoryRulesMutation = permissionMutation("estoque.rules");

/** Director/admin ou staff do departamento RH. */
export const hrQuery = permissionQuery("rh.read");

/** Director/admin ou staff do departamento RH. */
export const hrMutation = permissionMutation("rh.write");
