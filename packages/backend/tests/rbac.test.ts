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

describe("acessos combináveis (roles)", () => {
  test("permissões são a união dos acessos e roles vence o legado", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Misto",
        clerkId: "mix1",
        roles: ["compras", "estoque"],
        role: "director", // legado inconsistente de propósito: roles manda
        isActive: true,
        createdAt: Date.now(),
      });
    });
    const asMixed = t.withIdentity({ subject: "mix1" });
    const me = await asMixed.query(api.users.getCurrentUser, {});
    expect(me?.roles).toEqual(["compras", "estoque"]);
    expect(me?.permissions).toEqual([
      "compras.read",
      "compras.write",
      "suprimentos.read",
      "estoque.read",
      "estoque.write",
      "estoque.central.read",
    ]);
    expect(me?.homeArea).toBe("compras");
    await expect(
      asMixed.query(internal.users.assertPermission, { permission: "admin.manage" })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("cadastro legado (sem roles) é traduzido para acessos", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Legado",
        clerkId: "leg1",
        role: "engenheiro",
        department: "rh",
        isActive: true,
        createdAt: Date.now(),
      });
    });
    const asLegacy = t.withIdentity({ subject: "leg1" });
    const me = await asLegacy.query(api.users.getCurrentUser, {});
    expect(me?.roles).toEqual(["engenheiro", "rh", "takeoff"]);
    expect(me?.permissions).toContain("rh.write");
    expect(me?.permissions).toContain("takeoff.use");
  });

  test("usuário sem acesso nenhum não é staff", async () => {
    const t = setup();
    const asNone = await withUser(t, { clerkId: "none1", roles: [] });
    const me = await asNone.query(api.users.getCurrentUser, {});
    expect(me?.isStaff).toBe(false);
    expect(me?.permissions).toEqual([]);
    await expect(asNone.query(api.users.list, {})).rejects.toThrow(
      "Insufficient permissions"
    );
  });

  test("users.list filtra pelo acesso resolvido, não só pelo cargo legado", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm1", roles: ["admin"] });
    await withUser(t, { clerkId: "t1", name: "Técnico puro", roles: ["qr_operator"] });
    await withUser(t, {
      clerkId: "t2",
      name: "Engenheiro e técnico",
      roles: ["engenheiro", "qr_operator"],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Legado QR",
        clerkId: "t3",
        role: "qr_operator",
        isActive: true,
        createdAt: Date.now(),
      });
    });
    await withUser(t, { clerkId: "t4", name: "Só compras", roles: ["compras"] });
    const technicians = await asAdmin.query(api.users.list, { role: "qr_operator" });
    expect(technicians.map((u) => u.name).sort()).toEqual([
      "Engenheiro e técnico",
      "Legado QR",
      "Técnico puro",
    ]);
  });

  test("migração preenche roles a partir do legado, apaga os campos antigos e é idempotente", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const base = { isActive: true, createdAt: Date.now() };
      await ctx.db.insert("users", { name: "a", clerkId: "a", role: "operator", department: "compras", ...base });
      await ctx.db.insert("users", { name: "b", clerkId: "b", role: "engenheiro", ...base });
      // Já tem roles, mas ainda carrega o legado: só limpa.
      await ctx.db.insert("users", { name: "c", clerkId: "c", roles: ["rh"], role: "operator", ...base });
    });
    await withUser(t, { clerkId: "d", roles: ["estoque"] }); // já limpo
    const first = await t.mutation(internal.migrations.migrateUserAccess, {});
    expect(first).toEqual({ updated: 3, skipped: 1 });
    const second = await t.mutation(internal.migrations.migrateUserAccess, {});
    expect(second).toEqual({ updated: 0, skipped: 4 });
    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    const byClerk = Object.fromEntries(users.map((u) => [u.clerkId, u.roles]));
    expect(byClerk).toEqual({
      a: ["compras", "takeoff"],
      b: ["engenheiro", "takeoff"],
      c: ["rh"],
      d: ["estoque"],
    });
    for (const user of users) {
      expect(user.role).toBeUndefined();
      expect(user.department).toBeUndefined();
    }
  });

  test("login do app Takeoff exige o acesso takeoff.use", async () => {
    const t = setup();
    const asRh = await withUser(t, { clerkId: "rh1", roles: ["rh"] });
    await expect(
      asRh.action(api.takeoffAuth.createCode, {
        challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        device: "PC-RH",
      })
    ).rejects.toThrow("não tem acesso ao app RLP Takeoff");
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
    // Cadastro legado de compras: ganha também o app Takeoff (já entrava nele).
    expect(me?.permissions).toEqual([
      "compras.read",
      "compras.write",
      "suprimentos.read",
      "estoque.read",
      "estoque.central.read",
      "takeoff.use",
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
        roles: ["compras"],
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
