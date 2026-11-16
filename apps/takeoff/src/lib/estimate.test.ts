import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "./catalog";
import { applyEstimate, type Estimate, estimateLines } from "./estimate";
import type { Kit } from "./kits";
import { itemTotals } from "./quantities";
import { emptyProject, type Item, type Project } from "./types";

const LINE_SET: Kit = {
  id: "kit-12-000-inverter",
  name: "12.000 Inverter",
  mode: "linear",
  components: [
    {
      name: 'Tubulação de Cobre 1/4"',
      group: "Tubulações",
      system: "Infra AC",
      kind: "linear",
      factor: 1,
    },
    {
      name: 'Tubulação de Cobre 3/8"',
      group: "Tubulações",
      system: "Infra AC",
      kind: "linear",
      factor: 1,
    },
    { name: "Cabo PP 5x1,5 mm²", group: "Elétrica", system: "Infra AC", kind: "linear", factor: 2 },
    { name: "Kit dreno", group: "Tubulações", system: "Infra AC", kind: "count", factor: 1 },
  ],
};

const EQUIP: Kit = {
  id: "kit-split-12000-equip",
  name: "Split 12.000 · equipamento",
  mode: "count",
  components: [
    {
      name: "Split Hi Wall 12.000 Btu/h",
      group: "Equipamentos",
      system: "AC com Equip",
      kind: "count",
      factor: 1,
    },
    {
      name: "Suporte da Evaporadora",
      group: "Equipamentos",
      system: "AC com Equip",
      kind: "count",
      factor: 2,
    },
    {
      name: 'Tubulação de Cobre 1/4"',
      group: "Tubulações",
      system: "Infra AC",
      kind: "linear",
      factor: 3,
    },
  ],
};

const KITS = [LINE_SET, EQUIP];

const CATALOG: CatalogEntry[] = [
  {
    name: 'Tubulação de Cobre 1/4"',
    group: "Tubulações",
    unit: "m",
    materialPrice: 30,
    laborPrice: 10,
    source: "remote",
    catalogId: "cat-1",
    sku: "MAT-1",
  },
];

const estimate = (units: number, extra: Partial<Estimate> = {}): Estimate => ({
  units,
  rows: [
    { id: "a", source: { type: "kit", kitId: LINE_SET.id }, perUnit: 20 },
    { id: "b", source: { type: "kit", kitId: EQUIP.id }, perUnit: 1 },
    {
      id: "c",
      source: { type: "material", name: "Instalação de split", kind: "count" },
      perUnit: 1,
    },
  ],
  ...extra,
});

const qtyOf = (lines: { name: string; qty: number }[], name: string) =>
  lines.find((l) => l.name === name)?.qty;

describe("estimateLines", () => {
  it("multiplies each assumption by the units and merges the same material", () => {
    const lines = estimateLines(estimate(10), KITS);
    // 10 × 20 m from the line set + 10 × 3 m per equipment set
    expect(qtyOf(lines, 'Tubulação de Cobre 1/4"')).toBe(230);
    expect(qtyOf(lines, 'Tubulação de Cobre 3/8"')).toBe(200);
    // the cable runs both ways
    expect(qtyOf(lines, "Cabo PP 5x1,5 mm²")).toBe(400);
    // a count part of a run kit comes once per run
    expect(qtyOf(lines, "Kit dreno")).toBe(10);
    expect(qtyOf(lines, "Split Hi Wall 12.000 Btu/h")).toBe(10);
    expect(qtyOf(lines, "Suporte da Evaporadora")).toBe(20);
    expect(qtyOf(lines, "Instalação de split")).toBe(10);
    expect(lines.filter((l) => l.name === 'Tubulação de Cobre 1/4"')).toHaveLength(1);
  });

  it("leaves out rows of missing kits, blank materials and zero quantities", () => {
    const lines = estimateLines(
      {
        units: 4,
        rows: [
          { id: "a", source: { type: "kit", kitId: "gone" }, perUnit: 20 },
          { id: "b", source: { type: "material", name: "  ", kind: "count" }, perUnit: 1 },
          { id: "c", source: { type: "material", name: "Dreno", kind: "linear" }, perUnit: 0 },
          {
            id: "d",
            source: { type: "material", name: "Dreno PVC", kind: "linear" },
            perUnit: 2.5,
          },
        ],
      },
      KITS,
    );
    expect(lines).toEqual([{ name: "Dreno PVC", group: "", kind: "linear", qty: 10 }]);
  });

  it("generates nothing for zero units", () => {
    expect(estimateLines(estimate(0), KITS)).toEqual([]);
  });
});

describe("applyEstimate", () => {
  const project = (): Project => ({ ...emptyProject(), system: "Infra AC" });

  it("creates the lines a drawn kit would, priced from the catalog, with typed quantities", () => {
    const lines = estimateLines(estimate(2), KITS);
    const { project: p, results } = applyEstimate(project(), lines, { remote: [] }, CATALOG);
    expect(results.every((r) => r.created)).toBe(true);
    const copper = p.items.find((i) => i.name === 'Tubulação de Cobre 1/4"') as Item;
    expect(copper).toMatchObject({ materialPrice: 30, laborPrice: 10, manualQty: 46 });
    const cable = p.items.find((i) => i.name === "Cabo PP 5x1,5 mm²") as Item;
    // the kit's factor stays on the line (later drawn runs count alike); the typed qty has it
    expect(cable).toMatchObject({
      factor: 2,
      manualQty: 80,
      group: "Elétrica",
      system: "Infra AC",
    });
    const free = p.items.find((i) => i.name === "Instalação de split") as Item;
    expect(free).toMatchObject({
      kind: "count",
      manualQty: 2,
      materialPrice: 0,
      system: "Infra AC",
    });
    // the budget counts the typed quantities with no marking at all
    expect(itemTotals(p).get(cable.id)?.qty).toBe(80);
  });

  it("adds to the lines already in the takeoff instead of duplicating them", () => {
    const first = applyEstimate(
      project(),
      estimateLines(estimate(2), KITS),
      { remote: [] },
      CATALOG,
    );
    const second = applyEstimate(
      first.project,
      estimateLines(estimate(3), KITS),
      { remote: [] },
      CATALOG,
    );
    expect(second.results.every((r) => !r.created)).toBe(true);
    expect(second.project.items).toHaveLength(first.project.items.length);
    const cable = second.project.items.find((i) => i.name === "Cabo PP 5x1,5 mm²");
    expect(cable?.manualQty).toBe(200);
  });

  it("with a discipline set, puts every line on that tab and keeps other tabs' lines apart", () => {
    const first = applyEstimate(
      project(),
      estimateLines(estimate(1), KITS),
      { remote: [] },
      CATALOG,
    );
    const { project: p, results } = applyEstimate(
      first.project,
      estimateLines(estimate(1), KITS),
      { remote: [] },
      CATALOG,
      "AC Pesado",
    );
    expect(results.every((r) => r.created && r.item.system === "AC Pesado")).toBe(true);
    expect(p.items.filter((i) => i.name === "Kit dreno").map((i) => i.system)).toEqual([
      "Infra AC",
      "AC Pesado",
    ]);
  });

  it("never adds to a derived line (duct network, VRF system)", () => {
    const base = project();
    const vrf: Item = {
      id: "v",
      name: "Instalação de split",
      kind: "count",
      color: "#fff",
      group: "Sistema VRF",
      materialPrice: 0,
      laborPrice: 0,
      wastePct: 0,
      manualQty: 1,
      derived: "vrf",
    };
    const { project: p } = applyEstimate(
      { ...base, items: [vrf] },
      [{ name: "Instalação de split", group: "", kind: "count", qty: 4 }],
      { remote: [] },
      [],
    );
    expect(p.items.find((i) => i.id === "v")?.manualQty).toBe(1);
    expect(p.items).toHaveLength(2);
  });
});
