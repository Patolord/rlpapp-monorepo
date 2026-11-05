import {
  PERMISSIONS,
  PERMISSION_DEPENDENCIES,
  getPermissions,
  getRolePermissions,
  normalizePermissionOverrides,
  withDependencies,
  type Permission,
  type Role,
} from "@rlpapp/shared/auth/permissions";

export type PermissionOverrides = {
  permissionGrants: Permission[];
  permissionDenials: Permission[];
};

/** De onde vem o estado de uma permissão na tela de edição. */
export type PermissionSource =
  /** O acesso dá e não foi retirada. */
  | "role"
  /** Concedida a este usuário além do acesso. */
  | "granted"
  /** Ligada por ser pré-requisito de outra que o usuário tem. */
  | "dependency"
  /** O acesso dá, mas foi retirada deste usuário. */
  | "denied"
  /** Desligada porque um pré-requisito dela foi retirado. */
  | "blocked"
  /** O usuário não tem. */
  | "none";

export type PermissionRowState = {
  enabled: boolean;
  source: PermissionSource;
};

export function describePermissions(
  roles: readonly Role[],
  overrides: PermissionOverrides
): Record<Permission, PermissionRowState> {
  const fromRoles = new Set(getRolePermissions(roles));
  const effective = new Set(getPermissions({ roles, ...overrides }));
  const granted = new Set(overrides.permissionGrants);
  const denied = new Set(overrides.permissionDenials);
  // O que o usuário teria sem as retiradas (acessos + concedidas + pré-requisitos).
  const wanted = withDependencies([...fromRoles, ...granted]);

  const result = {} as Record<Permission, PermissionRowState>;
  for (const permission of PERMISSIONS) {
    const enabled = effective.has(permission);
    let source: PermissionSource;
    if (enabled) {
      source =
        granted.has(permission) && !fromRoles.has(permission)
          ? "granted"
          : fromRoles.has(permission)
            ? "role"
            : "dependency";
    } else if (denied.has(permission) && wanted.has(permission)) {
      source = "denied";
    } else if (wanted.has(permission)) {
      source = "blocked";
    } else {
      source = "none";
    }
    result[permission] = { enabled, source };
  }
  return result;
}

/**
 * Liga ou desliga uma permissão para o usuário e devolve os ajustes já
 * normalizados (só o que difere dos acessos).
 * - Ligar: tira das retiradas a permissão e seus pré-requisitos e concede o
 *   que o acesso não dá.
 * - Desligar: tira das concedidas e, se ela ainda valeria (pelo acesso ou
 *   como pré-requisito de outra), retira. Quem depende dela cai junto.
 */
export function togglePermission(
  roles: readonly Role[],
  overrides: PermissionOverrides,
  permission: Permission,
  enabled: boolean
): PermissionOverrides {
  let grants = [...overrides.permissionGrants];
  let denials = [...overrides.permissionDenials];
  if (enabled) {
    const needed = withDependencies([permission]);
    denials = denials.filter((p) => !needed.has(p));
    grants = [...grants, permission];
  } else {
    grants = grants.filter((p) => p !== permission);
    // Também saem as concedidas que dependem dela (deixariam de valer).
    grants = grants.filter(
      (p) => !withDependencies(PERMISSION_DEPENDENCIES[p] ?? []).has(permission)
    );
    const stillOn = getPermissions({
      roles,
      permissionGrants: grants,
      permissionDenials: denials,
    }).includes(permission);
    if (stillOn) denials = [...denials, permission];
  }
  return normalizePermissionOverrides(roles, grants, denials);
}

export function overridesCount(overrides: PermissionOverrides): number {
  return overrides.permissionGrants.length + overrides.permissionDenials.length;
}

export function sameOverrides(a: PermissionOverrides, b: PermissionOverrides): boolean {
  const same = (x: Permission[], y: Permission[]) =>
    x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return (
    same(a.permissionGrants, b.permissionGrants) &&
    same(a.permissionDenials, b.permissionDenials)
  );
}
