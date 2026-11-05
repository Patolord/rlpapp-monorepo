import { describe, expect, test } from "vitest";
import {
  describePermissions,
  sameOverrides,
  togglePermission,
  type PermissionOverrides,
} from "./permission-overrides";

const NONE: PermissionOverrides = { permissionGrants: [], permissionDenials: [] };

describe("togglePermission", () => {
  test("ligar uma funcionalidade num técnico concede só ela", () => {
    const next = togglePermission(["qr_operator"], NONE, "medicoes.write", true);
    expect(next).toEqual({ permissionGrants: ["medicoes.write"], permissionDenials: [] });
    const rows = describePermissions(["qr_operator"], next);
    expect(rows["medicoes.write"]).toEqual({ enabled: true, source: "granted" });
    expect(rows["medicoes.read"]).toEqual({ enabled: true, source: "dependency" });
    expect(rows["obras.read"]).toEqual({ enabled: true, source: "dependency" });
    expect(rows["contratos.read"]).toEqual({ enabled: false, source: "none" });
  });

  test("desligar algo do acesso vira retirada e derruba quem depende", () => {
    const next = togglePermission(["engenharia"], NONE, "contratos.read", false);
    expect(next).toEqual({ permissionGrants: [], permissionDenials: ["contratos.read"] });
    const rows = describePermissions(["engenharia"], next);
    expect(rows["contratos.read"]).toEqual({ enabled: false, source: "denied" });
    expect(rows["contratos.write"]).toEqual({ enabled: false, source: "blocked" });
  });

  test("religar algo bloqueado devolve também o pré-requisito", () => {
    const denied = togglePermission(["engenharia"], NONE, "contratos.read", false);
    const next = togglePermission(["engenharia"], denied, "contratos.write", true);
    expect(next).toEqual(NONE);
  });

  test("desligar um pré-requisito trazido por concessão tira a concessão", () => {
    const granted = togglePermission(["qr_operator"], NONE, "medicoes.write", true);
    const next = togglePermission(["qr_operator"], granted, "obras.read", false);
    expect(next).toEqual(NONE);
  });

  test("desligar algo só concedido apenas remove a concessão", () => {
    const granted = togglePermission(["rh"], NONE, "campo.equipe", true);
    expect(togglePermission(["rh"], granted, "campo.equipe", false)).toEqual(NONE);
  });
});

test("sameOverrides ignora a ordem", () => {
  expect(
    sameOverrides(
      { permissionGrants: ["obras.read", "rh.ponto.read"], permissionDenials: [] },
      { permissionGrants: ["rh.ponto.read", "obras.read"], permissionDenials: [] }
    )
  ).toBe(true);
});
