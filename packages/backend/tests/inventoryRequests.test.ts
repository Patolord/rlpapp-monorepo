import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup } from "./helpers";

async function seedFieldInventory() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const warehouseUserId = await ctx.db.insert("users", {
      name: "Operador Estoque",
      clerkId: "wh-req",
      role: "operator",
      department: "estoque",
      isActive: true,
      createdAt: now,
    });
    const purchasingUserId = await ctx.db.insert("users", {
      name: "Compras",
      clerkId: "buy-req",
      role: "operator",
      department: "compras",
      isActive: true,
      createdAt: now,
    });
    const engineerUserId = await ctx.db.insert("users", {
      name: "Engenheiro",
      clerkId: "eng-req",
      role: "engenheiro",
      department: "engenharia",
      isActive: true,
      createdAt: now,
    });
    const techUserId = await ctx.db.insert("users", {
      name: "Técnico Campo",
      clerkId: "tech-req",
      role: "qr_operator",
      isActive: true,
      createdAt: now,
    });
    const otherTechUserId = await ctx.db.insert("users", {
      name: "Outro Técnico",
      clerkId: "tech-req-other",
      role: "qr_operator",
      isActive: true,
      createdAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      name: "Obra Campo",
      slug: "obra-campo",
      responsibleId: engineerUserId,
      technicianIds: [techUserId],
      floors: [],
      createdAt: now,
    });
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Cobre",
      nameNormalized: "cobre",
      category: "tubo",
      baseUnit: "m",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const copperId = await ctx.db.insert("materials", {
      name: "Tubo de Cobre 1/4",
      familyId,
      identityKey: "field-copper-14",
      category: "tubo",
      unit: "m",
      active: true,
      status: "active",
      createdAt: now,
    });
    const tapeId = await ctx.db.insert("materials", {
      name: "Fita Isolante",
      familyId,
      identityKey: "field-tape",
      category: "eletrica",
      unit: "un",
      active: true,
      status: "active",
      createdAt: now,
    });
    return {
      warehouseUserId,
      purchasingUserId,
      engineerUserId,
      techUserId,
      otherTechUserId,
      projectId,
      copperId,
      tapeId,
    };
  });

  return {
    t,
    ids,
    warehouse: t.withIdentity({ subject: "wh-req" }),
    purchasing: t.withIdentity({ subject: "buy-req" }),
    engineer: t.withIdentity({ subject: "eng-req" }),
    tech: t.withIdentity({ subject: "tech-req" }),
    otherTech: t.withIdentity({ subject: "tech-req-other" }),
  };
}

async function sendToObra(
  purchasing: ReturnType<ReturnType<typeof setup>["withIdentity"]>,
  warehouse: ReturnType<ReturnType<typeof setup>["withIdentity"]>,
  projectId: Id<"projects">,
  materialId: Id<"materials">,
  quantity: number
) {
  const entry = await purchasing.mutation(api.inventory.createDocument, {
    type: "entry",
    lines: [{ materialId, quantity }],
  });
  await purchasing.mutation(api.inventory.postDocument, {
    documentId: entry.documentId,
  });
  const transfer = await warehouse.mutation(api.inventory.createDocument, {
    type: "transfer",
    projectId,
    lines: [{ materialId, quantity }],
  });
  await warehouse.mutation(api.inventory.postDocument, {
    documentId: transfer.documentId,
  });
  return transfer.documentId;
}

async function projectBalance(
  t: ReturnType<typeof setup>,
  projectId: Id<"projects">,
  materialId: Id<"materials">
) {
  return t.run(async (ctx) => {
    const location = await ctx.db
      .query("inventoryLocations")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique();
    if (!location) return 0;
    const balance = await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location_material", (q) =>
        q.eq("locationId", location._id).eq("materialId", materialId)
      )
      .unique();
    return balance?.quantity ?? 0;
  });
}

describe("pedidos de material da obra", () => {
  test("técnico sem atribuição não lê o estoque da obra", async () => {
    const { ids, otherTech } = await seedFieldInventory();
    await expect(
      otherTech.query(api.inventoryRequests.listObraBalances, {
        projectId: ids.projectId,
      })
    ).rejects.toThrow("Acesso negado a esta obra");
  });

  test("acabou zera o saldo e pedido não movimenta estoque até o envio", async () => {
    const { t, ids, purchasing, warehouse, tech, engineer } =
      await seedFieldInventory();
    await sendToObra(purchasing, warehouse, ids.projectId, ids.copperId, 10);

    const before = await tech.query(api.inventoryRequests.listObraBalances, {
      projectId: ids.projectId,
    });
    expect(before).toHaveLength(1);
    expect(before[0]?.quantity).toBe(10);
    expect(before[0]?.sentQuantity).toBe(10);

    await tech.mutation(api.inventoryRequests.markDepleted, {
      projectId: ids.projectId,
      materialId: ids.copperId,
    });
    expect(await projectBalance(t, ids.projectId, ids.copperId)).toBe(0);

    await sendToObra(purchasing, warehouse, ids.projectId, ids.copperId, 6);
    expect(await projectBalance(t, ids.projectId, ids.copperId)).toBe(6);

    const requestId = await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [
        {
          materialId: ids.copperId,
          quantity: 8,
          reason: "replenishment",
        },
      ],
    });
    expect(await projectBalance(t, ids.projectId, ids.copperId)).toBe(6);

    await engineer.mutation(api.inventoryRequests.reviewRequest, {
      requestId,
      decision: "approve",
      reason: "Necessário para concluir a instalação",
    });
    expect(await projectBalance(t, ids.projectId, ids.copperId)).toBe(6);

    const approved = await warehouse.query(
      api.inventoryRequests.listOfficeRequests,
      { status: "approved" }
    );
    expect(approved).toHaveLength(1);
    expect(approved[0]?._id).toBe(requestId);
  });

  test("pedido com acabou consome o restante e continua pendente sem transferir", async () => {
    const { t, ids, purchasing, warehouse, tech } = await seedFieldInventory();
    await sendToObra(purchasing, warehouse, ids.projectId, ids.copperId, 4);

    const requestId = await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [
        {
          materialId: ids.copperId,
          quantity: 10,
          reason: "replenishment",
          markedDepleted: true,
        },
      ],
    });

    expect(await projectBalance(t, ids.projectId, ids.copperId)).toBe(0);
    const mine = await tech.query(api.inventoryRequests.listObraRequests, {
      projectId: ids.projectId,
    });
    expect(mine[0]?._id).toBe(requestId);
    expect(mine[0]?.status).toBe("pending");
    expect(mine[0]?.items[0]?.markedDepleted).toBe(true);
  });

  test("técnico não cria material e não vê o estoque central", async () => {
    const { ids, tech } = await seedFieldInventory();
    await expect(
      tech.mutation(api.inventory.quickCreateMaterial, {
        name: "Material clandestino",
      })
    ).rejects.toThrow();

    const catalog = await tech.query(api.inventoryRequests.searchCatalog, {
      search: "Fita",
    });
    expect(catalog.some((item) => item.materialId === ids.tapeId)).toBe(true);

    await expect(
      tech.query(api.inventory.listBalances, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow();
  });

  test("estoque marca como enviado após transferência concluída", async () => {
    const { t, ids, purchasing, warehouse, tech, engineer } =
      await seedFieldInventory();
    await sendToObra(purchasing, warehouse, ids.projectId, ids.tapeId, 2);

    const requestId = await tech.mutation(api.inventoryRequests.createRequest, {
      projectId: ids.projectId,
      items: [
        {
          materialId: ids.tapeId,
          quantity: 5,
          reason: "replenishment",
        },
      ],
    });
    await engineer.mutation(api.inventoryRequests.reviewRequest, {
      requestId,
      decision: "approve",
      reason: "Ok",
    });

    const documentId = await sendToObra(
      purchasing,
      warehouse,
      ids.projectId,
      ids.tapeId,
      5
    );
    await warehouse.mutation(api.inventoryRequests.markFulfilled, {
      requestId,
      documentId,
    });

    const requests = await tech.query(api.inventoryRequests.listObraRequests, {
      projectId: ids.projectId,
    });
    expect(requests[0]?.status).toBe("fulfilled");
    expect(await projectBalance(t, ids.projectId, ids.tapeId)).toBe(7);
  });
});
