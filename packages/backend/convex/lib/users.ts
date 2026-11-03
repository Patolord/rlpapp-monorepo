import {
  normalizeRoles,
  resolveRoles,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import type { Doc } from "../_generated/dataModel";

/**
 * Campos de acesso a gravar num usuário: `roles` normalizado e os campos
 * legados zerados (num `patch`, `undefined` apaga o campo; num `insert`, é
 * omitido), para que um cadastro editado antes da migração já saia limpo.
 */
export function accessFields(
  roles: readonly string[]
): Pick<Doc<"users">, "roles" | "role" | "department"> {
  const normalized: Role[] = normalizeRoles(roles);
  return { roles: normalized, role: undefined, department: undefined };
}

/** Usuário como os apps o veem: só `roles`, já resolvido para documentos antigos. */
export function toUserView(user: Doc<"users">) {
  const { role: _role, department: _department, roles: _roles, ...rest } = user;
  return { ...rest, roles: resolveRoles(user) };
}
