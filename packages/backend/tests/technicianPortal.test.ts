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
  });
});
