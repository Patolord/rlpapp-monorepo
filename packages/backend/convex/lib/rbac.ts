import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getUserByIdentity } from "./auth";

// ---------------------------------------------------------------------------
// Política de acesso (fonte única de verdade)
// ---------------------------------------------------------------------------

// Roles internas (qr_operator só acessa o fluxo público /q/$token e
// funções explicitamente liberadas via authedQuery/authedMutation).
export const STAFF_ROLES = [
  "director",
  "admin",
  "manager",
  "operator",
  "engenheiro",
];
export const ADMIN_ROLES = ["director", "admin"];

export type Permission =
  | "engenharia.read"
  | "engenharia.write"
  | "compras.read"
  | "compras.write"
  // Leitura compartilhada entre engenharia e compras (materiais,
  // fornecedores, preços, takeoffs).
  | "suprimentos.read"
  | "estoque.read"
  | "estoque.write"
  | "estoque.rules"
  | "admin.manage";

/**
 * Decide se o usuário possui a permissão. Regras:
 * - director/admin: tudo
 * - engenheiro: engenharia.* + suprimentos.read (independente de departamento)
 * - staff do departamento engenharia: engenharia.* + suprimentos.read
 * - staff do departamento compras: compras.* + suprimentos.read
 * - qr_operator: nenhuma permissão (usa apenas endpoints authed*)
 */
export function hasPermission(
  user: Doc<"users">,
  permission: Permission
): boolean {
  if (!STAFF_ROLES.includes(user.role)) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;

  switch (permission) {
    case "engenharia.read":
    case "engenharia.write":
      return user.role === "engenheiro" || user.department === "engenharia";
    case "compras.read":
    case "compras.write":
      return user.department === "compras";
    case "suprimentos.read":
      return (
        user.role === "engenheiro" ||
        user.department === "engenharia" ||
        user.department === "compras"
      );
    case "estoque.read":
      return (
        user.role === "engenheiro" ||
        user.department === "engenharia" ||
        user.department === "compras" ||
        user.department === "estoque"
      );
    case "estoque.write":
      return user.department === "estoque";
    case "estoque.rules":
      return false;
    case "admin.manage":
      return false;
  }
}

const PERMISSION_DENIED_MESSAGE: Record<Permission, string> = {
  "engenharia.read": "Acesso restrito à área de engenharia",
  "engenharia.write": "Acesso restrito à área de engenharia",
  "compras.read": "Acesso restrito à área de compras",
  "compras.write": "Acesso restrito à área de compras",
  "suprimentos.read": "Acesso restrito à engenharia ou compras",
  "estoque.read": "Acesso restrito às áreas de estoque, compras ou engenharia",
  "estoque.write": "Acesso restrito à equipe de estoque",
  "estoque.rules": "Apenas administradores podem configurar regras de estoque",
  "admin.manage": "Insufficient permissions",
};

// ---------------------------------------------------------------------------
// Gates (verificações que lançam erro)
// ---------------------------------------------------------------------------

/** Usuário autenticado e ativo (qualquer role, inclui qr_operator). */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw new Error("Not authenticated");
  }
  if (!user.isActive) {
    throw new Error("Usuário desativado");
  }
  return user;
}

export function assertStaff(user: Doc<"users">) {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
}

export function assertAdmin(user: Doc<"users">) {
  if (!ADMIN_ROLES.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
}

export function requirePermission(
  user: Doc<"users">,
  permission: Permission
): void {
  assertStaff(user);
  if (!hasPermission(user, permission)) {
    throw new Error(PERMISSION_DENIED_MESSAGE[permission]);
  }
}

/** Gate baseado em ctx (uso manual em handlers, ex.: qrCodes). */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: string[]
) {
  const user = await getUserByIdentity(ctx);
  if (!user) {
    throw new Error("User not found in database");
  }
  if (!allowedRoles.includes(user.role)) {
    throw new Error("Insufficient permissions");
  }
  return user;
}

/** Qualquer role interna (exclui qr_operator, que só acessa /q/$token). */
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  return await requireRole(ctx, STAFF_ROLES);
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

/** Director/admin — configuração das regras de compatibilidade. */
export const inventoryRulesMutation = permissionMutation("estoque.rules");
