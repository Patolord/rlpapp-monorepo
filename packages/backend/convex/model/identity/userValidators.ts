import { PERMISSIONS } from "@rlpapp/shared/auth/permissions";
import { v } from "convex/values";
import { accessRoles, departments } from "../../schema/identity";

/** Validadores de `users.ts`. */

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

export const userPickerValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  username: v.optional(v.string()),
  isActive: v.boolean(),
});
