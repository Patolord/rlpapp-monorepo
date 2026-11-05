import {
  getPermissions,
  isStaff,
  resolveHomeArea,
  type Permission,
  type Role,
} from "@rlpapp/shared/auth/permissions";
import { describe, expect, test } from "vitest";

import { UNIVERSAL_HOME_PATH, resolveHomePath, type HomeUser } from "./areas";

/** Usuário como `users.getCurrentUser` devolve (só o que a navegação lê). */
function user(roles: Role[], permissionGrants: Permission[] = []): HomeUser {
  const subject = { roles, permissionGrants };
  return {
    roles,
    permissions: getPermissions(subject),
    isStaff: isStaff(subject),
    homeArea: resolveHomeArea(subject),
  };
}

describe("resolveHomePath", () => {
  test("cada acesso entra pela própria área", () => {
    expect(resolveHomePath(user(["director"]))).toBe("/app");
    expect(resolveHomePath(user(["engenheiro"]))).toBe("/engenharia");
    expect(resolveHomePath(user(["compras"]))).toBe("/compras");
    expect(resolveHomePath(user(["estoque"]))).toBe("/estoque");
    expect(resolveHomePath(user(["rh"]))).toBe("/rh");
    expect(resolveHomePath(user(["qr_operator"]))).toBe("/qr-operador");
  });

  test("só o app desktop: início pessoal, não a engenharia", () => {
    expect(user(["takeoff"]).homeArea).toBe("engenharia");
    expect(resolveHomePath(user(["takeoff"]))).toBe(UNIVERSAL_HOME_PATH);
  });

  test("área inicial que não abre cai na primeira que abre", () => {
    expect(resolveHomePath(user(["takeoff"], ["takeoff.config"]))).toBe(
      "/takeoff/dutos"
    );
    expect(resolveHomePath(user(["takeoff"], ["cadastros.read"]))).toBe(
      "/backoffice"
    );
  });

  test("sem nenhum acesso: início pessoal", () => {
    expect(resolveHomePath(user([]))).toBe(UNIVERSAL_HOME_PATH);
  });

  test("cliente vai para o portal", () => {
    expect(resolveHomePath(user(["client"]))).toBe("/portal");
  });
});
