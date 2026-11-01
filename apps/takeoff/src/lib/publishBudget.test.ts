import { describe, expect, it } from "vitest";
import { newDuctNetwork } from "./ductItems";
import { budgetLineId, buildPublishBudget } from "./publishBudget";
import { emptyProject, type Item, type Project } from "./types";
import { metricScale } from "./units";

const item = (over: Partial<Item> & { id: string }): Item => ({
  name: over.id,
  kind: "linear",
  color: "#fff",
  group: "Rede de Dutos",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  ...over,
});

/** Items quantified by hand (`manualQty`), grouped by item group: no drawing needed. */
function project(): Project {
  const p = emptyProject();
  p.name = "Edifício Centro";
  p.client = "Construtora X";
  p.site = "Rua A, 10";
  p.proposalNumber = " 123/26 ";
  p.estimator = "Ana";
  p.system = "Exaustão";
  p.sectionsBy = "grupo";
  p.bdi = 1.42;
  p.extrasPct = 5;
  p.disciplines = { Pressurização: { bdi: 1.25 } };
  p.items = [
    item({
      id: "duto",
      name: "Duto galvanizado",
      unit: "kg",
      materialPrice: 12.345,
      laborPrice: 4.1,
      manualQty: 100,
      wastePct: 10,
      catalogId: "mat_123",
    }),
    item({
      id: "grelha",
      name: "Grelha 300x200",
      kind: "count",
      group: "Bocas de Ar",
      materialPrice: 250,
      laborPrice: 30,
      manualQty: 3,
    }),
    item({
      id: "damper",
      name: "Damper corta-fogo",
      kind: "count",
      group: "Bocas de Ar",
      system: "Pressurização",
      materialPrice: 900.5,
      laborPrice: 120,
      manualQty: 2,
    }),
  ];
  return p;
}

describe("buildPublishBudget", () => {
  it("flattens sheets and sections into lines with cents prices and catalog links", () => {
    const args = buildPublishBudget(project(), { externalId: "proj-1", projectId: "obra-1" });
    expect(args.externalId).toBe("proj-1");
    expect(args.projectId).toBe("obra-1");
    expect(args.name).toBe("Edifício Centro");
    expect(args.lines).toEqual([
      {
        externalLineId: "duto|exaustão|rede de dutos",
        rawDescription: "Duto galvanizado",
        quantity: 110,
        unit: "kg",
        materialId: "mat_123",
        estimatedUnitPriceCents: 1235,
        laborUnitPriceCents: 410,
        section: "Rede de Dutos",
        sheet: "Exaustão",
      },
      {
        externalLineId: "grelha|exaustão|bocas de ar",
        rawDescription: "Grelha 300x200",
        quantity: 3,
        unit: "pç",
        materialId: undefined,
        estimatedUnitPriceCents: 25000,
        laborUnitPriceCents: 3000,
        section: "Bocas de Ar",
        sheet: "Exaustão",
      },
      {
        externalLineId: "damper|pressurização|bocas de ar",
        rawDescription: "Damper corta-fogo",
        quantity: 2,
        unit: "pç",
        materialId: undefined,
        estimatedUnitPriceCents: 90050,
        laborUnitPriceCents: 12000,
        section: "Bocas de Ar",
        sheet: "Pressurização",
      },
    ]);
  });

  it("carries the header and the totals of each discipline tab in cents", () => {
    const args = buildPublishBudget(project(), { externalId: "proj-1" });
    expect(args).not.toHaveProperty("projectId");
    expect(args.meta).toMatchObject({
      proposalNumber: "123/26",
      estimator: "Ana",
      client: "Construtora X",
      site: "Rua A, 10",
      system: "Exaustão",
      currency: "BRL",
    });
    const exaustao = args.meta.sheets.find((s) => s.name === "Exaustão");
    // material 110 × 12.345 = 1357.95 (+ grelhas 750); labour 110 × 4.1 = 451 (+ 90)
    expect(exaustao).toEqual({
      name: "Exaustão",
      bdi: 1.42,
      extrasPct: 5,
      materialCents: 210795,
      laborCents: 54100,
      extrasEachCents: 4415,
      totalCents: 278140,
      proposalCents: 394959,
    });
    const press = args.meta.sheets.find((s) => s.name === "Pressurização");
    expect(press?.bdi).toBe(1.25);
    expect(press?.materialCents).toBe(180100);
  });

  it("keeps line ids stable across publications and edits that do not move the item", () => {
    const p = project();
    const before = buildPublishBudget(p, { externalId: "x" }).lines.map((l) => l.externalLineId);
    p.items[0]!.materialPrice = 15;
    p.items[0]!.manualQty = 200;
    p.items[1]!.name = "Grelha 300x200 (rev)";
    const after = buildPublishBudget(p, { externalId: "x" }).lines.map((l) => l.externalLineId);
    expect(after).toEqual(before);

    // another tab means another line
    p.items[1]!.system = "Pressurização";
    const moved = buildPublishBudget(p, { externalId: "x" }).lines.map((l) => l.externalLineId);
    expect(moved).toContain("grelha|pressurização|bocas de ar");
    expect(moved).not.toContain("grelha|exaustão|bocas de ar");
  });

  it("ignores case and spaces of tab and section names in line ids", () => {
    expect(budgetLineId("a", " Exaustão ", "Térreo")).toBe(budgetLineId("a", "exaustão", "TÉRREO"));
  });

  it("falls back to the proposal number when the project has no name", () => {
    const p = project();
    p.name = emptyProject().name;
    expect(buildPublishBudget(p, { externalId: "x" }).name).toBe("123/26");
    p.proposalNumber = "";
    expect(buildPublishBudget(p, { externalId: "x" }).name).toBe("Orçamento desktop");
  });

  it("publishes quantities typed by hand under Sem local when sections are locations", () => {
    const p = project();
    p.items[0]!.materialPrice = 12.5; // whole cents: only the missing lines may differ
    p.sectionsBy = "local";
    p.drawings = [{ id: "d", path: null, name: "planta.pdf", pages: [{ scale: metricScale(50) }] }];
    p.locations = [{ id: "l", name: "Térreo", color: "#fff" }];
    p.zones = [
      {
        id: "z",
        locationId: "l",
        drawingId: "d",
        page: 0,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
    ];
    const network = { ...newDuctNetwork(p), materialPrice: 5000, laborPrice: 1200 };
    p.items.push(network);
    p.measurements = [
      { id: "m", itemId: "grelha", drawingId: "d", page: 0, points: [{ x: 5, y: 5 }] },
    ];

    const args = buildPublishBudget(p, { externalId: "x" });
    expect(args.lines.find((l) => l.rawDescription === network.name)).toMatchObject({
      section: "Sem local",
      quantity: 1,
      unit: "cj",
    });
    // the lines add up to the tab summaries the dashboard shows next to them
    for (const sheet of args.meta.sheets) {
      const lines = args.lines.filter((l) => l.sheet === sheet.name);
      const material = lines.reduce(
        (sum, l) => sum + Math.round(l.quantity * (l.estimatedUnitPriceCents ?? 0)),
        0,
      );
      expect(material).toBe(sheet.materialCents);
    }
  });

  it("refuses to publish a budget priced in another currency", () => {
    const p = project();
    p.currency = "USD";
    expect(() => buildPublishBudget(p, { externalId: "x" })).toThrow(
      /USD.*só recebe orçamentos em reais \(BRL\)/,
    );
    p.currency = "brl";
    expect(buildPublishBudget(p, { externalId: "x" }).meta.currency).toBe("brl");
  });

  it("produces unique line ids", () => {
    const args = buildPublishBudget(project(), { externalId: "x" });
    const ids = args.lines.map((l) => l.externalLineId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
