import { describe, expect, test } from "vitest";

import { parseConnectParams, takeoffCallbackUrl } from "./takeoff-connect";

const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "abcdefghijklmnop_-12";
const installation = "inst-0123456789abcdef";

describe("parseConnectParams", () => {
  test("aceita os parâmetros do app", () => {
    expect(
      parseConnectParams({ port: "53123", state, challenge, installation, device: " PC\nROD " })
    ).toEqual({ port: 53123, state, challenge, installation, device: "PC ROD" });
  });

  test("porta precisa ser número entre 1024 e 65535", () => {
    for (const port of [undefined, "", "abc", "80", "70000", "1e4", "123456", "5000/evil"]) {
      expect(parseConnectParams({ port, state, challenge, installation, device: "PC" })).toBeNull();
    }
  });

  test("state e desafio precisam ter o formato esperado", () => {
    expect(parseConnectParams({ port: "5000", state: "curto", challenge, installation })).toBeNull();
    expect(parseConnectParams({ port: "5000", state, challenge: "x", installation })).toBeNull();
    expect(parseConnectParams({ port: "5000", state, challenge, installation })?.device).toBe(
      "computador"
    );
  });

  test("id da instalação é obrigatório e tem formato fixo", () => {
    for (const bad of [undefined, "", "curto", "x".repeat(65), "com espaço-0123456789"]) {
      expect(
        parseConnectParams({ port: "5000", state, challenge, installation: bad })
      ).toBeNull();
    }
  });
});

describe("takeoffCallbackUrl", () => {
  test("volta sempre para 127.0.0.1 na porta do app", () => {
    const url = new URL(takeoffCallbackUrl({ port: 5000, state }, { code: "a&b=c" }));
    expect(url.origin).toBe("http://127.0.0.1:5000");
    expect(url.pathname).toBe("/callback");
    expect(url.searchParams.get("code")).toBe("a&b=c");
    expect(url.searchParams.get("state")).toBe(state);
  });

  test("leva o erro quando o usuário cancela", () => {
    const url = new URL(takeoffCallbackUrl({ port: 5000, state }, { error: "access_denied" }));
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.has("code")).toBe(false);
  });
});
