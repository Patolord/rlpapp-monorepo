import { describe, expect, test } from "vitest";
import {
  ADMIN_ROLES,
  DEPARTMENTS,
  LEGACY_USER_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  can,
  getPermissions,
  hasPermission,
  hasRole,
  isAdmin,
  isStaff,
  normalizeRoles,
  resolveHomeArea,
  resolveRoles,
  rolesFromLegacy,
  type AccessSubject,
  type Department,
  type Permission,
  type Role,
} from "../src/auth/permissions";

const ALL: Permission[] = [...PERMISSIONS];

const ENGINEERING: Permission[] = [
  "engenharia.read",
  "engenharia.write",
  "suprimentos.read",
  "estoque.read",
];
const PURCHASING: Permission[] = [
  "compras.read",
  "compras.write",
  "suprimentos.read",
  "estoque.read",
  "estoque.central.read",
];
const WAREHOUSE: Permission[] = [
  "estoque.read",
  "estoque.write",
  "estoque.central.read",
];
const HR: Permission[] = ["rh.read", "rh.write"];
const TAKEOFF: Permission[] = ["takeoff.use", "suprimentos.read"];

function sorted(list: readonly Permission[]) {
  return [...list].sort();
}
function union(...lists: readonly Permission[][]) {
  return sorted([...new Set(lists.flat())]);
}

describe("acessos → permissões", () => {
  test("todo acesso tem permissões definidas e só permissões conhecidas", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  test("diretoria e administração têm tudo", () => {
    for (const role of ADMIN_ROLES) {
      expect(sorted(getPermissions({ roles: [role] }))).toEqual(sorted(ALL));
    }
  });

  test("áreas do escritório", () => {
    expect(sorted(getPermissions({ roles: ["engenheiro"] }))).toEqual(sorted(ENGINEERING));
    expect(sorted(getPermissions({ roles: ["engenharia"] }))).toEqual(sorted(ENGINEERING));
    expect(sorted(getPermissions({ roles: ["compras"] }))).toEqual(sorted(PURCHASING));
    expect(sorted(getPermissions({ roles: ["estoque"] }))).toEqual(sorted(WAREHOUSE));
    expect(sorted(getPermissions({ roles: ["rh"] }))).toEqual(sorted(HR));
    expect(sorted(getPermissions({ roles: ["takeoff"] }))).toEqual(sorted(TAKEOFF));
  });

  test("acessos se somam", () => {
    expect(sorted(getPermissions({ roles: ["compras", "estoque"] }))).toEqual(
      union(PURCHASING, WAREHOUSE)
    );
    expect(sorted(getPermissions({ roles: ["engenheiro", "takeoff"] }))).toEqual(
      union(ENGINEERING, TAKEOFF)
    );
    expect(sorted(getPermissions({ roles: ["rh", "qr_operator"] }))).toEqual(sorted(HR));
  });

  test("externos não têm permissão de escritório", () => {
    expect(getPermissions({ roles: ["qr_operator"] })).toEqual([]);
    expect(getPermissions({ roles: ["client"] })).toEqual([]);
    expect(getPermissions({ roles: [] })).toEqual([]);
  });

  test("regras de estoque e gestão de usuários são só de admin", () => {
    for (const role of ROLES) {
      const subject: AccessSubject = { roles: [role] };
      expect(hasPermission(subject, "estoque.rules")).toBe(isAdmin(subject));
      expect(hasPermission(subject, "admin.manage")).toBe(isAdmin(subject));
    }
  });

  test("staff é quem tem algum acesso interno", () => {
    for (const role of ROLES) {
      expect(isStaff({ roles: [role] })).toBe(STAFF_ROLES.includes(role));
    }
    expect(isStaff({ roles: [] })).toBe(false);
    expect(isStaff({ roles: ["qr_operator", "estoque"] })).toBe(true);
  });

  test("normalizeRoles remove repetidos e desconhecidos", () => {
    expect(normalizeRoles(["rh", "compras", "rh", "x"])).toEqual(["compras", "rh"]);
  });
});

describe("legado: cargo + departamento", () => {
  const BY_DEPARTMENT: Record<Department, Permission[]> = {
    engenharia: union(ENGINEERING, TAKEOFF),
    compras: union(PURCHASING, TAKEOFF),
    estoque: sorted(WAREHOUSE),
    rh: sorted(HR),
  };

  test("admin e diretor têm todas as permissões, com ou sem departamento", () => {
    for (const role of ["director", "admin"] as const) {
      expect(sorted(getPermissions({ role }))).toEqual(sorted(ALL));
      for (const department of DEPARTMENTS) {
        expect(sorted(getPermissions({ role, department }))).toEqual(sorted(ALL));
      }
    }
  });

  test("manager e operator herdam o departamento; sem departamento, nada", () => {
    for (const role of ["manager", "operator"] as const) {
      expect(getPermissions({ role })).toEqual([]);
      expect(isStaff({ role })).toBe(false);
      for (const department of DEPARTMENTS) {
        expect(sorted(getPermissions({ role, department }))).toEqual(BY_DEPARTMENT[department]);
        expect(isStaff({ role, department })).toBe(true);
      }
    }
  });

  test("engenheiro soma engenharia (e takeoff) ao departamento", () => {
    expect(resolveRoles({ role: "engenheiro" })).toEqual(["engenheiro", "takeoff"]);
    expect(resolveRoles({ role: "engenheiro", department: "engenharia" })).toEqual([
      "engenheiro",
      "takeoff",
    ]);
    expect(sorted(getPermissions({ role: "engenheiro", department: "rh" }))).toEqual(
      union(ENGINEERING, TAKEOFF, HR)
    );
  });

  test("externos", () => {
    expect(resolveRoles({ role: "qr_operator" })).toEqual(["qr_operator"]);
    expect(resolveRoles({ role: "client" })).toEqual(["client"]);
    expect(isStaff({ role: "qr_operator" })).toBe(false);
  });

  test("`roles` preenchido manda, mesmo com legado presente", () => {
    const subject: AccessSubject = { roles: ["rh"], role: "director", department: "compras" };
    expect(resolveRoles(subject)).toEqual(["rh"]);
    expect(isAdmin(subject)).toBe(false);
  });

  test("rolesFromLegacy cobre todos os cargos e departamentos", () => {
    for (const role of LEGACY_USER_ROLES) {
      for (const department of [undefined, ...DEPARTMENTS]) {
        const roles = rolesFromLegacy(role, department);
        expect(roles).toEqual([...new Set(roles)]);
        expect(isStaff({ roles })).toBe(isStaff({ role, department }));
      }
    }
  });
});

describe("hasRole, can e área inicial", () => {
  test("hasRole", () => {
    expect(hasRole({ roles: ["compras", "qr_operator"] }, "qr_operator")).toBe(true);
    expect(hasRole({ role: "engenheiro" }, "engenheiro")).toBe(true);
    expect(hasRole({ role: "operator", department: "engenharia" }, "engenheiro")).toBe(false);
  });

  test("can() avalia qualquer uma das permissões e nega sem usuário", () => {
    const user = { permissions: getPermissions({ roles: ["compras"] }) };
    expect(can(user, "compras.write")).toBe(true);
    expect(can(user, "rh.read", "compras.read")).toBe(true);
    expect(can(user, "rh.read")).toBe(false);
    expect(can(null, "compras.write")).toBe(false);
    expect(can(undefined, "compras.write")).toBe(false);
  });

  test("área inicial", () => {
    expect(resolveHomeArea({ roles: ["director"] })).toBeNull();
    expect(resolveHomeArea({ roles: ["admin", "compras"] })).toBe("compras");
    expect(resolveHomeArea({ roles: ["engenheiro", "rh"] })).toBe("engenharia");
    expect(resolveHomeArea({ roles: ["estoque"] })).toBe("estoque");
    expect(resolveHomeArea({ roles: [] })).toBe("engenharia");
    expect(resolveHomeArea({ roles: ["qr_operator"] })).toBe("qr-operador");
    // Técnico que também é da equipe entra pelo escritório.
    expect(resolveHomeArea({ roles: ["qr_operator", "estoque"] })).toBe("estoque");
    // Legado
    expect(resolveHomeArea({ role: "director" })).toBeNull();
    expect(resolveHomeArea({ role: "admin", department: "compras" })).toBe("compras");
    expect(resolveHomeArea({ role: "engenheiro", department: "rh" })).toBe("engenharia");
    expect(resolveHomeArea({ role: "operator" })).toBe("engenharia");
    expect(resolveHomeArea({ role: "qr_operator" })).toBe("qr-operador");
  });

  test("todo acesso tem rótulo e descrição", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });
});
