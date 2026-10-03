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
  technicianIds?: Id<"users">[],
  extra?: { slug?: string; archivedAt?: number }
): Promise<Id<"projects">> {
  return t.run(async (ctx) =>
    ctx.db.insert("projects", {
      name,
      slug: extra?.slug,
      floors: [],
      createdAt: Date.now(),
      technicianIds,
      archivedAt: extra?.archivedAt,
    })
  );
}

// convex-test não grava contentType ao armazenar; simula o metadado que o
// backend real registra a partir do header Content-Type do upload.
async function storeWithType(
  t: TestConvex,
  blob: Blob,
  contentType: string | undefined
): Promise<Id<"_storage">> {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob);
    if (contentType !== undefined) {
      await ctx.db.patch(
        "_storage" as never,
        storageId as never,
        { contentType } as never
      );
    }
    return storageId;
  });
}

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%fake pdf for tests\n");

async function storePdf(t: TestConvex, bytes?: number): Promise<Id<"_storage">> {
  const content = bytes === undefined ? PDF_BYTES : new Uint8Array(bytes);
  return storeWithType(
    t,
    new Blob([content], { type: "application/pdf" }),
    "application/pdf"
  );
}

async function storeImage(t: TestConvex): Promise<Id<"_storage">> {
  return storeWithType(
    t,
    new Blob([new Uint8Array(16)], { type: "image/png" }),
    "image/png"
  );
}

/** Upload sem header Content-Type (metadado ausente no storage). */
async function storeUntyped(t: TestConvex): Promise<Id<"_storage">> {
  return storeWithType(t, new Blob([PDF_BYTES]), undefined);
}

async function setupEngineerAndTechs(t: TestConvex) {
  const asEng = await withUser(t, {
    clerkId: "doc-eng",
    role: "engenheiro",
    department: "engenharia",
  });
  const asTechA = await withUser(t, { clerkId: "doc-tech-a", role: "qr_operator" });
  const asTechB = await withUser(t, { clerkId: "doc-tech-b", role: "qr_operator" });
  const asOutsider = await withUser(t, {
    clerkId: "doc-tech-c",
    role: "qr_operator",
  });
  const techA = await userIdByClerk(t, "doc-tech-a");
  const techB = await userIdByClerk(t, "doc-tech-b");
  const outsider = await userIdByClerk(t, "doc-tech-c");
  return { asEng, asTechA, asTechB, asOutsider, techA, techB, outsider };
}

describe("projectDocuments", () => {
  test("engenharia envia PDF e técnicos veem conforme o acesso de cada documento", async () => {
    const t = setup();
    const { asEng, asTechA, asTechB, asOutsider, techA, techB } =
      await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Docs", [techA, techB], {
      slug: "obra-docs",
    });

    const allDoc = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "  Planta  baixa.pdf ",
      technicianAccess: "all",
    });
    const selectedDoc = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Memorial descritivo",
      description: "Rev. 3",
      technicianAccess: "selected",
      allowedTechnicianIds: [techA],
    });
    await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Contrato interno",
      technicianAccess: "none",
    });

    const office = await asEng.query(api.projectDocuments.listByProject, {
      projectId,
    });
    expect(office).toHaveLength(3);
    const plantaOffice = office.find((d) => d._id === allDoc);
    expect(plantaOffice?.name).toBe("Planta baixa.pdf");
    expect(plantaOffice?.fileName).toBe("Planta baixa.pdf");
    // Nunca expõe URL direta do storage: download só pelo endpoint autenticado.
    expect(plantaOffice).not.toHaveProperty("url");
    expect(plantaOffice?.uploadedBy?.name).toBe("Usuário Teste");
    const memorialOffice = office.find((d) => d._id === selectedDoc);
    expect(memorialOffice?.technicianAccess).toBe("selected");
    expect(memorialOffice?.allowedTechnicians.map((u) => u._id)).toEqual([
      techA,
    ]);

    const forA = await asTechA.query(api.projectDocuments.listForTechnician, {
      projectId,
    });
    expect(forA.map((d) => d.name).sort()).toEqual([
      "Memorial descritivo",
      "Planta baixa.pdf",
    ]);
    expect(forA.find((d) => d._id === selectedDoc)?.description).toBe("Rev. 3");

    const forB = await asTechB.query(api.projectDocuments.listForTechnician, {
      projectId,
    });
    expect(forB.map((d) => d._id)).toEqual([allDoc]);

    await expect(
      asOutsider.query(api.projectDocuments.listForTechnician, { projectId })
    ).rejects.toThrow("Acesso negado a esta obra");

    // getForTechnician segue a mesma regra por documento.
    const single = await asTechA.query(api.projectDocuments.getForTechnician, {
      documentId: selectedDoc,
    });
    expect(single?._id).toBe(selectedDoc);
    await expect(
      asTechB.query(api.projectDocuments.getForTechnician, {
        documentId: selectedDoc,
      })
    ).rejects.toThrow("Acesso negado a este documento");

    // O hub do técnico reflete a contagem visível.
    const summaryA = await asTechA.query(api.technicianPortal.getMyProject, {
      identifier: "obra-docs",
    });
    expect(summaryA?.documentCount).toBe(2);
    const listB = await asTechB.query(api.technicianPortal.listMyProjects, {});
    expect(listB[0]?.documentCount).toBe(1);
  });

  test("rejeita arquivos que não são PDF e tamanho acima do limite", async () => {
    const t = setup();
    const { asEng } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Validação");

    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storeImage(t),
        name: "Foto",
        technicianAccess: "all",
      })
    ).rejects.toThrow("Apenas arquivos PDF são aceitos");

    // Upload sem Content-Type também é recusado (não assume PDF).
    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storeUntyped(t),
        name: "Sem tipo",
        technicianAccess: "all",
      })
    ).rejects.toThrow("Apenas arquivos PDF são aceitos");

    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storePdf(t, 50 * 1024 * 1024 + 1),
        name: "Gigante",
        technicianAccess: "all",
      })
    ).rejects.toThrow("no máximo 50 MB");

    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storePdf(t),
        name: "   ",
        technicianAccess: "all",
      })
    ).rejects.toThrow("Informe um nome");
  });

  test("discardUpload apaga só arquivos ainda não vinculados a um documento", async () => {
    const t = setup();
    const { asEng, asTechA } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Órfãos");

    // Cenário real: upload concluído, cadastro falhou → cliente descarta.
    const orphan = await storePdf(t);
    await asEng.mutation(api.projectDocuments.discardUpload, {
      storageId: orphan,
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(orphan))).toBeNull();

    const linked = await storePdf(t);
    await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: linked,
      name: "Vinculado",
      technicianAccess: "all",
    });
    await expect(
      asEng.mutation(api.projectDocuments.discardUpload, { storageId: linked })
    ).rejects.toThrow("pertence a um documento");
    expect(await t.run((ctx) => ctx.storage.getUrl(linked))).not.toBeNull();

    await expect(
      asTechA.mutation(api.projectDocuments.discardUpload, { storageId: linked })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("download HTTP reavalia o acesso a cada pedido", async () => {
    const t = setup();
    const { asEng, asTechA, asTechB, asOutsider, techA, techB } =
      await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Download", [techA, techB]);
    const documentId = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Planta / térreo",
      technicianAccess: "selected",
      allowedTechnicianIds: [techA],
    });
    const path = `/project-documents/${documentId}`;

    const ok = await asTechA.fetch(path);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("application/pdf");
    expect(ok.headers.get("Content-Disposition")).toContain(
      'inline; filename="Planta - t_rreo.pdf"'
    );
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await ok.text()).toContain("%PDF-1.4");

    const attachment = await asTechA.fetch(`${path}?download=1`);
    expect(attachment.headers.get("Content-Disposition")).toContain("attachment;");

    expect((await asTechB.fetch(path)).status).toBe(403);
    expect((await asOutsider.fetch(path)).status).toBe(403);
    expect((await t.fetch(path)).status).toBe(401);
    expect((await asEng.fetch(path)).status).toBe(200);

    // Revogar o acesso revoga o download — mesmo com o mesmo link.
    await asEng.mutation(api.projectDocuments.update, {
      documentId,
      technicianAccess: "none",
    });
    expect((await asTechA.fetch(path)).status).toBe(403);

    await asEng.mutation(api.projectDocuments.remove, { documentId });
    expect((await asEng.fetch(path)).status).toBe(404);
    expect((await asEng.fetch("/project-documents/nao-existe")).status).toBe(404);

    const preflight = await t.fetch(path, {
      method: "OPTIONS",
      headers: { Origin: "https://app.rlpeng.com.br" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization"
    );
  });

  test("acesso 'selected' exige técnico atribuído à obra", async () => {
    const t = setup();
    const { asEng, techA, outsider } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Seleção", [techA]);

    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storePdf(t),
        name: "Doc",
        technicianAccess: "selected",
        allowedTechnicianIds: [outsider],
      })
    ).rejects.toThrow("Selecione ao menos um técnico");

    // Técnicos fora da obra são descartados silenciosamente quando há válidos.
    const documentId = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Doc",
      technicianAccess: "selected",
      allowedTechnicianIds: [techA, outsider, techA],
    });
    const [doc] = await asEng.query(api.projectDocuments.listByProject, {
      projectId,
    });
    expect(doc._id).toBe(documentId);
    expect(doc.allowedTechnicians.map((u) => u._id)).toEqual([techA]);
  });

  test("update troca acesso e remove apaga registro e arquivo", async () => {
    const t = setup();
    const { asEng, asTechB, techA, techB } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Update", [techA, techB]);
    const storageId = await storePdf(t);
    const documentId = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId,
      name: "Projeto elétrico",
      technicianAccess: "none",
    });

    expect(
      await asTechB.query(api.projectDocuments.listForTechnician, { projectId })
    ).toHaveLength(0);

    await asEng.mutation(api.projectDocuments.update, {
      documentId,
      technicianAccess: "selected",
      allowedTechnicianIds: [techB],
      description: "Versão para campo",
    });
    const forB = await asTechB.query(api.projectDocuments.listForTechnician, {
      projectId,
    });
    expect(forB).toHaveLength(1);
    expect(forB[0].description).toBe("Versão para campo");

    await asEng.mutation(api.projectDocuments.update, {
      documentId,
      technicianAccess: "all",
      name: "Projeto elétrico rev. 2",
    });
    const [office] = await asEng.query(api.projectDocuments.listByProject, {
      projectId,
    });
    expect(office.name).toBe("Projeto elétrico rev. 2");
    expect(office.allowedTechnicians).toEqual([]);

    await asEng.mutation(api.projectDocuments.remove, { documentId });
    expect(
      await asEng.query(api.projectDocuments.listByProject, { projectId })
    ).toHaveLength(0);
    const storedUrl = await t.run(async (ctx) => ctx.storage.getUrl(storageId));
    expect(storedUrl).toBeNull();
  });

  test("técnico não pode enviar nem gerenciar documentos", async () => {
    const t = setup();
    const { asEng, asTechA, techA } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Permissão", [techA]);
    const documentId = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Doc",
      technicianAccess: "all",
    });

    await expect(
      asTechA.mutation(api.projectDocuments.generateUploadUrl, {})
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      asTechA.mutation(api.projectDocuments.remove, { documentId })
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      asTechA.query(api.projectDocuments.listByProject, { projectId })
    ).rejects.toThrow("Insufficient permissions");
  });

  test("obra arquivada bloqueia envio e some do hub do técnico", async () => {
    const t = setup();
    const { asEng, asTechA, techA } = await setupEngineerAndTechs(t);
    const projectId = await seedProject(t, "Obra Arquivada", [techA], {
      slug: "obra-arquivada",
    });
    const documentId = await asEng.mutation(api.projectDocuments.create, {
      projectId,
      storageId: await storePdf(t),
      name: "Doc antigo",
      technicianAccess: "all",
    });
    expect(
      await asTechA.query(api.projectDocuments.listForTechnician, { projectId })
    ).toHaveLength(1);

    await t.run(async (ctx) => {
      await ctx.db.patch("projects", projectId, { archivedAt: Date.now() });
    });

    // Documentos de obra arquivada deixam de existir para o técnico (lista,
    // detalhe e download), mas o escritório segue vendo.
    expect(
      await asTechA.query(api.projectDocuments.listForTechnician, { projectId })
    ).toHaveLength(0);
    await expect(
      asTechA.query(api.projectDocuments.getForTechnician, { documentId })
    ).rejects.toThrow("Acesso negado a este documento");
    expect(
      (await asTechA.fetch(`/project-documents/${documentId}`)).status
    ).toBe(403);
    expect(
      await asEng.query(api.projectDocuments.listByProject, { projectId })
    ).toHaveLength(1);
    expect(
      (await asEng.fetch(`/project-documents/${documentId}`)).status
    ).toBe(200);

    await expect(
      asEng.mutation(api.projectDocuments.create, {
        projectId,
        storageId: await storePdf(t),
        name: "Doc",
        technicianAccess: "all",
      })
    ).rejects.toThrow("Obra arquivada");

    expect(
      await asTechA.query(api.technicianPortal.getMyProject, {
        identifier: "obra-arquivada",
      })
    ).toBeNull();
    expect(
      await asTechA.query(api.technicianPortal.listMyProjects, {})
    ).toHaveLength(0);
  });
});
