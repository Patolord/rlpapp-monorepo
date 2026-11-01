import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { PublishDesktopBudgetArgs } from "@rlpapp/shared/takeoff/desktopBudget";
import { setup, withUser } from "./helpers";

const NOW = Date.UTC(2026, 10, 1);

type Args = PublishDesktopBudgetArgs<Id<"projects">>;
type Line = Args["lines"][number];

async function seed() {
  const t = setup();
  const engineer = await withUser(t, {
    clerkId: "engineer",
    name: "Eng. Ana",
    role: "engenheiro",
  });
  const purchasing = await withUser(t, {
    clerkId: "purchasing",
    role: "operator",
    department: "compras",
  });
  const { projectId, materialId, mergedId } = await t.run(async (ctx) => {
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: "Edifício Centro",
      floors: [],
      createdAt: now,
    });
    const familyId = await ctx.db.insert("materialFamilies", {
      name: "Grelha",
      nameNormalized: "grelha",
      baseUnit: "un",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const materialId = await ctx.db.insert("materials", {
      name: "Grelha 300x200",
      familyId,
      identityKey: "grelha-300x200",
      unit: "un",
      active: true,
      status: "active",
      createdAt: now,
    });
    const mergedId = await ctx.db.insert("materials", {
      name: "Grelha 300 x 200 (duplicada)",
      familyId,
      identityKey: "grelha-300x200-dup",
      unit: "un",
      active: false,
      status: "archived",
      mergedIntoId: materialId,
      createdAt: now,
    });
    return { projectId, materialId, mergedId };
  });
  return { t, engineer, purchasing, projectId, materialId, mergedId };
}

function line(id: string, overrides: Partial<Line> = {}): Line {
  return {
    externalLineId: id,
    rawDescription: `Item ${id}`,
    quantity: 10,
    unit: "m",
    estimatedUnitPriceCents: 1000,
    laborUnitPriceCents: 500,
    section: "Térreo",
    sheet: "Exaustão",
    ...overrides,
  };
}

function budget(lines: Line[], overrides: Partial<Args> = {}): Args {
  return {
    externalId: "desk-project-1",
    name: "Proposta 123 - Edifício Centro",
    meta: {
      proposalNumber: "123",
      estimator: "Ana",
      sheets: [
        {
          name: "Exaustão",
          bdi: 1.42,
          extrasPct: 5,
          materialCents: 10000,
          laborCents: 5000,
          extrasEachCents: 250,
          totalCents: 15750,
          proposalCents: 22365,
        },
      ],
    },
    lines,
    ...overrides,
  };
}

describe("takeoffs.publishFromDesktop", () => {
  test("creates a desktop takeoff with its lines and budget metadata", async () => {
    const { engineer, projectId, materialId } = await seed();
    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget(
        [
          line("a", { materialId }),
          line("b", { section: "1º Pavimento", sheet: "Pressurização" }),
        ],
        { projectId }
      )
    );
    expect(result).toMatchObject({
      created: true,
      inserted: 2,
      updated: 0,
      removed: 0,
      kept: [],
      unknownMaterialIds: [],
    });

    const list = await engineer.query(api.takeoffs.list, { projectId });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      source: "desktop",
      externalId: "desk-project-1",
      itemCount: 2,
      publishedByName: "Eng. Ana",
      budget: { proposalNumber: "123", estimator: "Ana" },
    });
    expect(list[0]!.publishedAt).toEqual(expect.any(Number));

    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: result.takeoffId,
      now: NOW,
    });
    expect(detail?.items.map((i) => i.externalLineId)).toEqual(["a", "b"]);
    expect(detail?.items[0]).toMatchObject({
      materialId,
      status: "matched",
      laborUnitPriceCents: 500,
      estimatedUnitPriceCents: 1000,
      sheet: "Exaustão",
      section: "Térreo",
      projectId,
      sortOrder: 0,
    });
    expect(detail?.items[1]).toMatchObject({
      materialId: null,
      status: "draft",
      sheet: "Pressurização",
      section: "1º Pavimento",
    });
  });

  test("republishing updates, inserts and removes lines idempotently", async () => {
    const { engineer } = await seed();
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a"), line("b"), line("c")])
    );

    const same = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a"), line("b"), line("c")])
    );
    expect(same).toMatchObject({
      takeoffId: first.takeoffId,
      created: false,
      inserted: 0,
      updated: 0,
      unchanged: 3,
      removed: 0,
    });

    const second = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("d"), line("a", { quantity: 12.5 }), line("b")], {
        name: "Proposta 123 rev. 1",
      })
    );
    expect(second).toMatchObject({
      takeoffId: first.takeoffId,
      created: false,
      inserted: 1,
      // "a" mudou a quantidade, "b" só a posição
      updated: 2,
      removed: 1,
      kept: [],
    });

    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    expect(detail?.takeoff.name).toBe("Proposta 123 rev. 1");
    expect(detail?.items.map((i) => [i.externalLineId, i.quantity])).toEqual([
      ["d", 10],
      ["a", 12.5],
      ["b", 10],
    ]);
  });

  test("keeps lines purchasing already moved forward or quoted", async () => {
    const { t, engineer, purchasing } = await seed();
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("sent"), line("quoted"), line("plain"), line("frozen")])
    );
    const items = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const byLine = new Map(items!.items.map((i) => [i.externalLineId, i]));

    await engineer.mutation(api.takeoffs.updateItem, {
      itemId: byLine.get("sent")!._id,
      status: "sent_to_supplier",
    });
    await engineer.mutation(api.takeoffs.updateItem, {
      itemId: byLine.get("frozen")!._id,
      status: "purchased",
    });
    await purchasing.mutation(api.priceEvents.add, {
      unitPriceCents: 1100,
      source: "quote",
      occurredAt: NOW,
      supplierNameRaw: "Fornecedor A",
      takeoffItemId: byLine.get("quoted")!._id,
    });

    // "sent", "quoted" e "plain" saem; "frozen" muda a quantidade.
    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("frozen", { quantity: 99 })])
    );
    expect(result.removed).toBe(1);
    expect(result.kept.map((k) => [k.externalLineId, k.reason]).sort()).toEqual([
      ["frozen", "changed_in_desktop"],
      ["quoted", "removed_in_desktop"],
      ["sent", "removed_in_desktop"],
    ]);

    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const after = new Map(detail!.items.map((i) => [i.externalLineId, i]));
    expect(after.has("plain")).toBe(false);
    expect(after.get("frozen")).toMatchObject({
      quantity: 10,
      status: "purchased",
      externalRemovedAt: null,
    });
    expect(after.get("sent")?.externalRemovedAt).toEqual(expect.any(Number));
    expect(after.get("quoted")?.externalRemovedAt).toEqual(expect.any(Number));

    // A linha volta ao orçamento: perde a marca de removida.
    await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("frozen"), line("quoted")])
    );
    const again = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const quoted = again!.items.find((i) => i.externalLineId === "quoted");
    expect(quoted?.externalRemovedAt).toBeNull();

    // Linhas manuais num takeoff do desktop nunca são apagadas.
    await t.run(async (ctx) => {
      await ctx.db.insert("takeoffItems", {
        takeoffId: first.takeoffId,
        rawDescription: "Linha manual",
        status: "draft",
        createdAt: Date.now(),
      });
    });
    const withManual = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("frozen")])
    );
    expect(withManual.removed).toBe(0);
    const final = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    expect(final!.items.some((i) => i.rawDescription === "Linha manual")).toBe(
      true
    );
  });

  test("does not overwrite a quoted line that is still in the budget", async () => {
    const { engineer, purchasing } = await seed();
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("quoted"), line("plain")])
    );
    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const quotedId = detail!.items.find((i) => i.externalLineId === "quoted")!._id;
    await purchasing.mutation(api.priceEvents.add, {
      unitPriceCents: 1100,
      source: "quote",
      occurredAt: NOW,
      supplierNameRaw: "Fornecedor A",
      takeoffItemId: quotedId,
    });

    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([
        line("plain", { quantity: 20 }),
        line("quoted", { quantity: 99, rawDescription: "Outro item", estimatedUnitPriceCents: 1 }),
      ])
    );
    expect(result).toMatchObject({ updated: 1, unchanged: 0 });
    expect(result.kept).toEqual([
      expect.objectContaining({
        externalLineId: "quoted",
        itemId: quotedId,
        reason: "changed_in_desktop",
      }),
    ]);
    const after = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    // cotar não muda o status: a linha continua "matched", mas é da Compras
    expect(after!.items.map((i) => i.externalLineId)).toEqual(["plain", "quoted"]);
    expect(after!.items[1]).toMatchObject({
      status: "matched",
      quantity: 10,
      rawDescription: "Item quoted",
      estimatedUnitPriceCents: 1000,
    });
    expect(after!.items[0]!.quantity).toBe(20);
  });

  test("lines purchasing kept follow the takeoff to another obra", async () => {
    const { t, engineer, purchasing, projectId } = await seed();
    const [otherId, thirdId] = await t.run(async (ctx) =>
      Promise.all(
        ["Obra B", "Obra C"].map((name) =>
          ctx.db.insert("projects", { name, floors: [], createdAt: Date.now() })
        )
      )
    );
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("quoted"), line("sent"), line("plain")], { projectId })
    );
    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const byLine = new Map(detail!.items.map((i) => [i.externalLineId, i._id]));
    await purchasing.mutation(api.priceEvents.add, {
      unitPriceCents: 1100,
      source: "quote",
      occurredAt: NOW,
      supplierNameRaw: "Fornecedor A",
      takeoffItemId: byLine.get("quoted")!,
    });
    await engineer.mutation(api.takeoffs.updateItem, {
      itemId: byLine.get("sent")!,
      status: "sent_to_supplier",
    });

    // cotação lançada de propósito em outra obra e cotação de outro takeoff
    const elsewhereQuote = await purchasing.mutation(api.priceEvents.add, {
      unitPriceCents: 900,
      source: "quote",
      occurredAt: NOW,
      supplierNameRaw: "Fornecedor B",
      takeoffItemId: byLine.get("quoted")!,
      projectId: thirdId,
    });
    const unrelatedQuote = await purchasing.mutation(api.priceEvents.add, {
      unitPriceCents: 800,
      source: "quote",
      occurredAt: NOW,
      supplierNameRaw: "Fornecedor C",
      rawDescription: "Outro item",
      projectId,
    });

    const projectOf = async () =>
      t.run(async (ctx) => {
        const items = await ctx.db
          .query("takeoffItems")
          .withIndex("by_takeoff", (q) => q.eq("takeoffId", first.takeoffId))
          .collect();
        return Object.fromEntries(items.map((i) => [i.externalLineId, i.projectId]));
      });
    const quoteProjects = async () =>
      t.run(async (ctx) => {
        const events = await ctx.db.query("priceEvents").collect();
        return {
          line: events
            .filter((e) => e.takeoffItemId === byLine.get("quoted") && e._id !== elsewhereQuote)
            .map((e) => e.projectId),
          elsewhere: events.find((e) => e._id === elsewhereQuote)?.projectId,
          unrelated: events.find((e) => e._id === unrelatedQuote)?.projectId,
        };
      });
    expect(await quoteProjects()).toEqual({
      line: [projectId],
      elsewhere: thirdId,
      unrelated: projectId,
    });

    // "quoted" sai do orçamento na mesma publicação que muda a obra
    await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("sent"), line("plain")], { projectId: otherId })
    );
    expect(await projectOf()).toEqual({ quoted: otherId, sent: otherId, plain: otherId });
    // as cotações da linha vão com ela; as outras ficam onde estavam
    expect(await quoteProjects()).toEqual({
      line: [otherId],
      elsewhere: thirdId,
      unrelated: projectId,
    });

    // já marcada como removida, continua acompanhando a obra
    await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("plain")], { projectId: thirdId })
    );
    expect(await projectOf()).toEqual({ quoted: thirdId, sent: thirdId, plain: thirdId });
    expect((await quoteProjects()).line).toEqual([thirdId]);
    // a lista de cotações da obra mostra as da linha
    const quotes = await engineer.query(api.priceEvents.list, { now: NOW, projectId: thirdId });
    expect(quotes.map((q) => q.takeoffItemId)).toEqual([
      byLine.get("quoted"),
      byLine.get("quoted"),
    ]);
  });

  test("keeps the line totals the desktop computed until purchasing changes the math", async () => {
    const { engineer } = await seed();
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([
        line("a", {
          quantity: 110,
          estimatedUnitPriceCents: 1235,
          laborUnitPriceCents: 410,
          materialTotalCents: 135795,
          laborTotalCents: 45100,
        }),
        line("b"),
      ])
    );
    const read = async () => {
      const detail = await engineer.query(api.takeoffs.get, {
        takeoffId: first.takeoffId,
        now: NOW,
      });
      return new Map(detail!.items.map((i) => [i.externalLineId, i]));
    };
    let items = await read();
    expect(items.get("a")).toMatchObject({ materialTotalCents: 135795, laborTotalCents: 45100 });
    expect(items.get("b")).toMatchObject({ materialTotalCents: null, laborTotalCents: null });

    // novo preço de material: só o total de material deixa de valer
    await engineer.mutation(api.takeoffs.applySuggestedPrice, {
      itemId: items.get("a")!._id,
      unitPriceCents: 1300,
    });
    items = await read();
    expect(items.get("a")).toMatchObject({ materialTotalCents: null, laborTotalCents: 45100 });

    // nova quantidade: nenhum total vale
    await engineer.mutation(api.takeoffs.updateItem, {
      itemId: items.get("a")!._id,
      quantity: 120,
    });
    items = await read();
    expect(items.get("a")).toMatchObject({ materialTotalCents: null, laborTotalCents: null });

    await expect(
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a", { materialTotalCents: -1 })])
      )
    ).rejects.toThrow("Valor inválido em total de material");
  });

  test("leaves unknown material ids unlinked and follows merges", async () => {
    const { engineer, materialId, mergedId } = await seed();
    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([
        line("bogus", { materialId: "not-a-real-id" }),
        line("merged", { materialId: mergedId }),
        line("seed", { materialId: "seed:grelha-300" }),
      ])
    );
    expect(result.unknownMaterialIds.sort()).toEqual([
      "not-a-real-id",
      "seed:grelha-300",
    ]);
    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: result.takeoffId,
      now: NOW,
    });
    const byLine = new Map(detail!.items.map((i) => [i.externalLineId, i]));
    expect(byLine.get("bogus")).toMatchObject({ materialId: null, status: "draft" });
    expect(byLine.get("merged")).toMatchObject({ materialId, status: "matched" });
  });

  test("keeps a material purchasing linked when the desktop sends none", async () => {
    const { engineer, purchasing } = await seed();
    const first = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a", { rawDescription: "Damper 400x300" })])
    );
    const detail = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    const promoted = await purchasing.mutation(api.takeoffs.promoteItemToMaterial, {
      itemId: detail!.items[0]!._id,
    });
    await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a", { rawDescription: "Damper 400x300", quantity: 3 })])
    );
    const after = await engineer.query(api.takeoffs.get, {
      takeoffId: first.takeoffId,
      now: NOW,
    });
    expect(after!.items[0]).toMatchObject({
      materialId: promoted.materialId,
      quantity: 3,
    });
  });

  test("rejects invalid payloads", async () => {
    const { engineer } = await seed();
    await expect(
      engineer.mutation(api.takeoffs.publishFromDesktop, budget([line("a"), line("a")]))
    ).rejects.toThrow("Linha repetida");
    await expect(
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a", { quantity: -1 })])
      )
    ).rejects.toThrow("Quantidade inválida");
    await expect(
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a")], { externalId: "  " })
      )
    ).rejects.toThrow("id do projeto");
    await expect(
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a", { estimatedUnitPriceCents: -5 })])
      )
    ).rejects.toThrow("Valor inválido");
  });

  test("rejects invalid sheet summaries", async () => {
    const { engineer } = await seed();
    const sheet = budget([]).meta.sheets[0]!;
    const withSheet = (over: Partial<typeof sheet>) =>
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a")], { meta: { sheets: [{ ...sheet, ...over }] } })
      );
    await expect(withSheet({ bdi: -1 })).rejects.toThrow('BDI inválido na aba "Exaustão"');
    await expect(withSheet({ bdi: Number.NaN })).rejects.toThrow("BDI inválido");
    await expect(withSheet({ extrasPct: -5 })).rejects.toThrow(
      "Percentual de extras inválido"
    );
    await expect(withSheet({ totalCents: -1 })).rejects.toThrow("Valor inválido");
    await expect(
      withSheet({ proposalCents: Number.POSITIVE_INFINITY })
    ).rejects.toThrow("Valor inválido");
    // nada foi gravado
    const created = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a")])
    );
    expect(created.created).toBe(true);
  });

  test("accepts only budgets in reais", async () => {
    const { engineer } = await seed();
    const meta = budget([]).meta;
    await expect(
      engineer.mutation(
        api.takeoffs.publishFromDesktop,
        budget([line("a")], { meta: { ...meta, currency: "USD" } })
      )
    ).rejects.toThrow("só recebe orçamentos em reais (BRL)");
    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a")], { meta: { ...meta, currency: " brl " } })
    );
    const list = await engineer.query(api.takeoffs.list, {});
    expect(list.find((x) => x._id === result.takeoffId)?.budget?.currency).toBe("BRL");
  });

  test("handles a few hundred lines in one publication", async () => {
    const { engineer } = await seed();
    const lines = Array.from({ length: 400 }, (_, i) => line(`l${i}`));
    const first = await engineer.mutation(api.takeoffs.publishFromDesktop, budget(lines));
    expect(first.inserted).toBe(400);
    const second = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget(lines.slice(0, 300))
    );
    expect(second).toMatchObject({ unchanged: 300, removed: 100 });
  });

  test("requires engineering permission and writes an audit entry", async () => {
    const { t, engineer, purchasing } = await seed();
    await expect(
      purchasing.mutation(api.takeoffs.publishFromDesktop, budget([line("a")]))
    ).rejects.toThrow("engenharia");
    await expect(
      t.mutation(api.takeoffs.publishFromDesktop, budget([line("a")]))
    ).rejects.toThrow();

    const result = await engineer.mutation(
      api.takeoffs.publishFromDesktop,
      budget([line("a")])
    );
    const logs = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("recordId"), result.takeoffId))
        .collect()
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "create",
      tableName: "takeoffs",
      source: "desktop",
    });
  });

  test("manual takeoffs keep working and are not marked as desktop", async () => {
    const { engineer } = await seed();
    const takeoffId = await engineer.mutation(api.takeoffs.create, { name: "Manual" });
    await engineer.mutation(api.takeoffs.addItem, {
      takeoffId,
      rawDescription: "Tubo cobre",
      quantity: 3,
    });
    const detail = await engineer.query(api.takeoffs.get, { takeoffId, now: NOW });
    expect(detail?.takeoff).toMatchObject({
      source: null,
      externalId: null,
      budget: null,
      publishedAt: null,
      publishedByName: null,
    });
    expect(detail?.items[0]).toMatchObject({
      externalLineId: null,
      sheet: null,
      laborUnitPriceCents: null,
    });
  });
});
