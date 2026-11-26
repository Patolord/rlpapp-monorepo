import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

type TestConvex = ReturnType<typeof setup>;

async function userIdByClerk(t: TestConvex, clerkId: string): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();
    if (!user) throw new Error("user not found");
    return user._id;
  });
}

/** Obra com um engenheiro, um líder e um ajudante atribuídos e um técnico de fora. */
async function seed(t: TestConvex) {
  const asEng = await withUser(t, { clerkId: "svc-eng", roles: ["engenharia"], name: "Eng" });
  const asLead = await withUser(t, {
    clerkId: "svc-lead",
    roles: ["qr_operator"],
    permissionGrants: ["campo.todas_obras"],
    name: "Líder",
  });
  const asHelper = await withUser(t, {
    clerkId: "svc-helper",
    roles: ["qr_operator"],
    name: "Ajudante",
  });
  const asOutsider = await withUser(t, {
    clerkId: "svc-out",
    roles: ["qr_operator"],
    name: "De fora",
  });
  const lead = await userIdByClerk(t, "svc-lead");
  const helper = await userIdByClerk(t, "svc-helper");
  const outsider = await userIdByClerk(t, "svc-out");
  const projectId = await t.run((ctx) =>
    ctx.db.insert("projects", {
      name: "Obra 1801 - Cliente - Torre B",
      floors: [],
      createdAt: Date.now(),
      technicianIds: [lead, helper],
    })
  );
  return { asEng, asLead, asHelper, asOutsider, lead, helper, outsider, projectId };
}

/** Publica duas linhas de orçamento na aba "Exaustão", no local "Apto 302". */
async function seedBudget(t: TestConvex, projectId: Id<"projects">) {
  await t.run(async (ctx) => {
    const takeoffId = await ctx.db.insert("takeoffs", {
      projectId,
      name: "Orçamento",
      createdAt: Date.now(),
      source: "desktop",
    });
    const line = { takeoffId, projectId, createdAt: Date.now(), sheet: "Exaustão" };
    await ctx.db.insert("takeoffItems", {
      ...line,
      rawDescription: "Duto flexível Ø100 mm",
      quantity: 6,
      unit: "m",
      section: "Apto 302",
      sortOrder: 1,
      estimatedUnitPriceCents: 1234,
    });
    await ctx.db.insert("takeoffItems", {
      ...line,
      rawDescription: "Exaustor para banheiro Ø100 mm",
      quantity: 2,
      unit: "un",
      section: "Apto 302",
      sortOrder: 2,
    });
    await ctx.db.insert("takeoffItems", {
      ...line,
      rawDescription: "Linha removida do orçamento",
      quantity: 1,
      unit: "un",
      section: "Apto 302",
      externalRemovedAt: Date.now(),
    });
  });
}

describe("serviços de campo: disciplinas", () => {
  test("a engenharia cria a disciplina a partir das sugestões da obra", async () => {
    const t = setup();
    const { asEng, projectId } = await seed(t);
    await seedBudget(t, projectId);

    const before = await asEng.query(api.fieldServices.disciplineSuggestions, { projectId });
    expect(before.budgetSheets).toEqual(["Exaustão"]);
    expect(before.common).toContain("Infra AC");

    await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "  Exaustão ",
      budgetSheet: "Exaustão",
      fieldTeam: true,
    });
    const after = await asEng.query(api.fieldServices.disciplineSuggestions, { projectId });
    expect(after.budgetSheets).toEqual([]);

    await expect(
      asEng.mutation(api.fieldServices.createProjectDiscipline, {
        projectId,
        name: "exaustão",
        fieldTeam: true,
      })
    ).rejects.toThrow(/já tem a disciplina/);
  });

  test("técnico não define disciplinas e quem não está na obra não as vê", async () => {
    const t = setup();
    const { asEng, asHelper, asOutsider, projectId } = await seed(t);
    await expect(
      asHelper.mutation(api.fieldServices.createProjectDiscipline, {
        projectId,
        name: "Infra AC",
        fieldTeam: true,
      })
    ).rejects.toThrow();

    await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Infra AC",
      fieldTeam: true,
    });
    expect(await asHelper.query(api.fieldServices.listDisciplines, { projectId })).toHaveLength(1);
    await expect(
      asOutsider.query(api.fieldServices.listDisciplines, { projectId })
    ).rejects.toThrow(/Acesso negado/);
  });

  test("disciplina arquivada sai do app e some das listas", async () => {
    const t = setup();
    const { asEng, asHelper, projectId } = await seed(t);
    const disciplineId = await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Pressurização",
      fieldTeam: false,
    });
    await asEng.mutation(api.fieldServices.archiveProjectDiscipline, { disciplineId });
    expect(await asHelper.query(api.fieldServices.listDisciplines, { projectId })).toEqual([]);
    expect(await asHelper.query(api.fieldServices.getDiscipline, { disciplineId })).toBeNull();
  });
});

describe("serviços de campo: etapas", () => {
  test("o serviço continua depois e reabre na etapa seguinte", async () => {
    const t = setup();
    const { asEng, asHelper, asLead, lead, helper, projectId } = await seed(t);
    await seedBudget(t, projectId);
    const disciplineId = await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Exaustão",
      budgetSheet: "Exaustão",
      fieldTeam: true,
    });

    // Antes de qualquer etapa, o local do orçamento já aparece como "a fazer".
    const planned = await asHelper.query(api.fieldServices.getDiscipline, { disciplineId });
    expect(planned?.services).toEqual([
      expect.objectContaining({ location: "Apto 302", status: "todo", materialCount: 2 }),
    ]);

    await asHelper.mutation(api.fieldServices.registerServiceStage, {
      disciplineId,
      location: "apto  302",
      description: "Duto flexível passado",
      outcome: "continues",
      pendingNote: "Gesseiro fechar o forro",
      participantIds: [helper, lead],
      photoIds: [],
    });

    const waiting = await asHelper.query(api.fieldServices.getService, {
      disciplineId,
      locationKey: "apto 302",
    });
    expect(waiting).toMatchObject({
      location: "Apto 302",
      status: "waiting",
      pendingNote: "Gesseiro fechar o forro",
    });
    expect(waiting?.stages[0].participants.map((p) => p.name).sort()).toEqual([
      "Ajudante",
      "Líder",
    ]);
    // O técnico vê quantidade e unidade, nunca preço.
    expect(waiting?.materials).toEqual([
      { description: "Duto flexível Ø100 mm", quantity: 6, unit: "m" },
      { description: "Exaustor para banheiro Ø100 mm", quantity: 2, unit: "un" },
    ]);

    await asLead.mutation(api.fieldServices.registerServiceStage, {
      disciplineId,
      location: "Apto 302",
      description: "Ventokit instalado",
      outcome: "concluded",
      pendingNote: "ignorado quando conclui",
      participantIds: [],
      photoIds: [],
    });
    const done = await asHelper.query(api.fieldServices.getService, {
      disciplineId,
      locationKey: "apto 302",
    });
    expect(done).toMatchObject({ status: "concluded", pendingNote: null });
    expect(done?.stages.map((stage) => stage.description)).toEqual([
      "Ventokit instalado",
      "Duto flexível passado",
    ]);
    expect(done?.stages[0].pendingNote).toBeNull();

    const [summary] = await asEng.query(api.fieldServices.listOfficeDisciplinesByProject, {
      projectId,
    });
    expect(summary).toMatchObject({ stageCount: 2, openCount: 0, concludedCount: 1 });

    // "O que eu fiz": o ajudante participou só da primeira etapa.
    const mine = await asHelper.query(api.fieldServices.listMine, { projectId });
    expect(mine.map((stage) => stage.description)).toEqual(["Duto flexível passado"]);
  });

  test("não registra em disciplina de outra equipe nem marca quem não está na obra", async () => {
    const t = setup();
    const { asEng, asHelper, asOutsider, helper, outsider, projectId } = await seed(t);
    const thirdParty = await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Pressurização",
      fieldTeam: false,
    });
    const own = await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Infra AC",
      fieldTeam: true,
    });
    const stage = {
      description: "Infra passada",
      outcome: "continues" as const,
      participantIds: [helper],
      photoIds: [],
    };

    await expect(
      asHelper.mutation(api.fieldServices.registerServiceStage, {
        ...stage,
        disciplineId: thirdParty,
      })
    ).rejects.toThrow(/outra equipe/);
    await expect(
      asHelper.mutation(api.fieldServices.registerServiceStage, {
        ...stage,
        disciplineId: own,
        participantIds: [helper, outsider],
      })
    ).rejects.toThrow(/equipe da obra/);
    await expect(
      asOutsider.mutation(api.fieldServices.registerServiceStage, {
        ...stage,
        disciplineId: own,
        participantIds: [outsider],
      })
    ).rejects.toThrow(/Acesso negado/);
    await expect(
      asHelper.mutation(api.fieldServices.registerServiceStage, {
        ...stage,
        disciplineId: own,
        description: "   ",
      })
    ).rejects.toThrow(/Descreva/);
  });

  test("conferência da engenharia trava a exclusão pelo técnico", async () => {
    const t = setup();
    const { asEng, asHelper, asLead, helper, projectId } = await seed(t);
    const disciplineId = await asEng.mutation(api.fieldServices.createProjectDiscipline, {
      projectId,
      name: "Infra AC",
      fieldTeam: true,
    });
    const stageId = await asHelper.mutation(api.fieldServices.registerServiceStage, {
      disciplineId,
      description: "Infra passada",
      outcome: "continues",
      participantIds: [helper],
      photoIds: [],
    });

    await expect(
      asLead.mutation(api.fieldServices.removeStage, { stageId })
    ).rejects.toThrow(/quem registrou/);
    await expect(
      asHelper.mutation(api.fieldServices.reviewStage, { stageId, reviewed: true })
    ).rejects.toThrow();

    await asEng.mutation(api.fieldServices.reviewStage, { stageId, reviewed: true });
    const [row] = await asEng.query(api.fieldServices.listOfficeStagesByProject, { projectId });
    expect(row).toMatchObject({ createdByName: "Ajudante", location: null });
    expect(row.reviewedAt).not.toBeNull();
    await expect(
      asHelper.mutation(api.fieldServices.removeStage, { stageId })
    ).rejects.toThrow(/já conferiu/);

    await asEng.mutation(api.fieldServices.reviewStage, { stageId, reviewed: false });
    await asHelper.mutation(api.fieldServices.removeStage, { stageId });
    expect(
      await asEng.query(api.fieldServices.listOfficeStagesByProject, { projectId })
    ).toEqual([]);
  });
});

describe("serviços de campo: equipe", () => {
  test("lista a equipe da obra com o líder primeiro", async () => {
    const t = setup();
    const { asHelper, asOutsider, projectId } = await seed(t);
    const team = await asHelper.query(api.fieldServices.listTeam, { projectId });
    expect(team.members.map((m) => [m.name, m.leader, m.isMe])).toEqual([
      ["Líder", true, false],
      ["Ajudante", false, true],
    ]);
    expect(team.responsibleName).toBeNull();
    await expect(asOutsider.query(api.fieldServices.listTeam, { projectId })).rejects.toThrow(
      /Acesso negado/
    );
  });
});
