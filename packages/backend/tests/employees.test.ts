import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

async function seedHr() {
  const t = setup();
  const hr = await withUser(t, {
    clerkId: "hr-employees",
    name: "RH",
    role: "operator",
    department: "rh",
  });
  const engineer = await withUser(t, {
    clerkId: "eng-employees",
    name: "Eng",
    role: "engenheiro",
    department: "engenharia",
  });
  return { t, hr, engineer };
}

describe("employees API", () => {
  test("RH can create, update and archive employees", async () => {
    const { hr } = await seedHr();
    const employeeId = await hr.mutation(api.employees.create, {
      name: "Alan Pereira Ferreira",
      code: "125",
      jobTitle: "AJUDANTE GERAL",
      baseSalaryCents: 199_016,
      paymentMethod: "pix",
    });
    await hr.mutation(api.employees.update, {
      employeeId,
      jobTitle: "AJUD GERAL",
      status: "on_leave",
    });
    const listed = await hr.query(api.employees.list, {});
    expect(listed[0]?.jobTitle).toBe("AJUD GERAL");
    expect(listed[0]?.status).toBe("on_leave");

    await hr.mutation(api.employees.archive, { employeeId });
    const active = await hr.query(api.employees.list, {});
    expect(active).toHaveLength(0);
    const archived = await hr.query(api.employees.list, {
      includeArchived: true,
    });
    expect(archived[0]?.archivedAt).not.toBeNull();

    await hr.mutation(api.employees.restore, { employeeId });
    const restored = await hr.query(api.employees.list, {});
    expect(restored).toHaveLength(1);
    expect(restored[0]?._id).toBe(employeeId);

    await hr.mutation(api.employees.archive, { employeeId });
    await expect(
      hr.mutation(api.employees.update, {
        employeeId,
        jobTitle: "AJUDANTE",
      })
    ).rejects.toThrow(/arquivado/i);
  });

  test("staff group drives payroll defaults and can filter the list", async () => {
    const { t, hr } = await seedHr();
    const diretor = await hr.mutation(api.employees.create, {
      name: "Rodrigo Diretor",
      staffGroup: "diretoria",
      baseSalaryCents: 1_500_000,
    });
    const analista = await hr.mutation(api.employees.create, {
      name: "Ana Analista",
      staffGroup: "escritorio",
    });
    const ajudante = await hr.mutation(api.employees.create, {
      name: "Beto Ajudante",
    });
    // Cadastro anterior à equipe: sem o campo no banco.
    await t.run(async (ctx) => {
      await ctx.db.insert("employees", {
        name: "Carlos Legado",
        nameNormalized: "carlos legado",
        status: "active",
        paymentMethod: "pix",
        baseSalaryCents: 0,
        receivesFoodBasket: true,
        dailyTransitCents: 2140,
        defaultTransportFoodDays: 22,
        createdAt: Date.now(),
      });
    });

    const byId = new Map(
      (await hr.query(api.employees.list, {})).map((row) => [row._id, row])
    );
    expect(byId.get(diretor)).toMatchObject({
      staffGroup: "diretoria",
      receivesFoodBasket: true,
      dailyTransitCents: 0,
      defaultTransportFoodDays: 0,
      baseSalaryCents: 1_500_000,
    });
    expect(byId.get(analista)).toMatchObject({
      staffGroup: "escritorio",
      receivesFoodBasket: true,
      dailyTransitCents: 2140,
      defaultTransportFoodDays: 22,
    });
    expect(byId.get(ajudante)).toMatchObject({
      staffGroup: "obra",
      receivesFoodBasket: true,
      dailyTransitCents: 2140,
      defaultTransportFoodDays: 22,
    });

    const obra = await hr.query(api.employees.list, { staffGroup: "obra" });
    expect(obra.map((row) => row.name).sort()).toEqual([
      "Beto Ajudante",
      "Carlos Legado",
    ]);
    expect(obra.every((row) => row.staffGroup === "obra")).toBe(true);

    // Valores explícitos vencem o padrão da equipe.
    const diretorComVt = await hr.mutation(api.employees.create, {
      name: "Dora Diretora",
      staffGroup: "diretoria",
      dailyTransitCents: 1000,
      defaultTransportFoodDays: 10,
      receivesFoodBasket: false,
    });
    const dora = await hr.query(api.employees.get, { employeeId: diretorComVt });
    expect(dora).toMatchObject({
      staffGroup: "diretoria",
      dailyTransitCents: 1000,
      defaultTransportFoodDays: 10,
      receivesFoodBasket: false,
    });

    // Trocar a equipe não mexe nos valores já cadastrados.
    await hr.mutation(api.employees.update, {
      employeeId: ajudante,
      staffGroup: "escritorio",
    });
    const beto = await hr.query(api.employees.get, { employeeId: ajudante });
    expect(beto).toMatchObject({
      staffGroup: "escritorio",
      receivesFoodBasket: true,
    });
  });

  test("blocks engenharia and duplicate identity", async () => {
    const { hr, engineer } = await seedHr();
    await hr.mutation(api.employees.create, {
      name: "Andrea Schil Pellegrini",
      cpf: "529.982.247-25",
    });
    await expect(
      engineer.query(api.employees.list, {})
    ).rejects.toThrow(/recursos humanos/i);
    await expect(
      hr.mutation(api.employees.create, { name: "Andrea Schil Pellegrini" })
    ).rejects.toThrow(/nome/i);
    await expect(
      hr.mutation(api.employees.create, {
        name: "Outra Pessoa",
        cpf: "52998224725",
      })
    ).rejects.toThrow(/CPF/i);
  });
});

describe("migrations.clearEmployeeUserLinks", () => {
  test("apaga o vínculo antigo com o usuário e é idempotente", async () => {
    const t = setup();
    await withUser(t, { clerkId: "linked-user", name: "Ligado", roles: [] });
    const { linkedId, plainId } = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "linked-user"))
        .unique();
      const base = {
        nameNormalized: "x",
        status: "active" as const,
        paymentMethod: "pix" as const,
        baseSalaryCents: 0,
        receivesFoodBasket: false,
        dailyTransitCents: 0,
        defaultTransportFoodDays: 22,
        createdAt: Date.now(),
      };
      return {
        linkedId: await ctx.db.insert("employees", { ...base, name: "Ligado", userId: user!._id }),
        plainId: await ctx.db.insert("employees", { ...base, name: "Sem vínculo" }),
      };
    });

    const first = await t.mutation(internal.migrations.clearEmployeeUserLinks, {});
    expect(first).toEqual({ cleared: 1, done: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.get("employees", linkedId))?.userId).toBeUndefined();
      expect((await ctx.db.get("employees", plainId))?.name).toBe("Sem vínculo");
    });
    const again = await t.mutation(internal.migrations.clearEmployeeUserLinks, {});
    expect(again).toEqual({ cleared: 0, done: true });
  });
});
