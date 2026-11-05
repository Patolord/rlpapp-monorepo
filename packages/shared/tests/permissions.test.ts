import { describe, expect, test } from "vitest";
import {
  ADMIN_ROLES,
  PERMISSION_DEPENDENCIES,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  getRolePermissions,
  normalizePermissionOverrides,
  withDependencies,
  DEPARTMENTS,
  LEGACY_USER_ROLES,
  PERMISSIONS,
  PERSONAL_PERMISSIONS,
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
/** O que diretoria e administração recebem: tudo menos os deveres pessoais. */
const ALL_ACCESS: Permission[] = ALL.filter(
  (permission) => !PERSONAL_PERMISSIONS.includes(permission)
);

const ENGINEERING: Permission[] = [
  "obras.read",
  "obras.write",
  "obras.gestao",
  "contratos.read",
  "contratos.write",
  "medicoes.read",
  "medicoes.write",
  "medicoes.aprovar",
  "documentos.read",
  "documentos.write",
  "orcamentos.write",
  "assistente.use",
  "cadastros.read",
  "cadastros.write",
  "suprimentos.read",
  "takeoff.config",
  "estoque.read",
  "estoque.obras.write",
  "estoque.solicitacoes",
  "campo.equipe",
];
const PURCHASING: Permission[] = [
  "suprimentos.read",
  "compras.read",
  "materiais.write",
  "fornecedores.write",
  "precos.write",
  "takeoff.config",
  "estoque.read",
  "estoque.central.read",
  "estoque.entrada",
];
const WAREHOUSE: Permission[] = [
  "estoque.read",
  "estoque.central.read",
  "estoque.write",
  "estoque.entrada",
  "estoque.obras.write",
];
const HR: Permission[] = [
  "rh.funcionarios.read",
  "rh.funcionarios.write",
  "rh.folha.read",
  "rh.folha.write",
  "rh.ponto.read",
  "rh.ponto.write",
];
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

  test("diretoria e administração têm tudo, menos os deveres pessoais", () => {
    for (const role of ADMIN_ROLES) {
      expect(sorted(getPermissions({ roles: [role] }))).toEqual(sorted(ALL_ACCESS));
    }
  });

  test("bater ponto não vem de nenhum acesso, só de ajuste individual", () => {
    for (const role of ROLES) {
      expect(getPermissions({ roles: [role] })).not.toContain("ponto.registrar");
    }
    expect(
      hasPermission({ roles: ["qr_operator"], permissionGrants: ["ponto.registrar"] }, "ponto.registrar")
    ).toBe(true);
    expect(
      hasPermission({ roles: ["admin"], permissionGrants: ["ponto.registrar"] }, "ponto.registrar")
    ).toBe(true);
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
      expect(sorted(getPermissions({ role }))).toEqual(sorted(ALL_ACCESS));
      for (const department of DEPARTMENTS) {
        expect(sorted(getPermissions({ role, department }))).toEqual(sorted(ALL_ACCESS));
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
    expect(can(user, "materiais.write")).toBe(true);
    expect(can(user, "rh.folha.read", "compras.read")).toBe(true);
    expect(can(user, "rh.folha.read")).toBe(false);
    expect(can(null, "materiais.write")).toBe(false);
    expect(can(undefined, "materiais.write")).toBe(false);
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

  test("área inicial sem acesso de departamento segue as permissões avulsas", () => {
    expect(
      resolveHomeArea({ roles: ["takeoff"], permissionGrants: ["rh.folha.read"] })
    ).toBe("rh");
    expect(
      resolveHomeArea({ roles: [], permissionGrants: ["compras.read"] })
    ).toBe("compras");
    // Técnico com uma funcionalidade do escritório continua entrando pelo campo.
    expect(
      resolveHomeArea({ roles: ["qr_operator"], permissionGrants: ["medicoes.read"] })
    ).toBe("qr-operador");
  });

  test("todo acesso tem rótulo e descrição", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });
});

describe("ajustes individuais", () => {
  test("toda permissão tem rótulo, descrição e um grupo só", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions);
    expect(sorted(grouped)).toEqual(sorted(ALL));
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeTruthy();
      expect(PERMISSION_DESCRIPTIONS[permission]).toBeTruthy();
    }
  });

  test("pré-requisitos não formam ciclo e os acessos já os incluem", () => {
    for (const permission of PERMISSIONS) {
      const deps = withDependencies(PERMISSION_DEPENDENCIES[permission] ?? []);
      expect(deps.has(permission)).toBe(false);
    }
    for (const role of ROLES) {
      expect(sorted(getRolePermissions([role]))).toEqual(sorted(ROLE_PERMISSIONS[role]));
    }
  });

  test("técnico com uma funcionalidade de engenharia", () => {
    const subject: AccessSubject = {
      roles: ["qr_operator"],
      permissionGrants: ["medicoes.write"],
    };
    expect(sorted(getPermissions(subject))).toEqual(
      sorted(["medicoes.write", "medicoes.read", "obras.read"])
    );
    expect(hasPermission(subject, "contratos.read")).toBe(false);
    expect(isStaff(subject)).toBe(false);
  });

  test("técnico líder enxerga todas as obras no campo", () => {
    expect(
      hasPermission(
        { roles: ["qr_operator"], permissionGrants: ["campo.todas_obras"] },
        "campo.todas_obras"
      )
    ).toBe(true);
    expect(hasPermission({ roles: ["qr_operator"] }, "campo.todas_obras")).toBe(false);
  });

  test("engenheiro sem contratos nem gestão de obras", () => {
    const subject: AccessSubject = {
      roles: ["engenheiro"],
      permissionDenials: ["contratos.read", "obras.gestao"],
    };
    const permissions = getPermissions(subject);
    expect(permissions).not.toContain("contratos.read");
    // Sem o pré-requisito, a escrita também sai.
    expect(permissions).not.toContain("contratos.write");
    expect(permissions).not.toContain("obras.gestao");
    expect(permissions).toContain("obras.write");
    expect(permissions).toContain("medicoes.write");
  });

  test("retirar um pré-requisito derruba o que depende dele", () => {
    const permissions = getPermissions({
      roles: ["engenharia"],
      permissionDenials: ["obras.read"],
    });
    for (const permission of [
      "obras.read",
      "obras.write",
      "obras.gestao",
      "contratos.read",
      "medicoes.write",
      "documentos.read",
      "orcamentos.write",
      "assistente.use",
    ] as const) {
      expect(permissions).not.toContain(permission);
    }
    expect(permissions).toContain("cadastros.write");
    expect(permissions).toContain("estoque.obras.write");
  });

  test("retirada vale também para administradores", () => {
    expect(
      hasPermission({ roles: ["admin"], permissionDenials: ["rh.folha.read"] }, "rh.folha.write")
    ).toBe(false);
    expect(hasPermission({ roles: ["admin"] }, "rh.folha.write")).toBe(true);
  });

  test("valores desconhecidos nos ajustes são ignorados", () => {
    expect(getPermissions({ roles: [], permissionGrants: ["x.y", "engenharia.read"] })).toEqual(
      []
    );
  });

  test("normalizePermissionOverrides guarda só o que difere dos acessos", () => {
    expect(
      normalizePermissionOverrides(
        ["engenharia"],
        ["obras.read", "rh.ponto.read", "x", "rh.ponto.read"],
        ["contratos.write", "rh.folha.read"]
      )
    ).toEqual({
      permissionGrants: ["rh.ponto.read"],
      permissionDenials: ["contratos.write"],
    });
    // Concedida e retirada ao mesmo tempo: fica só a retirada (se o acesso dá).
    expect(
      normalizePermissionOverrides(["rh"], ["obras.read"], ["obras.read"])
    ).toEqual({ permissionGrants: [], permissionDenials: [] });
  });
});
