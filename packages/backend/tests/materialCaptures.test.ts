import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

async function seed() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const engineerId = await ctx.db.insert("users", {
      name: "Engenheiro",
      clerkId: "engineer",
      roles: ["engenheiro"],
      isActive: true,
      createdAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      name: "Obra Campo",
      responsibleId: engineerId,
      floors: [],
      createdAt: now,
    });
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Disjuntor",
      nameNormalized: "disjuntor",
      category: "eletrica",
      baseUnit: "un",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const breakerId = await ctx.db.insert("materials", {
      name: "Disjuntor",
      familyId,
      variantLabel: "10A",
      identityKey: `${familyId}|||un|10a||`,
      sku: "MAT-000001",
      barcode: "7891234567890",
      category: "eletrica",
      unit: "un",
      searchText: "disjuntor 10a mat 000001 7891234567890 eletrica",
      active: true,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("materialAliases", {
      alias: "DJ 10",
      aliasNormalized: "dj 10",
      materialId: breakerId,
      createdAt: now,
    });
    await ctx.db.insert("materialSkuCounters", { key: "material", nextNumber: 2 });
    return { projectId, breakerId, familyId };
  });
  const warehouse = await withUser(t, { clerkId: "warehouse", roles: ["estoque"] });
  const purchasing = await withUser(t, { clerkId: "purchasing", roles: ["compras"] });
  const engineer = t.withIdentity({ subject: "engineer" });
  return { t, ids, warehouse, purchasing, engineer };
}

let counter = 0;
const clientId = () => `test-${++counter}`;

async function balanceOf(
  t: ReturnType<typeof setup>,
  materialId: Id<"materials">,
  projectId?: Id<"projects">
) {
  return await t.run(async (ctx) => {
    const location = projectId
      ? await ctx.db
          .query("inventoryLocations")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .first()
      : await ctx.db
          .query("inventoryLocations")
          .withIndex("by_type", (q) => q.eq("type", "central"))
          .first();
    if (!location) return null;
    return await ctx.db
      .query("inventoryBalances")
      .withIndex("by_location_material", (q) =>
        q.eq("locationId", location._id).eq("materialId", materialId)
      )
      .unique();
  });
}

async function materialCount(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => (await ctx.db.query("materials").collect()).length);
}

describe("cadastro em campo", () => {
  test("código de barras lido soma no material existente, sem criar outro", async () => {
    const { t, ids, warehouse } = await seed();
    const lookup = await warehouse.query(api.materialCaptures.lookup, {
      code: "7891234567890",
    });
    expect(lookup.exact?.materialId).toBe(ids.breakerId);
    expect(lookup.exact?.reason).toBe("barcode");

    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "", barcode: "7891234567890" },
      quantity: 12,
      physicalAddress: "Prateleira A1",
      capturedAt: Date.now(),
    });
    expect(result.outcome).toBe("matched");
    expect(result.matchReason).toBe("barcode");
    expect(result.materialId).toBe(ids.breakerId);
    expect(result.quantityHere).toBe(12);
    expect(await materialCount(t)).toBe(1);
    const balance = await balanceOf(t, ids.breakerId);
    expect(balance?.quantity).toBe(12);
    expect(balance?.physicalAddress).toBe("Prateleira A1");
  });

  test("SKU da etiqueta interna e apelido também identificam o item", async () => {
    const { ids, warehouse } = await seed();
    const bySku = await warehouse.query(api.materialCaptures.lookup, { code: "mat-000001" });
    expect(bySku.exact?.materialId).toBe(ids.breakerId);
    expect(bySku.exact?.reason).toBe("sku");

    const byAlias = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "dj 10" },
      quantity: 1,
      capturedAt: Date.now(),
    });
    expect(byAlias.matchReason).toBe("alias");
    expect(byAlias.materialId).toBe(ids.breakerId);
  });

  test("mesmo nome, unidade e variação é o mesmo material", async () => {
    const { t, ids, warehouse } = await seed();
    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "  disjuntor ", variantLabel: "10A", unit: "UN" },
      quantity: 3,
      capturedAt: Date.now(),
    });
    expect(result.outcome).toBe("matched");
    expect(result.matchReason).toBe("identity");
    expect(result.materialId).toBe(ids.breakerId);
    expect(await materialCount(t)).toBe(1);
  });

  test("item novo sem parecidos entra ativo; a segunda captura soma nele", async () => {
    const { t, warehouse } = await seed();
    const first = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Fita isolante", unit: "rolo" },
      quantity: 5,
      capturedAt: Date.now(),
    });
    expect(first.outcome).toBe("created");
    expect(first.sku).toBe("MAT-000002");

    const second = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Fita Isolante", unit: "rolo" },
      quantity: 4,
      capturedAt: Date.now(),
      offline: true,
    });
    expect(second.outcome).toBe("matched");
    expect(second.materialId).toBe(first.materialId);
    expect(second.quantityHere).toBe(9);
    expect(await materialCount(t)).toBe(2);
  });

  test("parecido não visto (sem sinal) vira rascunho para revisão", async () => {
    const { t, ids, warehouse, purchasing } = await seed();
    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Disjuntor", variantLabel: "20A", unit: "un" },
      quantity: 2,
      offline: true,
      capturedAt: Date.now(),
    });
    expect(result.outcome).toBe("review");
    expect(result.similarCount).toBeGreaterThan(0);
    const material = await t.run(async (ctx) => await ctx.db.get("materials", result.materialId));
    expect(material?.status).toBe("draft");
    expect(material?.active).toBe(true);
    // O saldo entra mesmo em rascunho: o material existe fisicamente.
    expect((await balanceOf(t, result.materialId))?.quantity).toBe(2);

    const review = await purchasing.query(api.materialCaptures.reviewForMaterial, {
      materialId: result.materialId,
    });
    expect(review?.captures).toHaveLength(1);
    expect(review?.similar.map((s) => s.materialId)).toContain(ids.breakerId);
  });

  test("apelido recusado ('não é este') cria o item novo", async () => {
    const { ids, warehouse } = await seed();
    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "dj 10", unit: "un" },
      confirmedNew: true,
      quantity: 1,
      capturedAt: Date.now(),
    });
    expect(result.materialId).not.toBe(ids.breakerId);
    expect(result.matchReason).toBe("new");
  });

  test("mesma identidade de um arquivado reativa em rascunho, sem erro", async () => {
    const { t, ids, warehouse } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.patch("materials", ids.breakerId, { active: false, status: "archived" });
    });
    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Disjuntor", variantLabel: "10A", unit: "un" },
      quantity: 2,
      capturedAt: Date.now(),
    });
    expect(result.materialId).toBe(ids.breakerId);
    expect(result.outcome).toBe("review");
    const material = await t.run(async (ctx) => await ctx.db.get("materials", ids.breakerId));
    expect(material?.status).toBe("draft");
    expect(material?.active).toBe(true);
    expect(await materialCount(t)).toBe(1);
  });

  test("quem viu os parecidos e confirmou que é novo cria ativo", async () => {
    const { t, warehouse } = await seed();
    const result = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Disjuntor", variantLabel: "20A", unit: "un" },
      confirmedNew: true,
      quantity: 2,
      capturedAt: Date.now(),
    });
    expect(result.outcome).toBe("created");
    const material = await t.run(async (ctx) => await ctx.db.get("materials", result.materialId));
    expect(material?.status).toBe("active");
  });

  test("reenvio da fila com o mesmo clientId não conta duas vezes", async () => {
    const { t, ids, warehouse } = await seed();
    const args = {
      clientId: clientId(),
      materialId: ids.breakerId,
      quantity: 7,
      capturedAt: Date.now(),
    };
    const first = await warehouse.mutation(api.materialCaptures.capture, args);
    const again = await warehouse.mutation(api.materialCaptures.capture, args);
    expect(again.replayed).toBe(true);
    expect(again.captureId).toBe(first.captureId);
    expect((await balanceOf(t, ids.breakerId))?.quantity).toBe(7);
  });

  test("escolher um existente grava o código lido nele", async () => {
    const { t, warehouse } = await seed();
    const created = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Abraçadeira nylon", unit: "pct" },
      quantity: 1,
      capturedAt: Date.now(),
    });
    await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      materialId: created.materialId,
      item: { name: "Abraçadeira nylon", barcode: "789000111" },
      quantity: 1,
      capturedAt: Date.now(),
    });
    const scanned = await warehouse.query(api.materialCaptures.lookup, { code: "789000111" });
    expect(scanned.exact?.materialId).toBe(created.materialId);
    expect(await materialCount(t)).toBe(2);
  });

  test("contagem na obra: modo 'set' corrige o saldo para o contado", async () => {
    const { t, ids, purchasing } = await seed();
    await purchasing.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      projectId: ids.projectId,
      materialId: ids.breakerId,
      quantity: 10,
      capturedAt: Date.now(),
    });
    const corrected = await purchasing.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      projectId: ids.projectId,
      materialId: ids.breakerId,
      quantityMode: "set",
      quantity: 6,
      capturedAt: Date.now(),
    });
    expect(corrected.quantityDelta).toBe(-4);
    expect((await balanceOf(t, ids.breakerId, ids.projectId))?.quantity).toBe(6);
    // Endereço físico só no central.
    expect((await balanceOf(t, ids.breakerId, ids.projectId))?.physicalAddress).toBeUndefined();
  });

  test("sem a permissão de cadastro em campo não captura", async () => {
    const { ids, engineer } = await seed();
    await expect(
      engineer.mutation(api.materialCaptures.capture, {
        clientId: clientId(),
        projectId: ids.projectId,
        materialId: ids.breakerId,
        quantity: 1,
        capturedAt: Date.now(),
      })
    ).rejects.toThrow("Seu usuário não pode cadastrar itens em campo");
  });

  test("mesclar o rascunho leva o cadastro em campo para o material certo", async () => {
    const { t, ids, warehouse, purchasing } = await seed();
    const draft = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      item: { name: "Disjuntor", variantLabel: "10 A", unit: "un" },
      quantity: 3,
      offline: true,
      capturedAt: Date.now(),
    });
    expect(draft.outcome).toBe("review");
    await purchasing.mutation(api.materials.merge, {
      sourceId: draft.materialId,
      targetId: ids.breakerId,
    });
    const captures = await t.run(async (ctx) => await ctx.db.query("materialCaptures").collect());
    expect(captures[0]?.materialId).toBe(ids.breakerId);
    expect((await balanceOf(t, ids.breakerId))?.quantity).toBe(3);
    // Captura posterior do material mesclado segue o redirecionamento.
    const later = await warehouse.mutation(api.materialCaptures.capture, {
      clientId: clientId(),
      materialId: draft.materialId,
      quantity: 1,
      capturedAt: Date.now(),
    });
    expect(later.materialId).toBe(ids.breakerId);
  });
});
