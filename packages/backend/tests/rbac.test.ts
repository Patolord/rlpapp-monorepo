import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("esperava rejeição");
}

describe("erros de acesso tipados", () => {
  test("sem identidade: ConvexError UNAUTHENTICATED", async () => {
    const t = setup();
    const error = await rejection(t.query(api.users.list, {}));
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data).toEqual({
      code: "UNAUTHENTICATED",
      message: "Not authenticated",
    });
  });

  test("sem permissão: ConvexError FORBIDDEN com a permissão que faltou", async () => {
    const t = setup();
    const asCompras = await withUser(t, {
      clerkId: "compras1",
      role: "operator",
      department: "compras",
    });
    const error = await rejection(
      asCompras.query(internal.users.assertPermission, { permission: "rh.read" })
    );
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data).toEqual({
      code: "FORBIDDEN",
      message: "Acesso restrito à área de recursos humanos",
      permission: "rh.read",
    });
  });

  test("usuário externo em query de staff: FORBIDDEN genérico", async () => {
    const t = setup();
    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    const error = await rejection(asQr.query(api.users.list, {}));
    expect((error as ConvexError<{ code: string }>).data).toEqual({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    });
  });
});

describe("users.getCurrentUser", () => {
  test("devolve as permissões calculadas, isStaff e a área inicial", async () => {
    const t = setup();
    const asCompras = await withUser(t, {
      clerkId: "compras1",
      role: "operator",
      department: "compras",
    });
    const me = await asCompras.query(api.users.getCurrentUser, {});
    expect(me?.isStaff).toBe(true);
    expect(me?.homeArea).toBe("compras");
    expect(me?.permissions).toEqual([
      "compras.read",
      "compras.write",
      "suprimentos.read",
      "estoque.read",
      "estoque.central.read",
    ]);

    const asDirector = await withUser(t, { clerkId: "dir1", role: "director" });
    const director = await asDirector.query(api.users.getCurrentUser, {});
    expect(director?.homeArea).toBeNull();
    expect(director?.permissions).toContain("admin.manage");

    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    const qr = await asQr.query(api.users.getCurrentUser, {});
    expect(qr?.isStaff).toBe(false);
    expect(qr?.permissions).toEqual([]);
    expect(qr?.homeArea).toBe("qr-operador");
  });

  test("sem identidade devolve null", async () => {
    const t = setup();
    expect(await t.query(api.users.getCurrentUser, {})).toBeNull();
  });
});

describe("gate de permissão para actions", () => {
  test("internal.users.assertPermission aceita quem tem a permissão", async () => {
    const t = setup();
    const asRh = await withUser(t, { clerkId: "rh1", role: "manager", department: "rh" });
    await expect(
      asRh.query(internal.users.assertPermission, { permission: "rh.write" })
    ).resolves.toBeNull();
  });

  test("userAdmin.adminCreateUser exige admin.manage antes de falar com o Clerk", async () => {
    const t = setup();
    const asOperator = await withUser(t, { clerkId: "op1", role: "operator" });
    await expect(
      asOperator.action(api.userAdmin.adminCreateUser, {
        name: "Novo",
        username: "novo",
        password: "senha-forte-123",
        role: "operator",
      })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("actions de IA exigem engenharia.write", async () => {
    const t = setup();
    const projectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        name: "Obra teste",
        slug: "obra-teste",
        floors: [],
        createdAt: Date.now(),
      })
    );
    const asQr = await withUser(t, { clerkId: "qr1", role: "qr_operator" });
    await expect(
      asQr.action(api.ai.interpret, { projectId, message: "oi" })
    ).rejects.toThrow("Insufficient permissions");

    const asRh = await withUser(t, { clerkId: "rh1", role: "operator", department: "rh" });
    await expect(
      asRh.action(api.ai.interpret, { projectId, message: "oi" })
    ).rejects.toThrow("Acesso restrito à área de engenharia");
  });
});
