import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

type TestConvex = ReturnType<typeof setup>;

/** Cria obra + torre + andar + ambiente + sistema para os testes. */
async function seedObra(t: TestConvex, name: string) {
  return t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name,
      floors: [],
      createdAt: Date.now(),
    });
    const towerId = await ctx.db.insert("towers", {
      projectId,
      name: "Torre A",
      order: 1,
      createdAt: Date.now(),
    });
    const floorId = await ctx.db.insert("floors", {
      towerId,
      projectId,
      number: 1,
      label: "1º andar",
      createdAt: Date.now(),
    });
    const environmentId = await ctx.db.insert("environments", {
      floorId,
      towerId,
      projectId,
      name: "Sala",
      order: 1,
      createdAt: Date.now(),
    });
    const systemId = await ctx.db.insert("systems", {
      projectId,
      name: "VRF 1",
      createdAt: Date.now(),
    });
    return { projectId, towerId, floorId, environmentId, systemId };
  });
}

/** Item planejado mínimo em um ambiente (sem QR). */
async function seedPlannedItem(
  t: TestConvex,
  obra: Awaited<ReturnType<typeof seedObra>>
) {
  return t.run(async (ctx) => {
    return await ctx.db.insert("projectEquipment", {
      projectId: obra.projectId,
      environmentId: obra.environmentId,
      towerId: obra.towerId,
      floorId: obra.floorId,
      system: "VRF 1",
      systemId: obra.systemId,
      ambiente: "Sala",
      kind: "evaporadora",
      modelo: "",
      capacidade: "",
      status: "installing",
    });
  });
}

/** Simula o cadastro do técnico: equipment + assignEquipment no token. */
async function registerAsTechnician(
  t: TestConvex,
  asUser: Awaited<ReturnType<typeof withUser>>,
  token: string,
  description: string
): Promise<Id<"equipment">> {
  const equipmentId = await t.run(async (ctx) => {
    return await ctx.db.insert("equipment", {
      description,
      status: "installing",
      createdAt: Date.now(),
    });
  });
  await asUser.mutation(api.qrCodes.assignEquipment, { token, equipmentId });
  return equipmentId;
}

describe("fluxo QR-Obra sem redundância", () => {
  test("lote com obra de destino: cadastro do técnico herda a obra", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-1", role: "admin" });
    const obra = await seedObra(t, "Obra Lorena");

    const result = await asAdmin.mutation(api.qrCodes.batchCreate, {
      tokens: ["AAAA0001", "AAAA0002"],
      batchName: "Lote Lorena",
      projectId: obra.projectId,
    });
    expect(result.created).toHaveLength(2);

    // Lote registrado em qrBatches com a obra de destino.
    const batch = await t.run(async (ctx) => {
      return await ctx.db
        .query("qrBatches")
        .withIndex("by_batchId", (q) => q.eq("batchId", result.batchId))
        .unique();
    });
    expect(batch?.projectId).toBe(obra.projectId);

    // getByToken expõe a obra de destino para o formulário do técnico.
    const byToken = await asAdmin.query(api.qrCodes.getByToken, {
      token: "AAAA0001",
    });
    expect(byToken?.batchProject?.projectName).toBe("Obra Lorena");

    // Cadastro do técnico: o QR herda a obra automaticamente.
    await registerAsTechnician(t, asAdmin, "AAAA0001", "VRF bloco A");
    const qr = await t.run(async (ctx) => {
      return await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", "AAAA0001"))
        .unique();
    });
    expect(qr?.projectId).toBe(obra.projectId);
  });

  test("bipagem aceita QR já cadastrado e preserva o cadastro do técnico", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-2", role: "admin" });
    const obra = await seedObra(t, "Obra Centro");

    await asAdmin.mutation(api.qrCodes.batchCreate, {
      tokens: ["BBBB0001"],
      projectId: obra.projectId,
    });
    const equipmentId = await registerAsTechnician(
      t,
      asAdmin,
      "BBBB0001",
      "Cadastro do técnico"
    );
    const itemId = await seedPlannedItem(t, obra);

    await asAdmin.mutation(api.qrCodes.linkTokenToProjectEquipment, {
      token: "BBBB0001",
      itemId,
    });

    const { item, equipment, qr } = await t.run(async (ctx) => {
      return {
        item: await ctx.db.get("projectEquipment", itemId),
        equipment: await ctx.db.get("equipment", equipmentId),
        qr: await ctx.db
          .query("qrCodes")
          .withIndex("by_token", (q) => q.eq("token", "BBBB0001"))
          .unique(),
      };
    });
    // Reaproveita o equipamento do técnico em vez de criar placeholder.
    expect(item?.linkedEquipmentId).toBe(equipmentId);
    expect(equipment?.projectEquipmentId).toBe(itemId);
    expect(equipment?.description).toBe("Cadastro do técnico");
    expect(qr?.equipmentId).toBe(equipmentId);
    expect(qr?.projectId).toBe(obra.projectId);
  });

  test("bipagem bloqueia etiqueta de lote destinado a outra obra", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-3", role: "admin" });
    const obraA = await seedObra(t, "Obra A");
    const obraB = await seedObra(t, "Obra B");

    await asAdmin.mutation(api.qrCodes.batchCreate, {
      tokens: ["CCCC0001"],
      projectId: obraA.projectId,
    });
    const itemIdB = await seedPlannedItem(t, obraB);

    await expect(
      asAdmin.mutation(api.qrCodes.linkTokenToProjectEquipment, {
        token: "CCCC0001",
        itemId: itemIdB,
      })
    ).rejects.toThrow('destinado à obra "Obra A"');
  });

  test("regressão: QR livre de lote sem obra ainda cria placeholder", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-4", role: "admin" });
    const obra = await seedObra(t, "Obra Sul");

    await asAdmin.mutation(api.qrCodes.batchCreate, {
      tokens: ["DDDD0001"],
    });
    const itemId = await seedPlannedItem(t, obra);

    await asAdmin.mutation(api.qrCodes.linkTokenToProjectEquipment, {
      token: "DDDD0001",
      itemId,
    });

    const { item, qr } = await t.run(async (ctx) => {
      return {
        item: await ctx.db.get("projectEquipment", itemId),
        qr: await ctx.db
          .query("qrCodes")
          .withIndex("by_token", (q) => q.eq("token", "DDDD0001"))
          .unique(),
      };
    });
    expect(item?.linkedEquipmentId).toBeDefined();
    expect(qr?.equipmentId).toBe(item?.linkedEquipmentId);
    expect(qr?.projectId).toBe(obra.projectId);
  });

  test("fila de atribuição + createFromRegisteredEquipment cria item e vincula", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-5", role: "admin" });
    const obra = await seedObra(t, "Obra Norte");

    await asAdmin.mutation(api.qrCodes.batchCreate, {
      tokens: ["EEEE0001"],
      projectId: obra.projectId,
    });
    const equipmentId = await registerAsTechnician(
      t,
      asAdmin,
      "EEEE0001",
      "Evaporadora recebida"
    );

    // Aparece na fila de atribuição da obra.
    const queueBefore = await asAdmin.query(
      api.qrCodes.listRegisteredForProject,
      { projectId: obra.projectId }
    );
    expect(queueBefore).toHaveLength(1);
    expect(queueBefore[0].token).toBe("EEEE0001");
    expect(queueBefore[0].description).toBe("Evaporadora recebida");

    // Atribuição em um passo: cria o item planejado e vincula.
    const created = await asAdmin.mutation(
      api.projectEquipment.createFromRegisteredEquipment,
      {
        token: "EEEE0001",
        environmentId: obra.environmentId,
        systemId: obra.systemId,
        kind: "evaporadora",
      }
    );
    expect(created.token).toBe("EEEE0001");

    const { item, equipment, qr } = await t.run(async (ctx) => {
      return {
        item: await ctx.db.get("projectEquipment", created.itemId),
        equipment: await ctx.db.get("equipment", equipmentId),
        qr: await ctx.db
          .query("qrCodes")
          .withIndex("by_token", (q) => q.eq("token", "EEEE0001"))
          .unique(),
      };
    });
    expect(item?.environmentId).toBe(obra.environmentId);
    expect(item?.systemId).toBe(obra.systemId);
    expect(item?.system).toBe("VRF 1");
    expect(item?.ambiente).toBe("Sala");
    expect(item?.linkedEquipmentId).toBe(equipmentId);
    // Atribuir não significa instalado: mantém o status do cadastro.
    expect(item?.status).toBe("installing");
    expect(equipment?.projectEquipmentId).toBe(created.itemId);
    expect(qr?.projectId).toBe(obra.projectId);

    // Fila esvazia após a atribuição.
    const queueAfter = await asAdmin.query(
      api.qrCodes.listRegisteredForProject,
      { projectId: obra.projectId }
    );
    expect(queueAfter).toHaveLength(0);
  });

  test("regressão: lote legado sem registro em qrBatches segue funcionando", async () => {
    const t = setup();
    const asAdmin = await withUser(t, { clerkId: "adm-6", role: "admin" });

    // Lote antigo: qrCodes com batchId, sem linha em qrBatches.
    await t.run(async (ctx) => {
      await ctx.db.insert("qrCodes", {
        token: "LEGA0001",
        status: "active",
        batchId: "batch-legacy",
        batchName: "Lote antigo",
        createdAt: Date.now(),
      });
    });

    const byToken = await asAdmin.query(api.qrCodes.getByToken, {
      token: "LEGA0001",
    });
    expect(byToken?.batchProject).toBeNull();

    // Cadastro do técnico não herda obra nenhuma (comportamento anterior).
    await registerAsTechnician(t, asAdmin, "LEGA0001", "Equipamento legado");
    const qr = await t.run(async (ctx) => {
      return await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", "LEGA0001"))
        .unique();
    });
    expect(qr?.equipmentId).toBeDefined();
    expect(qr?.projectId).toBeUndefined();
  });
});
