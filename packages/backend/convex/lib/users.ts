import {
  legacyFromRoles,
  normalizeRoles,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import type { Doc } from "../_generated/dataModel";

/**
 * Campos de acesso a gravar num usuário a partir dos acessos escolhidos:
 * `roles` (fonte de verdade) mais a projeção legada `role` + `department`,
 * mantida preenchida enquanto houver código lendo esses campos (índice
 * `by_role`, rótulos antigos, gateway). Fase 3 da migração remove a projeção.
 */
export function accessFields(
  roles: readonly string[]
): Pick<Doc<"users">, "roles" | "role" | "department"> {
  const normalized: Role[] = normalizeRoles(roles);
  const legacy = legacyFromRoles(normalized);
  return {
    roles: normalized,
    role: legacy.role,
    department: legacy.department,
  };
}
