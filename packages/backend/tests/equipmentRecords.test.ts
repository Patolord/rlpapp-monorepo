import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { setup, withUser } from "./helpers";

// Exercita as funções de equipment.ts e maintenanceLogs.ts com documentos que
// preenchem todos os campos opcionais (inclusive os legados), para que o
// validador de retorno (conferido pelo convex-test) falhe se faltar um campo.

async function seed() {
  const t = setup();
  const asEngineer = await withUser(t, {
    clerkId: "eng",
    name: "Engenheira",
    role: "engenheiro",
  });
  const asTech = await withUser(t, {
    clerkId: "tech",
    name: "Técnico",
    role: "qr_operator",
  });
  const ids = await t.run(async (ctx) => {
    const techId = (await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", "tech"))
      .unique())!._id;
    const photoId = await ctx.storage.store(new Blob(["foto"], { type: "image/jpeg" }));
    const projectId = await ctx.db.insert("projects", {
      name: "Obra Teste",
      floors: [],
      createdAt: 1,
    });
    const plannedId = await ctx.db.insert("projectEquipment", {
      projectId,
      system: "VRF 1",
      ambiente: "Sala",
      kind: "evaporadora",
      modelo: "X",
      capacidade: "9k",
      status: "installing",
    });
    // Documento "cheio": campos atuais e legados.
    const fullId = await ctx.db.insert("equipment", {
      description: "Evaporadora sala",
      labelPhotoIds: [photoId],
      status: "operational",
      createdAt: 10,
      createdByUserId: techId,
      projectId,
      floor: 2,
      position: 3,
      location: "Teto",
      tag: "EV-01",
      type: "hi-wall",
      notes: "ok",
    });
    // Documento mínimo, sem descrição e ainda não alocado.
    const bareId = await ctx.db.insert("equipment", {
      status: "installing",
      createdAt: 20,
    });
    await ctx.db.insert("qrCodes", {
      token: "QR-BARE",
      equipmentId: bareId,
      status: "active",
      createdAt: 21,
    });
    await ctx.db.insert("qrCodes", {
      token: "QR-FULL",
      equipmentId: fullId,
      status: "active",
      batchId: "b1",
      batchName: "Lote 1",
      createdAt: 11,
    });
    await ctx.db.insert("maintenanceLogs", {
      equipmentId: fullId,
      type: "installation",
      technicianName: "Técnico",
      createdByUserId: techId,
      notes: "instalado",
      tags: ["Instalada"],
      status: "operational",
      tests: { vacuum: true, pressure: true, communication: false, gas: true },
      photoIds: [photoId],
      createdAt: 12,
    });
    // Registro legado: sem tipo, autor, notas, tags nem testes.
    await ctx.db.insert("maintenanceLogs", {
      equipmentId: bareId,
      technicianName: "Antigo",
      status: "installing",
      photoIds: [],
      createdAt: 5,
    });
    return { techId, photoId, projectId, plannedId, fullId, bareId };
  });
  return { t, asEngineer, asTech, ...ids };
}

describe("equipment", () => {
  test("get devolve o documento inteiro ou null", async () => {
    const { t, asTech, fullId, bareId } = await seed();
    const full = await asTech.query(api.equipment.get, { id: fullId });
    expect(full).toMatchObject({ _id: fullId, tag: "EV-01", floor: 2, location: "Teto" });
    expect(await asTech.query(api.equipment.get, { id: bareId })).toMatchObject({
      _id: bareId,
      status: "installing",
    });
    await t.run(async (ctx) => ctx.db.delete("equipment", bareId));
    expect(await asTech.query(api.equipment.get, { id: bareId })).toBeNull();
  });

  test("list devolve os documentos do mais novo ao mais antigo", async () => {
    const { asEngineer, fullId, bareId } = await seed();
    const rows = await asEngineer.query(api.equipment.list, {});
    expect(rows.map((row) => row._id)).toEqual([bareId, fullId]);
  });

  test("update aplica só os campos informados e devolve o id", async () => {
    const { t, asTech, bareId, plannedId, projectId } = await seed();
    expect(
      await asTech.mutation(api.equipment.update, {
        id: bareId,
        description: "Nova",
        projectEquipmentId: plannedId,
      })
    ).toBe(bareId);
    const [equipment, qr] = await t.run(async (ctx) => [
      await ctx.db.get("equipment", bareId),
      await ctx.db
        .query("qrCodes")
        .withIndex("by_token", (q) => q.eq("token", "QR-BARE"))
        .unique(),
    ]);
    expect(equipment).toMatchObject({
      description: "Nova",
      status: "installing",
      projectEquipmentId: plannedId,
    });
    expect(qr?.projectId).toBe(projectId);
  });

  test("listAssignable lista os não alocados com o token do QR", async () => {
    const { t, asEngineer, bareId, fullId } = await seed();
    const withoutQr = await t.run(async (ctx) =>
      ctx.db.insert("equipment", { description: "Sem QR", status: "warning", createdAt: 30 })
    );
    const rows = await asEngineer.query(api.equipment.listAssignable, {});
    expect(rows).toEqual([
      { _id: withoutQr, description: "Sem QR", status: "warning", token: null },
      { _id: bareId, status: "installing", token: "QR-BARE" },
      { _id: fullId, description: "Evaporadora sala", status: "operational", token: "QR-FULL" },
    ]);
  });
});

describe("maintenanceLogs", () => {
  test("listByEquipment devolve os registros com as URLs das fotos", async () => {
    const { asTech, fullId, bareId } = await seed();
    const [log] = await asTech.query(api.maintenanceLogs.listByEquipment, {
      equipmentId: fullId,
    });
    expect(log).toMatchObject({
      equipmentId: fullId,
      type: "installation",
      tests: { vacuum: true, pressure: true, communication: false, gas: true },
    });
    expect(log!.photoUrls).toHaveLength(1);
    const legacy = await asTech.query(api.maintenanceLogs.listByEquipment, {
      equipmentId: bareId,
    });
    expect(legacy).toEqual([expect.objectContaining({ technicianName: "Antigo", photoUrls: [] })]);
  });

  test("listMine pagina os registros do usuário com equipamento e QR", async () => {
    const { t, asTech, techId, fullId, bareId } = await seed();
    await t.run(async (ctx) => {
      // Registro de um equipamento já apagado: `equipment` vem null.
      const goneId = await ctx.db.insert("equipment", { status: "error", createdAt: 1 });
      await ctx.db.insert("maintenanceLogs", {
        equipmentId: goneId,
        type: "maintenance",
        technicianName: "Técnico",
        createdByUserId: techId,
        status: "error",
        photoIds: [],
        createdAt: 13,
      });
      await ctx.db.delete("equipment", goneId);
      await ctx.db.insert("maintenanceLogs", {
        equipmentId: bareId,
        type: "maintenance",
        technicianName: "Técnico",
        createdByUserId: techId,
        status: "installing",
        photoIds: [],
        createdAt: 14,
      });
    });
    const result = await asTech.query(api.maintenanceLogs.listMine, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(result.isDone).toBe(false);
    expect(result.page).toEqual([
      expect.objectContaining({ equipment: {}, qrToken: "QR-BARE", photoUrls: [] }),
      expect.objectContaining({ equipment: null, qrToken: null }),
    ]);
    const next = await asTech.query(api.maintenanceLogs.listMine, {
      paginationOpts: { numItems: 2, cursor: result.continueCursor },
    });
    expect(next.page).toEqual([
      expect.objectContaining({
        equipmentId: fullId,
        equipment: { description: "Evaporadora sala" },
        qrToken: "QR-FULL",
      }),
    ]);
  });

  test("create, addPhotos e generateUploadUrl", async () => {
    const { t, asTech, techId, bareId, photoId } = await seed();
    expect(typeof (await asTech.mutation(api.maintenanceLogs.generateUploadUrl, {}))).toBe(
      "string"
    );
    const logId = await asTech.mutation(api.maintenanceLogs.create, {
      equipmentId: bareId,
      type: "maintenance",
      notes: "  ",
      status: "warning",
      photoIds: [photoId],
    });
    expect(
      await asTech.mutation(api.maintenanceLogs.addPhotos, { logId, photoIds: [photoId] })
    ).toBeNull();
    const [log, equipment] = await t.run(async (ctx) => [
      await ctx.db.get("maintenanceLogs", logId),
      await ctx.db.get("equipment", bareId),
    ]);
    expect(log).toMatchObject({
      technicianName: "Técnico",
      createdByUserId: techId,
      photoIds: [photoId, photoId],
    });
    expect(log?.notes).toBeUndefined();
    expect(equipment?.status).toBe("warning");
    await expect(
      asTech.mutation(api.maintenanceLogs.create, {
        equipmentId: bareId,
        type: "maintenance",
        status: "warning",
        photoIds: [],
      })
    ).rejects.toThrow("É obrigatório anexar pelo menos uma foto");
  });
});
