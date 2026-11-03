import { describe, expect, test } from "vitest";
import {
  ADMIN_ROLES,
  DEPARTMENTS,
  PERMISSIONS,
  STAFF_ROLES,
  USER_ROLES,
  can,
  getPermissions,
  hasPermission,
  isAdmin,
  isStaff,
  resolveHomeArea,
  type AccessSubject,
  type Department,
  type Permission,
  type UserRole,
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

const BY_DEPARTMENT: Record<Department, Permission[]> = {
  engenharia: ENGINEERING,
  compras: PURCHASING,
  estoque: WAREHOUSE,
  rh: HR,
};

function sorted(list: readonly Permission[]) {
  return [...list].sort();
}

describe("política de acesso", () => {
  test("admin e diretor têm todas as permissões, com ou sem departamento", () => {
    for (const role of ADMIN_ROLES) {
      expect(sorted(getPermissions({ role }))).toEqual(sorted(ALL));
      for (const department of DEPARTMENTS) {
        expect(sorted(getPermissions({ role, department }))).toEqual(sorted(ALL));
      }
    }
  });

  test("manager e operator herdam as permissões do departamento", () => {
    for (const role of ["manager", "operator"] as const) {
      expect(getPermissions({ role })).toEqual([]);
      for (const department of DEPARTMENTS) {
        expect(sorted(getPermissions({ role, department }))).toEqual(
          sorted(BY_DEPARTMENT[department])
        );
      }
    }
  });

  test("engenheiro tem engenharia e soma as permissões do departamento", () => {
    expect(sorted(getPermissions({ role: "engenheiro" }))).toEqual(sorted(ENGINEERING));
    expect(sorted(getPermissions({ role: "engenheiro", department: "engenharia" }))).toEqual(
      sorted(ENGINEERING)
    );
    expect(sorted(getPermissions({ role: "engenheiro", department: "rh" }))).toEqual(
      sorted([...new Set([...ENGINEERING, ...HR])])
    );
  });

  test("usuários externos não têm permissão nenhuma", () => {
    for (const role of ["qr_operator", "client"] as const) {
      for (const department of [undefined, ...DEPARTMENTS]) {
        expect(getPermissions({ role, department })).toEqual([]);
      }
    }
  });

  test("regras de estoque e gestão de usuários são só de admin", () => {
    const subjects: AccessSubject[] = USER_ROLES.flatMap((role) =>
      [undefined, ...DEPARTMENTS].map((department) => ({ role, department }))
    );
    for (const subject of subjects) {
      expect(hasPermission(subject, "estoque.rules")).toBe(isAdmin(subject));
      expect(hasPermission(subject, "admin.manage")).toBe(isAdmin(subject));
    }
  });

  test("staff e admin", () => {
    const expectedStaff: Record<UserRole, boolean> = {
      director: true,
      admin: true,
      manager: true,
      operator: true,
      engenheiro: true,
      qr_operator: false,
      client: false,
    };
    for (const role of USER_ROLES) {
      expect(isStaff({ role })).toBe(expectedStaff[role]);
      expect(STAFF_ROLES.includes(role)).toBe(expectedStaff[role]);
    }
  });

  test("can() avalia qualquer uma das permissões e nega sem usuário", () => {
    const user = { permissions: getPermissions({ role: "operator", department: "compras" }) };
    expect(can(user, "compras.write")).toBe(true);
    expect(can(user, "rh.read", "compras.read")).toBe(true);
    expect(can(user, "rh.read")).toBe(false);
    expect(can(null, "compras.write")).toBe(false);
    expect(can(undefined, "compras.write")).toBe(false);
  });

  test("área inicial", () => {
    expect(resolveHomeArea({ role: "director" })).toBeNull();
    expect(resolveHomeArea({ role: "admin", department: "compras" })).toBe("compras");
    expect(resolveHomeArea({ role: "engenheiro", department: "rh" })).toBe("engenharia");
    expect(resolveHomeArea({ role: "operator", department: "estoque" })).toBe("estoque");
    expect(resolveHomeArea({ role: "operator" })).toBe("engenharia");
    expect(resolveHomeArea({ role: "qr_operator" })).toBe("qr-operador");
  });
});
