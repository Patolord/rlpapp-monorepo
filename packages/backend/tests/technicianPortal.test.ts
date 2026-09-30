import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

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

async function seedProject(
  t: TestConvex,
  name: string,
  technicianIds?: Id<"users">[]
): Promise<Id<"projects">> {
  return t.run(async (ctx) =>
    ctx.db.insert("projects", {
      name,
      floors: [],
      createdAt: Date.now(),
      technicianIds,
    })
  );
}

describe("technicianPortal", () => {
  test("técnico só lista obras atribuídas", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-portal-1",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-portal-1");

    const assignedId = await seedProject(t, "Obra Atribuída", [techId]);
    await seedProject(t, "Obra Outra");

    const projects = await asTech.query(api.technicianPortal.listMyProjects, {});
    expect(projects).toHaveLength(1);
    expect(projects[0]._id).toBe(assignedId);
    expect(projects[0].name).toBe("Obra Atribuída");
  });

  test("técnico não atribuído não lista QRs da obra", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-portal-2",
      role: "qr_operator",
    });

    const projectId = await seedProject(t, "Obra Fechada");
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "FECHADO1",
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
    });

    await expect(
      asTech.query(api.technicianPortal.listQrsByProject, { projectId })
    ).rejects.toThrow("Acesso negado a esta obra");
  });

  test("técnico não atribuído pode buscar etiquetas pelo catálogo da obra", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-browse-1",
      role: "qr_operator",
    });
    const projectId = await seedProject(t, "Obra Catálogo");
    const otherProjectId = await seedProject(t, "Obra Sem Etiquetas");
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "CATALOGO1",
        status: "active",
        projectId,
        batchName: "Lote Catálogo",
        createdAt: Date.now(),
      });
      await ctx.db.insert("qrCodes", {
        token: "INATIVO1",
        status: "inactive",
        projectId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("qrCodes", {
        token: "OUTRA001",
        status: "active",
        projectId: otherProjectId,
        createdAt: Date.now(),
      });
    });

    const projects = await asTech.query(
      api.technicianPortal.listBrowsableProjects,
      {}
    );
    expect(projects.map((project) => project._id)).toContain(projectId);

    const qrs = await asTech.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(qrs.page).toHaveLength(1);
    expect(qrs.page[0].token).toBe("CATALOGO1");
    expect(qrs.page[0].batchName).toBe("Lote Catálogo");
    expect(qrs.page.some((qr) => qr.token === "OUTRA001")).toBe(false);
    expect(qrs.page.some((qr) => qr.token === "INATIVO1")).toBe(false);
  });

  test("busca e filtro do catálogo alcançam etiquetas fora da primeira página", async () => {
    const t = setup();
    const asAdmin = await withUser(t, {
      clerkId: "admin-browse-1",
      role: "admin",
    });
    const adminId = await userIdByClerk(t, "admin-browse-1");
    const projectId = await seedProject(t, "Obra Lorena");

    await t.run(async (ctx) => {
      const equipmentId = await ctx.db.insert("equipment", {
        description: "Condensadora Bloco B",
        status: "installing",
        createdAt: 1,
        createdByUserId: adminId,
      });
      await ctx.db.insert("qrCodes", {
        token: "LORENAOLD1",
        status: "active",
        projectId,
        equipmentId,
        createdAt: 1,
      });
      for (let i = 0; i < 30; i++) {
        await ctx.db.insert("qrCodes", {
          token: `LORENANEW${i}`,
          status: "active",
          projectId,
          createdAt: 100 + i,
        });
      }
    });

    const firstPage = await asAdmin.query(
      api.technicianPortal.listBrowsableQrsByProject,
      { projectId, paginationOpts: { cursor: null, numItems: 20 } }
    );
    expect(firstPage.page.some((qr) => qr.token === "LORENAOLD1")).toBe(false);

    const bySearch = await asAdmin.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId,
        search: "  condensadora ",
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(bySearch.page.map((qr) => qr.token)).toEqual(["LORENAOLD1"]);
    expect(bySearch.isDone).toBe(true);

    const registered = await asAdmin.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId,
        filter: "registered",
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(registered.page.map((qr) => qr.token)).toEqual(["LORENAOLD1"]);

    const free = await asAdmin.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId,
        filter: "free",
        paginationOpts: { cursor: null, numItems: 50 },
      }
    );
    expect(free.page).toHaveLength(30);

    const projects = await asAdmin.query(
      api.technicianPortal.listBrowsableProjects,
      {}
    );
    const lorena = projects.find((project) => project._id === projectId);
    expect(lorena?.qrCount).toBe(31);
    expect(lorena?.registeredCount).toBe(1);
  });

  test("catálogo inclui etiquetas livres de lotes sem obra de destino", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-unassigned-1",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-unassigned-1");
    const lorenaId = await seedProject(t, "Obra Lorena");
    const otherId = await seedProject(t, "Obra Outra");

    await t.run(async (ctx) => {
      const equipmentId = await ctx.db.insert("equipment", {
        description: "Cadastrado sem obra",
        status: "installing",
        createdAt: 1,
        createdByUserId: techId,
      });
      await ctx.db.insert("qrBatches", {
        batchId: "batch-sem-destino",
        createdAt: 1,
      });
      await ctx.db.insert("qrBatches", {
        batchId: "batch-outra",
        projectId: otherId,
        createdAt: 1,
      });
      await ctx.db.insert("qrCodes", {
        token: "LORENA01",
        status: "active",
        projectId: lorenaId,
        createdAt: 10,
      });
      await ctx.db.insert("qrCodes", {
        token: "LEGADO01",
        status: "active",
        batchId: "batch-legado",
        createdAt: 20,
      });
      await ctx.db.insert("qrCodes", {
        token: "SEMDEST1",
        status: "active",
        batchId: "batch-sem-destino",
        createdAt: 30,
      });
      await ctx.db.insert("qrCodes", {
        token: "OUTRADST",
        status: "active",
        batchId: "batch-outra",
        createdAt: 40,
      });
      await ctx.db.insert("qrCodes", {
        token: "USADO001",
        status: "active",
        batchId: "batch-legado",
        equipmentId,
        createdAt: 50,
      });
      await ctx.db.insert("qrCodes", {
        token: "INATIVO2",
        status: "inactive",
        batchId: "batch-legado",
        createdAt: 60,
      });
      await ctx.db.insert("qrCodes", {
        token: "SEMLOTE1",
        status: "active",
        createdAt: 70,
      });
    });

    const all = await asTech.query(
      api.technicianPortal.listBrowsableQrsByProject,
      { projectId: lorenaId, paginationOpts: { cursor: null, numItems: 20 } }
    );
    expect(all.page.map((qr) => [qr.token, qr.unassigned])).toEqual([
      ["LORENA01", false],
      ["SEMDEST1", true],
      ["LEGADO01", true],
    ]);

    const free = await asTech.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId: lorenaId,
        filter: "free",
        search: "legado",
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(free.page.map((qr) => qr.token)).toEqual(["LEGADO01"]);

    const registered = await asTech.query(
      api.technicianPortal.listBrowsableQrsByProject,
      {
        projectId: lorenaId,
        filter: "registered",
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(registered.page).toHaveLength(0);

    const projects = await asTech.query(
      api.technicianPortal.listBrowsableProjects,
      {}
    );
    const lorena = projects.find((project) => project._id === lorenaId);
    expect(lorena).toMatchObject({
      qrCount: 1,
      registeredCount: 0,
      unassignedCount: 2,
    });
  });

  test("técnico atribuído lista todos os QRs da obra", async () => {
    const t = setup();
    const asTech = await withUser(t, {
      clerkId: "tech-portal-3",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-portal-3");

    const projectId = await seedProject(t, "Obra Aberta", [techId]);
    const equipmentId = await t.run(async (ctx) =>
      ctx.db.insert("equipment", {
        description: "Evaporadora 1",
        status: "installing",
        createdAt: Date.now(),
        createdByUserId: techId,
      })
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "ABERTO1",
        equipmentId,
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("qrCodes", {
        token: "ABERTO2",
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
    });

    const qrs = await asTech.query(api.technicianPortal.listQrsByProject, {
      projectId,
    });
    expect(qrs).toHaveLength(2);
    expect(qrs.map((q) => q.token).sort()).toEqual(["ABERTO1", "ABERTO2"]);
    const registered = qrs.find((q) => q.token === "ABERTO1");
    expect(registered?.description).toBe("Evaporadora 1");
  });

  test("staff bypassa atribuição e lista QRs", async () => {
    const t = setup();
    const asStaff = await withUser(t, {
      clerkId: "eng-portal-1",
      role: "engenheiro",
      department: "engenharia",
    });

    const projectId = await seedProject(t, "Obra Staff");
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "STAFFQR1",
        status: "active",
        projectId,
        createdAt: Date.now(),
      });
    });

    const projects = await asStaff.query(
      api.technicianPortal.listMyProjects,
      {}
    );
    expect(projects.some((p) => p._id === projectId)).toBe(true);

    const qrs = await asStaff.query(api.technicianPortal.listQrsByProject, {
      projectId,
    });
    expect(qrs).toHaveLength(1);
    expect(qrs[0].token).toBe("STAFFQR1");
  });

  test("setTechnicians atribui e remove técnicos", async () => {
    const t = setup();
    const asEng = await withUser(t, {
      clerkId: "eng-set-tech",
      role: "engenheiro",
      department: "engenharia",
    });
    const asTech = await withUser(t, {
      clerkId: "tech-set-1",
      role: "qr_operator",
    });
    const techId = await userIdByClerk(t, "tech-set-1");

    const projectId = await seedProject(t, "Obra Set");

    await asEng.mutation(api.projects.setTechnicians, {
      projectId,
      technicianIds: [techId],
    });

    let projects = await asTech.query(api.technicianPortal.listMyProjects, {});
    expect(projects).toHaveLength(1);

    const assigned = await asEng.query(api.projects.getAssignedTechnicians, {
      projectId,
    });
    expect(assigned).toHaveLength(1);
    expect(assigned[0]._id).toBe(techId);

    await asEng.mutation(api.projects.setTechnicians, {
      projectId,
      technicianIds: [],
    });

    projects = await asTech.query(api.technicianPortal.listMyProjects, {});
    expect(projects).toHaveLength(0);
  });

  test("exige autenticação", async () => {
    const t = setup();
    await expect(
      t.query(api.technicianPortal.listMyProjects, {})
    ).rejects.toThrow("Not authenticated");
    await expect(
      t.query(api.technicianPortal.listBrowsableProjects, {})
    ).rejects.toThrow("Not authenticated");
  });
});
