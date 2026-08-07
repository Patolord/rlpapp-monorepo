import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup } from "./helpers";

async function seedInventoryFixture() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const warehouseUserId = await ctx.db.insert("users", {
      name: "Operador Estoque",
      clerkId: "warehouse",
      role: "operator",
      department: "estoque",
      isActive: true,
      createdAt: now,
    });
    const purchasingUserId = await ctx.db.insert("users", {
      name: "Compras",
      clerkId: "purchasing",
      role: "operator",
      department: "compras",
      isActive: true,
      createdAt: now,
    });
    const engineerUserId = await ctx.db.insert("users", {
      name: "Engenheiro Responsável",
      clerkId: "engineer",
      role: "engenheiro",
      department: "engenharia",
      isActive: true,
      createdAt: now,
    });
    const otherEngineerUserId = await ctx.db.insert("users", {
      name: "Outro Engenheiro",
      clerkId: "other-engineer",
      role: "engenheiro",
      department: "engenharia",
      isActive: true,
      createdAt: now,
    });
    const adminUserId = await ctx.db.insert("users", {
      name: "Admin",
      clerkId: "admin",
      role: "admin",
      isActive: true,
      createdAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      name: "Obra Teste",
      responsibleId: engineerUserId,
      floors: [],
      createdAt: now,
    });
    const equipmentId = await ctx.db.insert("materials", {
      name: "Equipamento 220V",
      category: "equipamento",
      unit: "un",
      technicalAttributes: [{ key: "tensao", value: "220v" }],
      active: true,
      status: "active",
      createdAt: now,
    });
    const cableId = await ctx.db.insert("materials", {
      name: "Cabo 110V",
      category: "cabo",
      unit: "m",
      technicalAttributes: [{ key: "tensao", value: "110v" }],
      active: true,
      status: "active",
      createdAt: now,
    });
    return {
      warehouseUserId,
      purchasingUserId,
      engineerUserId,
      otherEngineerUserId,
      adminUserId,
      projectId,
      equipmentId,
      cableId,
    };
  });

  return {
    t,
    ids,
    warehouse: t.withIdentity({ subject: "warehouse" }),
    purchasing: t.withIdentity({ subject: "purchasing" }),
    engineer: t.withIdentity({ subject: "engineer" }),
    otherEngineer: t.withIdentity({ subject: "other-engineer" }),
    admin: t.withIdentity({ subject: "admin" }),
  };
}

async function createAndPostEntry(
  purchasing: ReturnType<ReturnType<typeof setup>["withIdentity"]>,
  lines: Array<{ materialId: Id<"materials">; quantity: number }>
) {
  const created = await purchasing.mutation(api.inventory.createDocument, {
    type: "entry",
    reference: "PED-001",
    lines,
  });
  expect(created.status).toBe("draft");
  await purchasing.mutation(api.inventory.postDocument, {
    documentId: created.documentId,
  });
  return created.documentId;
}

describe("estoque central e obras", () => {
  test("entrada e transferência atualizam saldos com eventos espelhados", async () => {
    const { t, ids, purchasing, warehouse } = await seedInventoryFixture();
    await createAndPostEntry(purchasing, [
      { materialId: ids.equipmentId, quantity: 10 },
    ]);

    const transfer = await warehouse.mutation(api.inventory.createDocument, {
      type: "transfer",
      projectId: ids.projectId,
      lines: [{ materialId: ids.equipmentId, quantity: 4 }],
    });
    await warehouse.mutation(api.inventory.postDocument, {
      documentId: transfer.documentId,
    });

    const state = await t.run(async (ctx) => {
      const central = await ctx.db
        .query("inventoryLocations")
        .withIndex("by_type", (q) => q.eq("type", "central"))
        .unique();
      const project = await ctx.db
        .query("inventoryLocations")
        .withIndex("by_project", (q) => q.eq("projectId", ids.projectId))
        .unique();
      if (!central || !project) throw new Error("Locais não criados");
      const centralBalance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q
            .eq("locationId", central._id)
            .eq("materialId", ids.equipmentId)
        )
        .unique();
      const projectBalance = await ctx.db
        .query("inventoryBalances")
        .withIndex("by_location_material", (q) =>
          q
            .eq("locationId", project._id)
            .eq("materialId", ids.equipmentId)
        )
        .unique();
      const events = await ctx.db
        .query("inventoryEvents")
        .withIndex("by_document", (q) =>
          q.eq("documentId", transfer.documentId)
        )
        .collect();
      return {
        centralQuantity: centralBalance?.quantity,
        projectQuantity: projectBalance?.quantity,
        deltas: events.map((event) => event.quantityDelta).sort(),
      };
    });

    expect(state.centralQuantity).toBe(6);
    expect(state.projectQuantity).toBe(4);
    expect(state.deltas).toEqual([-4, 4]);
  });

  test("saldo insuficiente bloqueia saída sem criar eventos", async () => {
    const { t, ids, warehouse } = await seedInventoryFixture();
    const transfer = await warehouse.mutation(api.inventory.createDocument, {
      type: "transfer",
      projectId: ids.projectId,
      lines: [{ materialId: ids.equipmentId, quantity: 1 }],
    });

    await expect(
      warehouse.mutation(api.inventory.postDocument, {
        documentId: transfer.documentId,
      })
    ).rejects.toThrow("Saldo insuficiente");

    const eventCount = await t.run(async (ctx) => {
      return (
        await ctx.db
          .query("inventoryEvents")
          .withIndex("by_document", (q) =>
            q.eq("documentId", transfer.documentId)
          )
          .collect()
      ).length;
    });
    expect(eventCount).toBe(0);
  });

  test("permissões separam o estoque central dos estoques de obra", async () => {
    const { ids, engineer, purchasing, warehouse } =
      await seedInventoryFixture();

    await expect(
      engineer.query(api.inventory.listBalances, {
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).rejects.toThrow("só pode consultar estoques de obras");

    await expect(
      engineer.query(api.inventory.listEventsPaginated, {
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).rejects.toThrow("só pode consultar estoques de obras");

    await expect(engineer.query(api.inventory.listEvents, {})).rejects.toThrow(
      "só pode consultar estoques de obras"
    );

    const projectBalances = await engineer.query(
      api.inventory.listBalances,
      {
        projectId: ids.projectId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(projectBalances.page).toEqual([]);

    const projectEvents = await engineer.query(
      api.inventory.listEventsPaginated,
      {
        projectId: ids.projectId,
        paginationOpts: { numItems: 20, cursor: null },
      }
    );
    expect(projectEvents.page).toEqual([]);

    await purchasing.mutation(
      api.inventoryStockPolicies.ensureCentralLocation,
      {}
    );
    const warehouseLocations = await warehouse.query(
      api.inventoryStockPolicies.listLocations,
      {}
    );
    expect(
      warehouseLocations.some((location) => location.type === "central")
    ).toBe(true);
    const engineerLocations = await engineer.query(
      api.inventoryStockPolicies.listLocations,
      {}
    );
    expect(
      engineerLocations.every((location) => location.type !== "central")
    ).toBe(true);

    await expect(
      purchasing.mutation(api.inventory.createDocument, {
        type: "transfer",
        projectId: ids.projectId,
        lines: [{ materialId: ids.equipmentId, quantity: 1 }],
      })
    ).rejects.toThrow("não pode registrar");
  });

  test("obra registra consumo e Estoque conclui retorno", async () => {
    const { ids, purchasing, warehouse, engineer, t } =
      await seedInventoryFixture();
    await createAndPostEntry(purchasing, [
      { materialId: ids.equipmentId, quantity: 12 },
    ]);
    const transfer = await warehouse.mutation(api.inventory.createDocument, {
      type: "transfer",
      projectId: ids.projectId,
      lines: [{ materialId: ids.equipmentId, quantity: 8 }],
    });
    await warehouse.mutation(api.inventory.postDocument, {
      documentId: transfer.documentId,
    });

    const consumption = await engineer.mutation(
      api.inventory.createDocument,
      {
        type: "consumption",
        projectId: ids.projectId,
        lines: [{ materialId: ids.equipmentId, quantity: 3 }],
      }
    );
    await engineer.mutation(api.inventory.postDocument, {
      documentId: consumption.documentId,
    });

    const returned = await engineer.mutation(api.inventory.createDocument, {
      type: "return",
      projectId: ids.projectId,
      lines: [{ materialId: ids.equipmentId, quantity: 2 }],
    });
    await expect(
      engineer.mutation(api.inventory.postDocument, {
        documentId: returned.documentId,
      })
    ).rejects.toThrow("não pode concluir");
    await warehouse.mutation(api.inventory.postDocument, {
      documentId: returned.documentId,
    });

    const quantities = await t.run(async (ctx) => {
      const central = await ctx.db
        .query("inventoryLocations")
        .withIndex("by_type", (q) => q.eq("type", "central"))
        .unique();
      const project = await ctx.db
        .query("inventoryLocations")
        .withIndex("by_project", (q) => q.eq("projectId", ids.projectId))
        .unique();
      if (!central || !project) throw new Error("Locais não criados");
      const balances = await ctx.db.query("inventoryBalances").collect();
      return {
        central: balances.find(
          (balance) =>
            balance.locationId === central._id &&
            balance.materialId === ids.equipmentId
        )?.quantity,
        project: balances.find(
          (balance) =>
            balance.locationId === project._id &&
            balance.materialId === ids.equipmentId
        )?.quantity,
      };
    });
    expect(quantities).toEqual({ central: 6, project: 3 });
  });

  test("incompatibilidade exige decisão exclusiva do engenheiro responsável", async () => {
    const {
      ids,
      admin,
      purchasing,
      warehouse,
      engineer,
      otherEngineer,
    } = await seedInventoryFixture();
    await admin.mutation(api.inventory.createRule, {
      type: "attributes_must_match",
      name: "Tensão compatível",
      categoryA: "equipamento",
      categoryB: "cabo",
      attributeKey: "tensao",
      message: "Equipamento e cabo possuem tensões diferentes",
    });
    await createAndPostEntry(purchasing, [
      { materialId: ids.equipmentId, quantity: 1 },
      { materialId: ids.cableId, quantity: 10 },
    ]);

    const transfer = await warehouse.mutation(api.inventory.createDocument, {
      type: "transfer",
      projectId: ids.projectId,
      lines: [
        { materialId: ids.equipmentId, quantity: 1 },
        { materialId: ids.cableId, quantity: 5 },
      ],
    });
    expect(transfer.status).toBe("pending_approval");
    expect(transfer.issueCount).toBe(1);
    await expect(
      warehouse.mutation(api.inventory.postDocument, {
        documentId: transfer.documentId,
      })
    ).rejects.toThrow("aguarda aprovação");
    await expect(
      otherEngineer.mutation(api.inventory.reviewDocument, {
        documentId: transfer.documentId,
        decision: "approve",
        reason: "A instalação suporta",
      })
    ).rejects.toThrow("engenheiro responsável");
    await expect(
      admin.mutation(api.inventory.reviewDocument, {
        documentId: transfer.documentId,
        decision: "approve",
        reason: "Aprovação administrativa",
      })
    ).rejects.toThrow("engenheiro responsável");

    await engineer.mutation(api.inventory.reviewDocument, {
      documentId: transfer.documentId,
      decision: "approve",
      reason: "Será usado um transformador homologado",
    });
    await warehouse.mutation(api.inventory.postDocument, {
      documentId: transfer.documentId,
    });
  });

  test("estorno cria eventos compensatórios e preserva o documento original", async () => {
    const { t, ids, purchasing, warehouse } = await seedInventoryFixture();
    const entryDocumentId = await createAndPostEntry(purchasing, [
      { materialId: ids.equipmentId, quantity: 5 },
    ]);

    const reversalId = await warehouse.mutation(
      api.inventory.reverseDocument,
      {
        documentId: entryDocumentId,
        reason: "Entrada duplicada",
      }
    );

    const state = await t.run(async (ctx) => {
      const original = await ctx.db.get(
        "inventoryDocuments",
        entryDocumentId
      );
      const reversal = await ctx.db.get("inventoryDocuments", reversalId);
      const balances = await ctx.db.query("inventoryBalances").collect();
      const reversalEvents = await ctx.db
        .query("inventoryEvents")
        .withIndex("by_document", (q) => q.eq("documentId", reversalId))
        .collect();
      return {
        originalStatus: original?.status,
        originalReversalId: original?.reversedByDocumentId,
        reversalOf: reversal?.reversalOfDocumentId,
        balance: balances[0]?.quantity,
        deltas: reversalEvents.map((event) => event.quantityDelta),
      };
    });

    expect(state.originalStatus).toBe("reversed");
    expect(state.originalReversalId).toBe(reversalId);
    expect(state.reversalOf).toBe(entryDocumentId);
    expect(state.balance).toBe(0);
    expect(state.deltas).toEqual([-5]);
  });
});
