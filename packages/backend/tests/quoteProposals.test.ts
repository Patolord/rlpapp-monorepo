import { describe, expect, test } from "vitest";
import { weekStartOf } from "@rlpapp/shared/compras/priceReference";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup, withUser } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
/** Horário de Brasília (UTC-3) como instante UTC. */
const brt = (y: number, m: number, d: number, h = 12) =>
  Date.UTC(y, m - 1, d, h + 3);
const NOW = brt(2026, 11, 9);

async function seed() {
  const t = setup();
  const ids = await t.run(async (ctx) => {
    const createdAt = NOW - 400 * DAY;
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Split hi-wall 9.000 BTU/h",
      nameNormalized: "split hi wall 9 000 btu h",
      category: "Ar-condicionado",
      baseUnit: "un",
      active: true,
      createdAt,
      updatedAt: createdAt,
    });
    const variant = (variantLabel: string, manufacturer: string) =>
      ctx.db.insert("materials", {
        name: "Split hi-wall 9.000 BTU/h",
        variantLabel,
        manufacturer,
        familyId,
        unit: "un",
        active: true,
        createdAt,
      });
    const lg = await variant("LG · Quente e frio · Inverter", "LG");
    const midea = await variant("Midea · Só frio · Inverter", "Midea");
    const supplier = (name: string) =>
      ctx.db.insert("suppliers", { name, active: true, createdAt });
    return {
      familyId,
      lg,
      midea,
      dufrio: await supplier("Dufrio"),
      frigelar: await supplier("Frigelar"),
      leveros: await supplier("Leveros"),
    };
  });
  const asBuyer = await withUser(t, { clerkId: "buyer_1", roles: ["compras"] });
  return { t, ids, asBuyer };
}

describe("quoteProposals", () => {
  test("uma proposta grava um preço por linha, com data, validade e fornecedor dela", async () => {
    const { t, ids, asBuyer } = await seed();
    const { proposalId, priceEventIds } = await asBuyer.mutation(
      api.quoteProposals.create,
      {
        supplierId: ids.dufrio,
        receivedAt: brt(2026, 11, 6),
        validUntil: brt(2026, 11, 21),
        paymentTerms: "28 dias",
        freight: "cif",
        lines: [
          { materialId: ids.lg, unitPriceCents: 305000, unit: "un", quantity: 6 },
          { materialId: ids.midea, unitPriceCents: 232000, unit: "un", quantity: 6 },
        ],
      }
    );
    expect(priceEventIds).toHaveLength(2);

    const proposal = await asBuyer.query(api.quoteProposals.get, { proposalId });
    expect(proposal).toMatchObject({
      supplierName: "Dufrio",
      weekStart: brt(2026, 11, 2, 0),
      paymentTerms: "28 dias",
      freight: "cif",
    });
    expect(proposal!.lines.map((line) => line.unitPriceCents).sort()).toEqual([
      232000, 305000,
    ]);

    const event = await t.run((ctx) => ctx.db.get("priceEvents", priceEventIds[0]!));
    expect(event).toMatchObject({
      supplierId: ids.dufrio,
      occurredAt: brt(2026, 11, 6),
      validUntil: brt(2026, 11, 21),
      source: "quote",
      quoteProposalId: proposalId,
      needsReview: false,
    });
  });

  test("recusa proposta sem fornecedor, sem linhas ou com validade antes da data", async () => {
    const { ids, asBuyer } = await seed();
    const base = {
      receivedAt: brt(2026, 11, 6),
      lines: [{ materialId: ids.lg, unitPriceCents: 1, unit: "un" }],
    };
    await expect(asBuyer.mutation(api.quoteProposals.create, base)).rejects.toThrow(
      /fornecedor/
    );
    await expect(
      asBuyer.mutation(api.quoteProposals.create, {
        ...base,
        supplierId: ids.dufrio,
        lines: [],
      })
    ).rejects.toThrow(/ao menos um preço/);
    await expect(
      asBuyer.mutation(api.quoteProposals.create, {
        ...base,
        supplierId: ids.dufrio,
        validUntil: brt(2026, 11, 1),
      })
    ).rejects.toThrow(/validade/);
  });

  test("a mesma proposta (número) do mesmo fornecedor não entra duas vezes", async () => {
    const { ids, asBuyer } = await seed();
    const proposal = {
      supplierId: ids.dufrio,
      receivedAt: brt(2026, 11, 6),
      reference: "PV-2211",
      lines: [{ materialId: ids.lg, unitPriceCents: 305000, unit: "un" }],
    };
    await asBuyer.mutation(api.quoteProposals.create, proposal);
    await expect(
      asBuyer.mutation(api.quoteProposals.create, { ...proposal, reference: "pv 2211" })
    ).rejects.toThrow(/já registrada/);
    await asBuyer.mutation(api.quoteProposals.create, {
      ...proposal,
      supplierId: ids.frigelar,
    });
  });

  test("corrigir a data da proposta move os preços dela", async () => {
    const { t, ids, asBuyer } = await seed();
    const { proposalId, priceEventIds } = await asBuyer.mutation(
      api.quoteProposals.create,
      {
        supplierId: ids.leveros,
        receivedAt: brt(2026, 11, 7),
        lines: [{ materialId: ids.lg, unitPriceCents: 312000, unit: "un" }],
      }
    );
    await asBuyer.mutation(api.quoteProposals.update, {
      proposalId,
      receivedAt: brt(2026, 11, 10),
      validUntil: brt(2026, 11, 20),
    });
    const [proposal, event] = await t.run(async (ctx) => [
      await ctx.db.get("quoteProposals", proposalId),
      await ctx.db.get("priceEvents", priceEventIds[0]!),
    ]);
    expect(proposal?.weekStart).toBe(brt(2026, 11, 9, 0));
    expect(event).toMatchObject({
      occurredAt: brt(2026, 11, 10),
      validUntil: brt(2026, 11, 20),
    });
  });

  test("liga preços lançados avulsos à proposta só se forem do mesmo fornecedor", async () => {
    const { ids, asBuyer } = await seed();
    const loose = await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.midea,
      supplierId: ids.dufrio,
      unitPriceCents: 231000,
      unit: "un",
      source: "quote",
      occurredAt: brt(2026, 11, 5),
    });
    const other = await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.midea,
      supplierId: ids.frigelar,
      unitPriceCents: 228000,
      unit: "un",
      source: "quote",
      occurredAt: brt(2026, 11, 4),
    });
    const { proposalId } = await asBuyer.mutation(api.quoteProposals.create, {
      supplierId: ids.dufrio,
      receivedAt: brt(2026, 11, 6),
      lines: [{ materialId: ids.lg, unitPriceCents: 305000, unit: "un" }],
    });

    await expect(
      asBuyer.mutation(api.quoteProposals.linkPriceEvents, {
        proposalId,
        priceEventIds: [other],
      })
    ).rejects.toThrow(/outro fornecedor/);
    expect(
      await asBuyer.mutation(api.quoteProposals.linkPriceEvents, {
        proposalId,
        priceEventIds: [loose],
      })
    ).toBe(1);
    const proposal = await asBuyer.query(api.quoteProposals.get, { proposalId });
    expect(proposal!.lines).toHaveLength(2);
  });

  test("lista os preços de um fornecedor num período (conferência antes de lançar retroativo)", async () => {
    const { ids, asBuyer } = await seed();
    const add = (supplierId: Id<"suppliers">, occurredAt: number) =>
      asBuyer.mutation(api.priceEvents.add, {
        materialId: ids.lg,
        supplierId,
        unitPriceCents: 300000,
        unit: "un",
        source: "quote",
        occurredAt,
      });
    await add(ids.dufrio, brt(2026, 3, 10));
    await add(ids.dufrio, brt(2026, 4, 10));
    await add(ids.frigelar, brt(2026, 4, 12));
    const april = await asBuyer.query(api.priceEvents.list, {
      now: NOW,
      supplierId: ids.dufrio,
      from: brt(2026, 4, 1, 0),
      to: brt(2026, 4, 30, 23),
    });
    expect(april.map((e) => e.occurredAt)).toEqual([brt(2026, 4, 10)]);
    const allApril = await asBuyer.query(api.priceEvents.list, {
      now: NOW,
      from: brt(2026, 4, 1, 0),
      to: brt(2026, 4, 30, 23),
    });
    expect(allApril).toHaveLength(2);
  });

  test("o período usa a data do preço: um preço antigo lançado antes de outros mais novos aparece", async () => {
    const { ids, asBuyer } = await seed();
    const add = (unitPriceCents: number, occurredAt: number) =>
      asBuyer.mutation(api.priceEvents.add, {
        materialId: ids.lg,
        supplierId: ids.dufrio,
        unitPriceCents,
        unit: "un",
        source: "quote",
        occurredAt,
      });
    await add(280000, brt(2026, 2, 10)); // criado primeiro
    await add(300000, brt(2026, 10, 1));
    await add(301000, brt(2026, 10, 8));
    await add(302000, brt(2026, 10, 15));
    const period = { now: NOW, from: brt(2026, 2, 1, 0), to: brt(2026, 2, 28, 23), limit: 2 };
    const byMaterial = await asBuyer.query(api.priceEvents.list, { ...period, materialId: ids.lg });
    expect(byMaterial.map((e) => e.unitPriceCents)).toEqual([280000]);
    const bySupplier = await asBuyer.query(api.priceEvents.list, {
      ...period,
      supplierId: ids.dufrio,
      materialId: ids.lg,
    });
    expect(bySupplier.map((e) => e.unitPriceCents)).toEqual([280000]);
  });

  test("um preço lançado numa proposta fica com o fornecedor, a data e a validade dela", async () => {
    const { t, ids, asBuyer } = await seed();
    const { proposalId } = await asBuyer.mutation(api.quoteProposals.create, {
      supplierId: ids.dufrio,
      receivedAt: brt(2026, 11, 6),
      validUntil: brt(2026, 11, 21),
      lines: [{ materialId: ids.lg, unitPriceCents: 305000, unit: "un" }],
    });
    const added = await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.midea,
      unitPriceCents: 232000,
      unit: "un",
      source: "quote",
      occurredAt: brt(2026, 9, 1),
      quoteProposalId: proposalId,
    });
    const event = await t.run((ctx) => ctx.db.get("priceEvents", added));
    expect(event).toMatchObject({
      supplierId: ids.dufrio,
      occurredAt: brt(2026, 11, 6),
      validUntil: brt(2026, 11, 21),
    });
    await expect(
      asBuyer.mutation(api.priceEvents.add, {
        materialId: ids.midea,
        supplierId: ids.frigelar,
        unitPriceCents: 228000,
        unit: "un",
        source: "quote",
        occurredAt: brt(2026, 11, 6),
        quoteProposalId: proposalId,
      })
    ).rejects.toThrow(/diferente do da proposta/);
  });

  test("a referência do catálogo do takeoff usa todas as cotações dos 6 meses", async () => {
    const { t, ids } = await seed();
    const now = Date.now();
    await t.run(async (ctx) => {
      const insert = (unitPriceCents: number, daysAgo: number) =>
        ctx.db.insert("priceEvents", {
          materialId: ids.lg,
          supplierId: ids.dufrio,
          unitPriceCents,
          unit: "un",
          source: "quote",
          occurredAt: now - daysAgo * DAY,
          needsReview: false,
          reviewStatus: "reviewed",
          createdAt: now,
        });
      // 30 cotações mais antigas criadas primeiro, 30 recentes depois: as 50
      // últimas criadas dariam mediana 200; as 60 da janela dão 150.
      for (let i = 0; i < 30; i++) await insert(10000, 100);
      for (let i = 0; i < 30; i++) await insert(20000, 10);
    });
    const asEngineer = await withUser(t, { clerkId: "eng_ref", roles: ["engenharia"] });
    const body = await asEngineer.query(api.takeoffCatalog.current, {});
    const lg = body.items.find((item) => item.id === ids.lg);
    expect(lg?.reference).toMatchObject({ price: 150, count: 60 });
  });

  test("o preço atual do catálogo é a cotação mais recente pela data, mesmo depois de carga retroativa", async () => {
    const { t, ids } = await seed();
    const now = Date.now();
    await t.run(async (ctx) => {
      const insert = (unitPriceCents: number, daysAgo: number) =>
        ctx.db.insert("priceEvents", {
          materialId: ids.lg,
          supplierId: ids.dufrio,
          unitPriceCents,
          unit: "un",
          source: "quote",
          occurredAt: now - daysAgo * DAY,
          needsReview: false,
          reviewStatus: "reviewed",
          createdAt: now,
        });
      await insert(31000, 2); // a cotação nova, criada primeiro
      // 60 cotações antigas lançadas depois (histórico retroativo).
      for (let i = 0; i < 60; i++) await insert(20000, 300 + i);
    });
    const asEngineer = await withUser(t, { clerkId: "eng_cur", roles: ["engenharia"] });
    const body = await asEngineer.query(api.takeoffCatalog.current, {});
    expect(body.items.find((item) => item.id === ids.lg)?.materialPrice).toBe(310);
  });

  test("com mais cotações do que uma leitura traz, a referência avisa que é amostra", async () => {
    const { t, ids, asBuyer } = await seed();
    await t.run(async (ctx) => {
      for (let i = 0; i < 501; i++) {
        await ctx.db.insert("priceEvents", {
          materialId: ids.lg,
          supplierId: ids.dufrio,
          unitPriceCents: 30000 + i,
          unit: "un",
          source: "quote",
          occurredAt: NOW - (1 + (i % 150)) * DAY,
          needsReview: false,
          reviewStatus: "reviewed",
          createdAt: NOW,
        });
      }
    });
    const reference = await asBuyer.query(api.priceEvents.materialReference, {
      materialId: ids.lg,
      now: NOW,
    });
    expect(reference).toMatchObject({ count: 500, truncated: true });
    const history = await asBuyer.query(api.priceEvents.familyHistory, {
      materialId: ids.lg,
      now: NOW,
    });
    expect(history.variants.find((v) => v.materialId === ids.lg)?.reference?.truncated).toBe(true);
  });

  test("só quem registra preços cria proposta", async () => {
    const { t, ids } = await seed();
    const asEngineer = await withUser(t, { clerkId: "eng_1", roles: ["engenharia"] });
    await expect(
      asEngineer.mutation(api.quoteProposals.create, {
        supplierId: ids.dufrio,
        receivedAt: brt(2026, 11, 6),
        lines: [{ materialId: ids.lg, unitPriceCents: 1, unit: "un" }],
      })
    ).rejects.toThrow();
  });
});

describe("rodada da semana", () => {
  async function seedWeek() {
    const ctx = await seed();
    const { ids, asBuyer } = ctx;
    const propose = (
      supplierId: Id<"suppliers">,
      receivedAt: number,
      lg: number,
      midea?: number
    ) =>
      asBuyer.mutation(api.quoteProposals.create, {
        supplierId,
        receivedAt,
        lines: [
          { materialId: ids.lg, unitPriceCents: lg, unit: "un", quantity: 6 },
          ...(midea
            ? [{ materialId: ids.midea, unitPriceCents: midea, unit: "un", quantity: 6 }]
            : []),
        ],
      });
    // Semana de 02/11: três fornecedores em dias diferentes.
    await propose(ids.frigelar, brt(2026, 11, 4), 309000, 228000);
    await propose(ids.dufrio, brt(2026, 11, 6), 305000, 232000);
    await propose(ids.leveros, brt(2026, 11, 7), 312000);
    // Semana anterior: não entra no mapa de 02/11.
    await propose(ids.dufrio, brt(2026, 10, 30), 299000);
    // Preço lançado sem proposta também entra na semana.
    await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.midea,
      supplierNameRaw: "Leveros",
      unitPriceCents: 235000,
      unit: "un",
      source: "whatsapp",
      occurredAt: brt(2026, 11, 8, 20),
    });
    return ctx;
  }

  test("compara os fornecedores da mesma semana, um preço por fornecedor e material", async () => {
    const { ids, asBuyer } = await seedWeek();
    const week = await asBuyer.query(api.quoteProposals.week, {
      weekStart: brt(2026, 11, 5), // qualquer instante da semana
      now: NOW,
    });
    expect(week.weekStart).toBe(brt(2026, 11, 2, 0));
    expect(week.columns.map((c) => c.supplierName)).toEqual([
      "Frigelar",
      "Dufrio",
      "Leveros",
      "Leveros",
    ]);
    // A Leveros por id (proposta) e por nome (lançado avulso) são colunas diferentes.
    expect(week.columns[3]!.proposals).toHaveLength(0);

    const lg = week.rows.find((row) => row.materialId === ids.lg)!;
    expect(lg.cells.map((cell) => cell.unitPriceCents)).toEqual([305000, 309000, 312000]);
    expect(lg.cheapestSupplierKey).toBe(`id:${ids.dufrio}`);
    expect(lg.quantity).toBe(6);
    expect(lg.familyName).toBe("Split hi-wall 9.000 BTU/h");
    expect(week.truncated).toBe(false);
    // Mediana de 6 meses inclui a semana anterior: 299, 305, 309, 312 mil.
    const reference = await asBuyer.query(api.priceEvents.materialReference, {
      materialId: ids.lg,
      now: NOW,
    });
    expect(reference?.medianCents).toBe(307000);

    const midea = week.rows.find((row) => row.materialId === ids.midea)!;
    expect(midea.cells.map((cell) => cell.unitPriceCents)).toEqual([228000, 232000, 235000]);
  });

  test("preço em outra unidade fica numa linha própria, sem disputar o menor", async () => {
    const { ids, asBuyer } = await seedWeek();
    await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.lg,
      supplierId: ids.leveros,
      unitPriceCents: 1000000,
      unit: "cx",
      source: "quote",
      occurredAt: brt(2026, 11, 5),
    });
    const week = await asBuyer.query(api.quoteProposals.week, {
      weekStart: brt(2026, 11, 2, 0),
      now: NOW,
    });
    const lgRows = week.rows.filter((row) => row.materialId === ids.lg);
    expect(lgRows.map((row) => [row.materialUnit, row.cells.length])).toEqual([
      [true, 3],
      [false, 1],
    ]);
    expect(lgRows[1]!.cheapestSupplierKey).toBeNull();
  });

  test("lista as semanas com preços, inteiras e em páginas", async () => {
    const { asBuyer } = await seedWeek();
    const page = await asBuyer.query(api.quoteProposals.listWeeks, { now: NOW });
    expect(page.weeks.map((w) => w.weekStart)).toEqual([
      weekStartOf(brt(2026, 11, 4)),
      weekStartOf(brt(2026, 10, 30)),
    ]);
    expect(page.weeks[0]).toMatchObject({
      priceCount: 6,
      supplierCount: 4,
      materialCount: 2,
      proposalCount: 3,
      truncated: false,
    });

    const first = await asBuyer.query(api.quoteProposals.listWeeks, { now: NOW, limit: 1 });
    expect(first.weeks).toHaveLength(1);
    const second = await asBuyer.query(api.quoteProposals.listWeeks, {
      now: NOW,
      limit: 1,
      before: first.continueBefore!,
    });
    expect(second.weeks.map((w) => w.weekStart)).toEqual([weekStartOf(brt(2026, 10, 30))]);
  });
});

describe("o que entra na referência e no limite da proposta", () => {
  test("estimativas digitadas no takeoff não contam como cotação", async () => {
    const { t, ids, asBuyer } = await seed();
    await asBuyer.mutation(api.priceEvents.add, {
      materialId: ids.lg,
      supplierId: ids.dufrio,
      unitPriceCents: 300000,
      unit: "un",
      source: "quote",
      occurredAt: brt(2026, 11, 2),
    });
    await t.run((ctx) =>
      ctx.db.insert("priceEvents", {
        materialId: ids.lg,
        supplierNameRaw: "RLP Takeoff",
        unitPriceCents: 900000,
        unit: "un",
        source: "manual",
        occurredAt: brt(2026, 11, 3),
        reviewStatus: "unreviewed",
        needsReview: true,
        createdAt: NOW,
      })
    );
    const reference = await asBuyer.query(api.priceEvents.materialReference, {
      materialId: ids.lg,
      now: NOW,
    });
    expect(reference).toMatchObject({ medianCents: 300000, count: 1 });
    const history = await asBuyer.query(api.priceEvents.familyHistory, {
      materialId: ids.lg,
      now: NOW,
    });
    expect(history.quotes.map((q) => q.supplierName)).toEqual(["Dufrio"]);
  });

  test("a referência da família cobre 6 meses mesmo pedindo 1 mês de histórico", async () => {
    const { ids, asBuyer } = await seed();
    const add = (unitPriceCents: number, daysAgo: number) =>
      asBuyer.mutation(api.priceEvents.add, {
        materialId: ids.lg,
        supplierId: ids.dufrio,
        unitPriceCents,
        unit: "un",
        source: "quote",
        occurredAt: NOW - daysAgo * DAY,
      });
    await add(20000, 10);
    await add(10000, 60);
    const history = await asBuyer.query(api.priceEvents.familyHistory, {
      materialId: ids.lg,
      now: NOW,
      monthsBack: 1,
    });
    expect(history.quotes).toHaveLength(1);
    const lg = history.variants.find((v) => v.materialId === ids.lg)!;
    expect(lg.reference?.medianCents).toBe(15000);
  });

  test("ligar preços não passa do limite de linhas da proposta", async () => {
    const { ids, asBuyer } = await seed();
    const { proposalId } = await asBuyer.mutation(api.quoteProposals.create, {
      supplierId: ids.dufrio,
      receivedAt: brt(2026, 11, 6),
      lines: Array.from({ length: 200 }, (_, i) => ({
        rawDescription: `Item ${i}`,
        unitPriceCents: 100 + i,
        unit: "un",
      })),
    });
    const loose = await asBuyer.mutation(api.priceEvents.add, {
      rawDescription: "Item extra",
      supplierId: ids.dufrio,
      unitPriceCents: 999,
      unit: "un",
      source: "quote",
      occurredAt: brt(2026, 11, 6),
    });
    await expect(
      asBuyer.mutation(api.quoteProposals.linkPriceEvents, {
        proposalId,
        priceEventIds: [loose],
      })
    ).rejects.toThrow(/limite|passaria/);
    await expect(
      asBuyer.mutation(api.priceEvents.add, {
        rawDescription: "Outro extra",
        unitPriceCents: 999,
        unit: "un",
        source: "quote",
        occurredAt: brt(2026, 11, 6),
        quoteProposalId: proposalId,
      })
    ).rejects.toThrow(/limite/);
  });
});

describe("histórico da família", () => {
  test("variantes com referência, cotações de todos os fornecedores e variante padrão", async () => {
    const { ids, asBuyer } = await seed();
    const add = (
      materialId: Id<"materials">,
      supplierId: Id<"suppliers">,
      unitPriceCents: number,
      occurredAt: number
    ) =>
      asBuyer.mutation(api.priceEvents.add, {
        materialId,
        supplierId,
        unitPriceCents,
        unit: "un",
        source: "quote",
        occurredAt,
      });
    await add(ids.lg, ids.frigelar, 289000, brt(2026, 5, 12));
    await add(ids.lg, ids.dufrio, 305000, brt(2026, 11, 6));
    await add(ids.lg, ids.leveros, 312000, brt(2026, 11, 7));
    await add(ids.midea, ids.frigelar, 228000, brt(2026, 11, 4));
    // Fora da janela de 12 meses.
    await add(ids.midea, ids.frigelar, 150000, brt(2025, 6, 1));

    await asBuyer.mutation(api.priceEvents.setFamilyDefaultVariant, {
      familyId: ids.familyId,
      materialId: ids.lg,
    });

    const history = await asBuyer.query(api.priceEvents.familyHistory, {
      materialId: ids.midea,
      now: NOW,
    });
    expect(history.family?.name).toBe("Split hi-wall 9.000 BTU/h");
    expect(history.defaultMaterialId).toBe(ids.lg);
    expect(history.variants.map((v) => [v.variantLabel, v.isDefault])).toEqual([
      ["LG · Quente e frio · Inverter", true],
      ["Midea · Só frio · Inverter", false],
    ]);
    expect(history.variants[0]!.reference).toMatchObject({
      medianCents: 305000,
      count: 3,
      supplierCount: 3,
      status: "ok",
    });
    expect(history.quotes).toHaveLength(4);
    expect(history.quotes[0]).toMatchObject({ supplierName: "Leveros", unitPriceCents: 312000 });
  });

  test("a variante padrão precisa ser da família", async () => {
    const { t, ids, asBuyer } = await seed();
    const outsider = await t.run((ctx) =>
      ctx.db.insert("materials", { name: "Outro", active: true, createdAt: NOW })
    );
    await expect(
      asBuyer.mutation(api.priceEvents.setFamilyDefaultVariant, {
        familyId: ids.familyId,
        materialId: outsider,
      })
    ).rejects.toThrow(/variante desta família/);
  });
});
