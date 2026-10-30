import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

describe("catálogo de funções para o MCP", () => {
  test("exige usuário interno", async () => {
    const t = setup();
    await expect(t.query(api.mcpCatalog.list, {})).rejects.toThrow(
      "Not authenticated"
    );
    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    await expect(asQr.query(api.mcpCatalog.list, {})).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  test("lista funções públicas com validadores ao vivo e acesso avaliado", async () => {
    const t = setup();
    const asEng = await withUser(t, { clerkId: "eng1", role: "engenheiro" });
    const catalog = await asEng.query(api.mcpCatalog.list, {});
    const byPath = new Map(catalog.map((entry) => [entry.path, entry]));

    // Nunca expõe funções internas nem o próprio catálogo.
    expect(byPath.has("agentTokens:verify")).toBe(false);
    expect(byPath.has("mcpCatalog:list")).toBe(false);

    const listProjects = byPath.get("projects:list");
    expect(listProjects).toMatchObject({
      module: "projects",
      name: "list",
      type: "query",
      access: { kind: "permission", permission: "engenharia.read" },
      allowed: true,
      signature: "{ includeArchived?: boolean }",
    });
    expect(listProjects?.argsValidator).toEqual({
      type: "object",
      value: {
        includeArchived: { fieldType: { type: "boolean" }, optional: true },
      },
    });

    expect(byPath.get("customers:create")).toMatchObject({
      type: "mutation",
      access: { kind: "permission", permission: "engenharia.write" },
      allowed: true,
    });

    // Engenheiro não acessa RH: a função aparece, mas marcada como não permitida.
    expect(byPath.get("employees:list")).toMatchObject({
      access: { kind: "permission", permission: "rh.read" },
      allowed: false,
    });

    // Actions em módulos "use node" entram só pelo nome.
    expect(byPath.get("ai:interpret")).toMatchObject({
      type: "action",
      argsValidator: null,
      signature: "any",
    });

    // Wrappers de staff/autenticado são sempre permitidos para quem lê o catálogo.
    expect(byPath.get("users:list")).toMatchObject({
      access: { kind: "staff" },
      allowed: true,
    });
    expect(byPath.get("maintenanceLogs:create")).toMatchObject({
      access: { kind: "authenticated" },
      allowed: true,
    });
  });

  test("director tem tudo permitido", async () => {
    const t = setup();
    const asDirector = await withUser(t, { clerkId: "dir", role: "director" });
    const catalog = await asDirector.query(api.mcpCatalog.list, {});
    expect(catalog.length).toBeGreaterThan(200);
    expect(catalog.every((entry) => entry.allowed)).toBe(true);
  });
});
