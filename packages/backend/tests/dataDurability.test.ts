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

describe("customers", () => {
  test("impede nomes duplicados normalizados", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    await asDirector.mutation(api.customers.create, { name: "Construtora ABC" });
    await expect(
      asDirector.mutation(api.customers.create, { name: "  construtora   abc " })
    ).rejects.toThrow("Já existe um cliente com este nome");
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
});

describe("projects archive", () => {
  test("archive preserva contratos, medições e eventos de preço", async () => {
    const t = setup();
    const asDirector = await seedDirector(t);

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Teste",
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

    const projectId = await asDirector.mutation(api.projects.create, {
      name: "Obra Legado",
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
