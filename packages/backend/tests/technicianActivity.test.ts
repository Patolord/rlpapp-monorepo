import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

// Histórico unificado do técnico agrupado por obra:
// cadastro de equipamento + maintenanceLogs (instalação/manutenção) +
// equipmentHistory (installed/tested/finalized). Fontes limitadas a
// 400 itens cada (MAX_PER_SOURCE em technicianActivity.ts).

type TestConvex = ReturnType<typeof setup>;

async function userIdByClerk(
  t: TestConvex,
  clerkId: string
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();
    if (!user) throw new Error("user not found");
    return user._id;
  });
}

async function seedProject(t: TestConvex, name: string): Promise<Id<"projects">> {
  return t.run(async (ctx) =>
    ctx.db.insert("projects", {
      name,
      floors: [],
      createdAt: Date.now(),
    })
  );
}

async function seedPlanned(
  t: TestConvex,
  projectId: Id<"projects">,
  modelo = "VRF-100"
): Promise<Id<"projectEquipment">> {
  return t.run(async (ctx) =>
    ctx.db.insert("projectEquipment", {
      projectId,
      system: "Sistema 1",
      ambiente: "Sala",
      kind: "condensadora",
      modelo,
      capacidade: "36000",
      status: "installing",
    })
  );
}

async function seedEquipment(
  t: TestConvex,
  opts: {
    description?: string;
    projectEquipmentId?: Id<"projectEquipment">;
    createdByUserId?: Id<"users">;
    createdAt?: number;
  } = {}
): Promise<Id<"equipment">> {
  return t.run(async (ctx) =>
    ctx.db.insert("equipment", {
      description: opts.description ?? "Equipamento de teste",
      status: "operational",
      createdAt: opts.createdAt ?? Date.now(),
      projectEquipmentId: opts.projectEquipmentId,
      createdByUserId: opts.createdByUserId,
    })
  );
}

async function seedLog(
  t: TestConvex,
  userId: Id<"users">,
  equipmentId: Id<"equipment">,
  createdAt = Date.now()
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("maintenanceLogs", {
      equipmentId,
      type: "maintenance",
      technicianName: "Técnico",
      createdByUserId: userId,
      status: "operational",
      photoIds: [],
      createdAt,
    });
  });
}

async function seedFieldAction(
  t: TestConvex,
  userId: Id<"users">,
  plannedId: Id<"projectEquipment">,
  action = "installed",
  createdAt = Date.now()
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("equipmentHistory", {
      equipmentId: plannedId,
      action,
      userId,
      createdAt,
    });
  });
}

describe("technicianActivity", () => {
  test("log + fieldAction na mesma obra aparecem agrupados", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-1",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-1");

    const projectId = await seedProject(t, "Obra Alfa");
    const plannedId = await seedPlanned(t, projectId);
    const equipmentId = await seedEquipment(t, {
      projectEquipmentId: plannedId,
    });

    await seedLog(t, techId, equipmentId, 1000);
    await seedFieldAction(t, techId, plannedId, "installed", 2000);
    await seedFieldAction(t, techId, plannedId, "tested", 3000);

    const projects = await asTech.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId,
      projectName: "Obra Alfa",
      count: 3,
      lastActivityAt: 3000,
    });

    const page = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 10, cursor: null } }
    );
    expect(page.page).toHaveLength(3);
    expect(page.isDone).toBe(true);
    // Ordenado por data desc, mesclando as duas fontes.
    expect(page.page.map((i) => i.kind)).toEqual([
      "fieldAction",
      "fieldAction",
      "maintenanceLog",
    ]);
    expect(page.page.map((i) => i.label)).toEqual([
      "Testado",
      "Instalado",
      "Manutenção",
    ]);
  });

  test("equipamento só com qrCodes.projectId agrupa na obra do lote", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-2",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-2");

    const projectId = await seedProject(t, "Obra Beta");
    // Equipamento registrado pelo técnico, ainda sem item planejado.
    const equipmentId = await seedEquipment(t, {
      description: "Condensadora nova",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "BETA123",
        equipmentId,
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
    });
    await seedLog(t, techId, equipmentId);

    const projects = await asTech.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].projectId).toBe(projectId);
    expect(projects[0].projectName).toBe("Obra Beta");

    const page = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 10, cursor: null } }
    );
    expect(page.page).toHaveLength(1);
    expect(page.page[0].qrToken).toBe("BETA123");
  });

  test("registro sem vínculo entra no grupo Sem obra (projectId null)", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-3",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-3");

    const equipmentId = await seedEquipment(t);
    await seedLog(t, techId, equipmentId);

    const projects = await asTech.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].projectId).toBeNull();
    expect(projects[0].projectName).toBeNull();
    expect(projects[0].count).toBe(1);

    const page = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId: null, paginationOpts: { numItems: 10, cursor: null } }
    );
    expect(page.page).toHaveLength(1);
    expect(page.page[0].kind).toBe("maintenanceLog");
  });

  test("usuário A não vê atividade do usuário B", async () => {
    const t = setup();
    const asA = await withUser(t, { clerkId: "tech-a", role: "qr_operator" });
    await withUser(t, { clerkId: "tech-b", role: "qr_operator" });
    const userA = await userIdByClerk(t, "tech-a");
    const userB = await userIdByClerk(t, "tech-b");

    const projectId = await seedProject(t, "Obra Gama");
    const plannedId = await seedPlanned(t, projectId);
    const equipmentId = await seedEquipment(t, {
      projectEquipmentId: plannedId,
    });

    await seedLog(t, userA, equipmentId);
    await seedLog(t, userB, equipmentId);
    await seedFieldAction(t, userB, plannedId);

    const projects = await asA.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].count).toBe(1);

    const page = await asA.query(api.technicianActivity.listMineForProject, {
      projectId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0].kind).toBe("maintenanceLog");
  });

  test("ações administrativas do equipmentHistory ficam de fora", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-4",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-4");

    const projectId = await seedProject(t, "Obra Delta");
    const plannedId = await seedPlanned(t, projectId);

    await seedFieldAction(t, techId, plannedId, "created");
    await seedFieldAction(t, techId, plannedId, "qr_linked");
    await seedFieldAction(t, techId, plannedId, "finalized");

    const projects = await asTech.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].count).toBe(1);

    const page = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 10, cursor: null } }
    );
    expect(page.page).toHaveLength(1);
    expect(page.page[0].label).toBe("Finalizado");
  });

  test("paginação por cursor percorre a lista mesclada", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-5",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-5");

    const projectId = await seedProject(t, "Obra Épsilon");
    const plannedId = await seedPlanned(t, projectId);
    const equipmentId = await seedEquipment(t, {
      projectEquipmentId: plannedId,
    });

    for (let i = 0; i < 3; i++) {
      await seedLog(t, techId, equipmentId, 1000 + i);
      await seedFieldAction(t, techId, plannedId, "installed", 2000 + i);
    }

    const first = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 4, cursor: null } }
    );
    expect(first.page).toHaveLength(4);
    expect(first.isDone).toBe(false);

    const second = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 4, cursor: first.continueCursor } }
    );
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(true);

    const all = [...first.page, ...second.page];
    expect(new Set(all.map((i) => i.id)).size).toBe(6);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].createdAt).toBeGreaterThanOrEqual(all[i].createdAt);
    }
  });

  test("exige autenticação", async () => {
    const t = setup();
    await expect(
      t.query(api.technicianActivity.listMineProjects, {})
    ).rejects.toThrow("Not authenticated");
  });

  test("cadastro de equipamento aparece no histórico", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-reg",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-reg");

    const projectId = await seedProject(t, "Obra Cadastro");
    const equipmentId = await seedEquipment(t, {
      description: "Condensadora cadastrada",
      createdByUserId: techId,
      createdAt: 1500,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "CADASTRO1",
        equipmentId,
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
    });

    const projects = await asTech.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      projectId,
      projectName: "Obra Cadastro",
      count: 1,
      lastActivityAt: 1500,
    });

    const page = await asTech.query(
      api.technicianActivity.listMineForProject,
      { projectId, paginationOpts: { numItems: 10, cursor: null } }
    );
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({
      kind: "registration",
      label: "Cadastro",
      title: "Condensadora cadastrada",
      qrToken: "CADASTRO1",
    });
  });

  test("usuário A não vê cadastro do usuário B", async () => {
    const t = setup();
    const asA = await withUser(t, {
      clerkId: "tech-reg-a",
      role: "qr_operator",
    });
    await withUser(t, { clerkId: "tech-reg-b", role: "qr_operator" });
    const userB = await userIdByClerk(t, "tech-reg-b");

    await seedEquipment(t, {
      description: "Só do B",
      createdByUserId: userB,
    });

    const projects = await asA.query(
      api.technicianActivity.listMineProjects,
      {}
    );
    expect(projects).toHaveLength(0);
  });
});
