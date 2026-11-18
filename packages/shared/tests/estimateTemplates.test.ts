import { describe, expect, it } from "vitest";
import type { EstimateLine } from "../src/takeoff/estimate";
import {
  BATHROOM_EXHAUST_TEMPLATE,
  capacityOf,
  newTableRow,
  SPLIT_TEMPLATE,
  type TableRow,
  type TemplateValues,
  templateValues,
} from "../src/takeoff/estimateTemplates";
import { SEED_KITS } from "../src/takeoff/kits";

const split = (v: TemplateValues) =>
  SPLIT_TEMPLATE.lines(
    { ...templateValues(SPLIT_TEMPLATE, undefined, SEED_KITS), ...v },
    SEED_KITS,
  );

const byName = (lines: EstimateLine[], name: string) => lines.find((l) => l.name === name);

const machine = (r: TableRow): TableRow => ({
  type: "Hi Wall",
  lineSet: "kit-12-000-inverter",
  qty: 1,
  meters: 8,
  price: 0,
  ...r,
});

describe("split installation", () => {
  it("sizes each machine's line set by its capacity and sums the job", () => {
    // the Lorena job: 1 hi-wall 18k, 2 hi-wall 24k, 2 cassettes 18k
    const lines = split({
      machines: [
        machine({ lineSet: "kit-18-000-inverter", qty: 1, meters: 10 }),
        machine({ lineSet: "kit-24-000-inverter", qty: 2, meters: 12 }),
        machine({ type: "Cassete", lineSet: "kit-18-000-inverter", qty: 2, meters: 12 }),
      ],
    });
    expect(byName(lines, 'Tubulação de Cobre 1/4"')?.qty).toBe(10 + 24);
    expect(byName(lines, 'Tubulação de Cobre 1/2"')?.qty).toBe(34);
    expect(byName(lines, 'Tubulação de Cobre 3/8"')?.qty).toBe(24);
    expect(byName(lines, 'Isolamento Polipex 5/8"')?.qty).toBe(24);
    // interconnect cable both ways
    expect(byName(lines, "Cabo PP 5x1,5 mm²")?.qty).toBe(2 * (34 + 24));
    expect(byName(lines, "Split Hi Wall 18.000 Btu/h")?.qty).toBe(1);
    expect(byName(lines, "Split Hi Wall 24.000 Btu/h")?.qty).toBe(2);
    expect(byName(lines, "Split Cassete 18.000 Btu/h")?.qty).toBe(2);
    // the machines come after every line material
    const firstMachine = lines.findIndex((l) => l.name.startsWith("Split"));
    expect(firstMachine).toBeGreaterThan(lines.findIndex((l) => l.name.startsWith("Cabo")));
    expect(lines.slice(firstMachine).every((l) => l.group === "Equipamentos")).toBe(true);
    // drain, brackets and pads are out of scope
    expect(lines.some((l) => /dreno|Suporte/i.test(l.name))).toBe(false);
    // no labour line unless a rate is typed
    expect(lines.some((l) => l.group === "Mão de Obra")).toBe(false);
  });

  it("charges labour per evaporator, whatever the length, and mobilisation once", () => {
    const lines = split({
      machines: [machine({ qty: 3, meters: 5 }), machine({ qty: 2, meters: 30 })],
      labor: 450,
      mobilization: 800,
    });
    expect(byName(lines, "Mão de obra instalação de evaporadora")).toMatchObject({
      qty: 5,
      price: { material: 0, labor: 450 },
    });
    expect(byName(lines, "Mobilização e deslocamento")).toMatchObject({
      qty: 1,
      price: { material: 0, labor: 800 },
    });
  });

  it("prices the machine as typed, else from the catalog, or leaves it out", () => {
    const typed = split({ machines: [machine({ qty: 3, price: 2500 })] });
    expect(byName(typed, "Split Hi Wall 12.000 Btu/h")).toMatchObject({
      qty: 3,
      price: { material: 2500 },
    });
    expect(byName(split({}), "Split Hi Wall 12.000 Btu/h")?.price).toBeUndefined();
    const without = split({ machine: false });
    expect(without.some((l) => l.name.startsWith("Split"))).toBe(false);
    expect(without.length).toBeGreaterThan(0);
  });

  it("generates nothing without machines", () => {
    expect(split({ machines: [machine({ qty: 0 })], labor: 450 })).toEqual([]);
  });

  it("reads the capacity off a line-set kit's name", () => {
    expect(capacityOf({ name: "24.000 Convencional" })).toBe("24.000");
    expect(capacityOf({ name: "Piso-teto" })).toBeUndefined();
  });
});

describe("bathroom exhaust", () => {
  const values = (v: TemplateValues) => ({
    ...templateValues(BATHROOM_EXHAUST_TEMPLATE, undefined, []),
    ...v,
  });

  it("generates fan, duct, clamps, grille and cap per bathroom at the duct diameter", () => {
    const lines = BATHROOM_EXHAUST_TEMPLATE.lines(
      values({ units: 8, diameter: "125", meters: 4, fanPrice: 180, labor: 120 }),
      [],
    );
    expect(lines.map((l) => [l.name, l.qty])).toEqual([
      ["Exaustor para banheiro Ø125 mm", 8],
      ["Duto flexível de alumínio Ø125 mm", 32],
      ["Abraçadeira Ø125 mm", 16],
      ["Grelha de exaustão Ø125 mm", 8],
      ["Terminal de exaustão (chapéu) Ø125 mm", 8],
      ["Mão de obra instalação de exaustor", 8],
    ]);
    expect(lines[0].price).toEqual({ material: 180 });
    expect(lines.every((l) => l.system === "Exaustão")).toBe(true);
  });
});

describe("templateValues", () => {
  it("keeps saved values of the right type and an option that still exists", () => {
    const v = templateValues(
      SPLIT_TEMPLATE,
      {
        machines: [{ type: "Janela", lineSet: "kit-gone", qty: 4, meters: -3 }],
        machine: "yes",
        labor: 300,
      },
      SEED_KITS,
    );
    expect(v).toMatchObject({
      machines: [{ type: "Hi Wall", lineSet: "kit-12-000-inverter", qty: 4, meters: 8, price: 0 }],
      machine: true,
      labor: 300,
    });
  });

  it("starts a table with one row and adds a copy of the last", () => {
    const v = templateValues(SPLIT_TEMPLATE, undefined, SEED_KITS);
    expect(v.machines).toEqual([machine({})]);
    const table = SPLIT_TEMPLATE.params.find((p) => p.type === "table");
    if (table?.type !== "table") throw new Error("no table");
    const last = machine({ type: "Cassete", lineSet: "kit-24-000-inverter", qty: 2 });
    expect(newTableRow(table, [machine({}), last], SEED_KITS)).toEqual(last);
  });
});
