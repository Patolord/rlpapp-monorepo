import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

async function seedDirector(t: ReturnType<typeof setup>) {
  return withUser(t, {
    clerkId: "director-1",
    role: "director",
    department: "engenharia",
  });
}

async function seedPortalUser(t: ReturnType<typeof setup>, clerkId: string) {
  return withUser(t, {
    clerkId,
    role: "client",
    email: `${clerkId}@example.com`,
  });
}

async function seedCustomer(
  asDirector: Awaited<ReturnType<typeof seedDirector>>,
  name: string
) {
  return await asDirector.mutation(api.customers.create, { name });
}

describe("customers", () => {
  test("impede nomes duplicados normalizados", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    await asDirector.mutation(api.customers.create, { name: "Construtora ABC" });
    await expect(
      asDirector.mutation(api.customers.create, { name: "  construtora   abc " })
    ).rejects.toThrow("Já existe um cliente com este nome");
  });

  test("importa clientes em lote e ignora nomes e documentos duplicados", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    await asDirector.mutation(api.customers.create, {
      name: "Cliente Existente",
      taxId: "11.111.111/0001-11",
    });

    const result = await asDirector.mutation(api.customers.bulkCreate, {
      items: [
        { name: " cliente   existente ", taxId: "99999999000199" },
        {
          name: "Cliente Novo",
          taxId: "22.222.222/0001-22",
          email: " financeiro@novo.com ",
          contact: {
            name: " Maria ",
            email: " maria@novo.com ",
            role: " Financeiro ",
          },
        },
        { name: "Outro Nome", taxId: "22222222000122" },
        { name: "   " },
        { name: "Segundo Cliente", taxId: "33333333000133" },
      ],
    });

    expect(result).toEqual({
      created: 2,
      skipped: 2,
      errors: [{ row: 4, message: "Nome obrigatório" }],
    });

    const customers = await asDirector.query(api.customers.list, {
      includeArchived: true,
    });
    expect(customers).toHaveLength(3);
    const imported = customers.find((customer) => customer.name === "Cliente Novo");
    expect(imported?.taxId).toBe("22222222000122");
    expect(imported?.email).toBe("financeiro@novo.com");

    if (!imported) throw new Error("Cliente importado não encontrado");
    const details = await asDirector.query(api.customers.get, {
      customerId: imported._id,
    });
    expect(details?.contacts).toEqual([
      expect.objectContaining({
        name: "Maria",
        email: "maria@novo.com",
        role: "Financeiro",
      }),
    ]);
  });

  test("limita a importação de clientes a 200 itens por lote", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    await expect(
      asDirector.mutation(api.customers.bulkCreate, {
        items: Array.from({ length: 201 }, (_, index) => ({
          name: `Cliente ${index}`,
        })),
      })
    ).rejects.toThrow("Máximo de 200 clientes por importação");
  });

  test("archive e restore preservam o registro", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    const customerId = await asDirector.mutation(api.customers.create, {
      name: "Cliente Durável",
    });
    await asDirector.mutation(api.customers.archive, { customerId });

    const archived = await asDirector.query(api.customers.get, { customerId });
    expect(archived?.customer.archivedAt).not.toBeNull();

    await asDirector.mutation(api.customers.restore, { customerId });
    const restored = await asDirector.query(api.customers.get, { customerId });
    expect(restored?.customer.archivedAt).toBeNull();
    expect(restored?.customer.active).toBe(true);
  });

  test("valida CPF e CNPJ quando o tipo de pessoa é informado", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    await expect(
      asDirector.mutation(api.customers.create, {
        name: "Pessoa Inválida",
        personType: "pf",
        taxId: "123",
      })
    ).rejects.toThrow("CPF deve conter 11 dígitos");

    const customerId = await asDirector.mutation(api.customers.create, {
      name: "Pessoa Válida",
      personType: "pf",
      taxId: "529.982.247-25",
    });
    const details = await asDirector.query(api.customers.get, { customerId });
    expect(details?.customer.personType).toBe("pf");
    expect(details?.customer.taxId).toBe("52998224725");

    await expect(
      asDirector.mutation(api.customers.create, {
        name: "Empresa Inválida",
        personType: "pj",
        taxId: "11.111.111/1111-11",
      })
    ).rejects.toThrow("CNPJ inválido");

    const companyId = await asDirector.mutation(api.customers.create, {
      name: "Empresa Válida",
      personType: "pj",
      taxId: "04.252.011/0001-10",
    });
    const company = await asDirector.query(api.customers.get, {
      customerId: companyId,
    });
    expect(company?.customer.personType).toBe("pj");
    expect(company?.customer.taxId).toBe("04252011000110");
  });

  test("mantém contatos arquivados no histórico e permite restaurar", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente com Contatos");
    const contactId = await asDirector.mutation(api.customers.addContact, {
      customerId,
      name: "Maria",
      email: "maria@example.com",
      role: "Engenharia",
    });

    await asDirector.mutation(api.customers.updateContact, {
      contactId,
      phone: "11999999999",
    });
    await asDirector.mutation(api.customers.removeContact, { contactId });

    const activeOnly = await asDirector.query(api.customers.get, { customerId });
    expect(activeOnly?.contacts).toHaveLength(0);

    const history = await asDirector.query(api.customers.get, {
      customerId,
      includeInactiveContacts: true,
    });
    expect(history?.contacts).toEqual([
      expect.objectContaining({
        _id: contactId,
        active: false,
        email: "maria@example.com",
        phone: "11999999999",
        role: "Engenharia",
      }),
    ]);

    await asDirector.mutation(api.customers.restoreContact, { contactId });
    const restored = await asDirector.query(api.customers.get, { customerId });
    expect(restored?.contacts[0]?.active).toBe(true);
  });

  test("migra contatos legados em lotes idempotentes", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente Legado");
    const contactId = await t.run(async (ctx) => {
      return await ctx.db.insert("customerContacts", {
        customerId,
        name: "Contato Legado",
        createdAt: Date.now(),
      });
    });

    const dryRun = await asDirector.mutation(
      api.migrations.backfillCustomerContactsActive,
      { dryRun: true }
    );
    expect(dryRun.updated).toBe(1);
    await t.run(async (ctx) => {
      expect((await ctx.db.get("customerContacts", contactId))?.active).toBeUndefined();
    });

    const migrated = await asDirector.mutation(
      api.migrations.backfillCustomerContactsActive,
      {}
    );
    expect(migrated.updated).toBe(1);
    await t.run(async (ctx) => {
      expect((await ctx.db.get("customerContacts", contactId))?.active).toBe(true);
    });

    const repeated = await asDirector.mutation(
      api.migrations.backfillCustomerContactsActive,
      {}
    );
    expect(repeated.updated).toBe(0);
  });
});

describe("project customer and legacy number", () => {
  test("exige número inteiro positivo e impede duplicidade", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente Numeração");

    await expect(
      asDirector.mutation(api.projects.create, {
        name: "Obra Inválida",
        customerId,
        legacyNumber: 0,
      })
    ).rejects.toThrow("número inteiro positivo");
    await expect(
      asDirector.mutation(api.projects.create, {
        name: "Obra Fracionária",
        customerId,
        legacyNumber: 1821.5,
      })
    ).rejects.toThrow("número inteiro positivo");

    await asDirector.mutation(api.projects.create, {
      name: "Obra 1821",
      customerId,
      legacyNumber: 1821,
    });
    await expect(
      asDirector.mutation(api.projects.create, {
        name: "Outra Obra 1821",
        customerId,
        legacyNumber: 1821,
      })
    ).rejects.toThrow("Já existe uma obra com o número 1821");
  });

  test("permite preencher vínculo e número em obra legada", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente Backfill");
    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert("projects", {
        name: "Obra sem metadados",
        floors: [],
        createdAt: Date.now(),
      });
    });

    await asDirector.mutation(api.projects.update, {
      projectId,
      customerId,
      legacyNumber: 1800,
    });
    const listed = await asDirector.query(api.projects.list, {});
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: projectId,
          customerId,
          customerName: "Cliente Backfill",
          legacyNumber: 1800,
        }),
      ])
    );
  });
});

describe("projects archive", () => {
  test("archive preserva contratos, medições e eventos de preço", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente Obra Teste");

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Teste",
      customerId,
      legacyNumber: 1821,
      floors: [{ number: 1, label: "1º Andar" }],
    });

    const contractId = await asDirector.mutation(api.medicoes.createContract, {
      projectId,
      title: "Contrato principal",
      valueCents: 1_000_000,
    });

    await asDirector.mutation(api.medicoes.createMedicao, {
      contractId,
      basis: "valor_fixo",
      amountCents: 100_000,
      referenceDate: Date.now(),
    });

    const priceEventId = await t.run(async (ctx) => {
      return await ctx.db.insert("priceEvents", {
        unitPriceCents: 5000,
        source: "manual",
        occurredAt: Date.now(),
        needsReview: false,
        projectId,
        createdAt: Date.now(),
      });
    });

    await asDirector.mutation(api.projects.archive, { projectId });

    const listed = await asDirector.query(api.projects.list, {});
    expect(listed.some((p) => p._id === projectId)).toBe(false);

    const archivedList = await asDirector.query(api.projects.list, {
      includeArchived: true,
    });
    expect(
      archivedList.find((p) => p._id === projectId)?.status
    ).toBe("archived");

    await t.run(async (ctx) => {
      const contract = await ctx.db.get("contracts", contractId);
      const medicoes = await ctx.db
        .query("medicoes")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      const priceEvent = await ctx.db.get("priceEvents", priceEventId);
      expect(contract).not.toBeNull();
      expect(medicoes).toHaveLength(1);
      expect(priceEvent).not.toBeNull();
    });
  });

  test("remove é compatível com archive (não apaga filhos)", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const customerId = await seedCustomer(asDirector, "Cliente Obra Legado");

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Legado",
      customerId,
      legacyNumber: 1821,
    });

    await asDirector.mutation(api.projects.remove, { projectId });

    await t.run(async (ctx) => {
      const project = await ctx.db.get("projects", projectId);
      expect(project?.status).toBe("archived");
      expect(project?.archivedAt).toBeDefined();
    });
  });
});

describe("portal access", () => {
  test("portalUserIds concede acesso; legado clientIds também funciona", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const asPortal = await seedPortalUser(t, "portal-user-1");
    const customerId = await seedCustomer(asDirector, "Cliente Portal");

    const portalUserId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "portal-user-1"))
        .unique();
      if (!user) throw new Error("portal user missing");
      return user._id;
    });

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Portal",
      customerId,
      legacyNumber: 1821,
    });

    await asDirector.mutation(api.projects.setPortalUsers, {
      projectId,
      portalUserIds: [portalUserId],
    });

    const visible = await asPortal.query(api.portal.listMyProjects, {});
    expect(visible.some((p) => p._id === projectId)).toBe(true);

    await t.run(async (ctx) => {
      await ctx.db.patch("projects", projectId, {
        portalUserIds: undefined,
        clientIds: [portalUserId],
      });
    });

    const legacyVisible = await asPortal.query(api.portal.listMyProjects, {});
    expect(legacyVisible.some((p) => p._id === projectId)).toBe(true);
  });

  test("obras arquivadas ficam ocultas no portal", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);
    const asPortal = await seedPortalUser(t, "portal-user-2");
    const customerId = await seedCustomer(asDirector, "Cliente Portal Arquivo");

    const portalUserId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "portal-user-2"))
        .unique();
      if (!user) throw new Error("portal user missing");
      return user._id;
    });

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Arquivada Portal",
      customerId,
      legacyNumber: 1821,
    });
    await asDirector.mutation(api.projects.setPortalUsers, {
      projectId,
      portalUserIds: [portalUserId],
    });
    await asDirector.mutation(api.projects.archive, { projectId });

    const visible = await asPortal.query(api.portal.listMyProjects, {});
    expect(visible.some((p) => p._id === projectId)).toBe(false);
  });
});

describe("customer migration", () => {
  test("backfillCustomersFromProjects é idempotente", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    const projectId = await t.run(async (ctx) => {
      return await ctx.db.insert("projects", {
        name: "Obra Legado Cliente",
        client: "Empresa Legada Ltda",
        clientIds: [],
        floors: [{ number: 1, label: "1º Andar" }],
        createdAt: Date.now(),
      });
    });

    const first = await asDirector.mutation(
      api.migrations.backfillCustomersFromProjects,
      {}
    );
    expect(first.projectsLinked).toBeGreaterThanOrEqual(1);
    expect(first.customersCreated).toBeGreaterThanOrEqual(1);

    const second = await asDirector.mutation(
      api.migrations.backfillCustomersFromProjects,
      {}
    );
    expect(second.customersCreated).toBe(0);
    expect(second.projectsLinked).toBe(0);

    await t.run(async (ctx) => {
      const project = await ctx.db.get("projects", projectId);
      expect(project?.customerId).toBeDefined();
      const customer = project?.customerId
        ? await ctx.db.get("customers", project.customerId)
        : null;
      expect(customer?.name).toBe("Empresa Legada Ltda");
    });
  });
});

describe("audit logs", () => {
  test("update de cliente grava snapshot e changes", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    const customerId = await asDirector.mutation(api.customers.create, {
      name: "Auditável SA",
    });

    await asDirector.mutation(api.customers.update, {
      customerId,
      name: "Auditável Ltda",
    });

    const logs = await asDirector.query(api.auditLogs.listByRecord, {
      tableName: "customers",
      recordId: customerId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    const updateLog = logs.page.find((l) => l.action === "update");
    expect(updateLog).toBeDefined();
    expect(updateLog?.snapshotBefore).toContain("Auditável SA");
    expect(updateLog?.snapshotAfter).toContain("Auditável Ltda");
    expect(updateLog?.changes?.some((c) => c.field === "name")).toBe(true);
  });
});
