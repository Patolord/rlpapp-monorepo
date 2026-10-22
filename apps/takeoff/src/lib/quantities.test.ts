import { describe, expect, it } from "vitest";
import { buildQuote, itemTotals, measurementQty, pricedQty } from "./quantities";
import { emptyProject, migrateProject, type Project } from "./types";
import { imperialScale, metricScale, ratioLabel, toBaseUnit } from "./units";

const PT_PER_M_AT_1_50 = (1000 / 50) * (72 / 25.4); // 20 mm per metre on paper

function project(): Project {
  const p = emptyProject();
  p.pages = [{ scale: metricScale(50) }, { scale: null }];
  p.items = [
    {
      id: "duct",
      name: "Duto",
      kind: "linear",
      color: "#fff",
      group: "Rede de Dutos",
      materialPrice: 100,
      laborPrice: 40,
      wastePct: 10,
    },
    {
      id: "diff",
      name: "Grelha",
      kind: "count",
      color: "#fff",
      group: "Bocas de Ar",
      materialPrice: 250,
      laborPrice: 0,
      wastePct: 0,
    },
    {
      id: "floor",
      name: "Isolamento",
      kind: "area",
      color: "#fff",
      group: "Rede de Dutos",
      materialPrice: 50,
      laborPrice: 10,
      wastePct: 0,
    },
  ];
  p.measurements = [
    // 4 m long duct on page 0
    {
      id: "m1",
      itemId: "duct",
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: 4 * PT_PER_M_AT_1_50, y: 0 },
      ],
    },
    // duct on uncalibrated page
    {
      id: "m2",
      itemId: "duct",
      page: 1,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    { id: "c1", itemId: "diff", page: 0, points: [{ x: 1, y: 1 }] },
    { id: "c2", itemId: "diff", page: 1, points: [{ x: 1, y: 1 }] },
    // 2 m x 3 m room
    {
      id: "a1",
      itemId: "floor",
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: 2 * PT_PER_M_AT_1_50, y: 0 },
        { x: 2 * PT_PER_M_AT_1_50, y: 3 * PT_PER_M_AT_1_50 },
        { x: 0, y: 3 * PT_PER_M_AT_1_50 },
      ],
    },
  ];
  p.extrasPct = 5;
  p.bdi = 1.4;
  return p;
}

describe("scales", () => {
  it("labels calibrated scales as ratios", () => {
    expect(ratioLabel(metricScale(75).pointsPerUnit, "m")).toBe("1:75");
    expect(ratioLabel(imperialScale("x", 1 / 4).pointsPerUnit, "ft")).toBe("1:48");
    // 3.5 m measured as 132.3 pt on paper -> 1:75
    expect(ratioLabel(132.3 / 3.5, "m")).toBe("1:75");
    expect(ratioLabel(metricScale(62.5).pointsPerUnit, "m")).toBe("1:62.5");
  });

  it("builds metric and imperial scales", () => {
    expect(metricScale(100).pointsPerUnit).toBeCloseTo(28.3465, 3);
    expect(imperialScale("1/4\" = 1'", 1 / 4).pointsPerUnit).toBe(18);
    expect(toBaseUnit(350, "cm", "m")).toBeCloseTo(3.5);
    expect(toBaseUnit(12, "in", "ft")).toBeCloseTo(1);
  });
});

describe("quantities", () => {
  it("returns null for scaled kinds on uncalibrated pages", () => {
    const m = {
      id: "x",
      itemId: "duct",
      page: 1,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    expect(measurementQty(m, "linear", null)).toBeNull();
    expect(measurementQty(m, "count", null)).toBe(1);
  });

  it("totals items per kind", () => {
    const t = itemTotals(project());
    expect(t.get("duct")?.qty).toBeCloseTo(4);
    expect(t.get("duct")?.unscaled).toBe(1);
    expect(t.get("diff")?.qty).toBe(2);
    expect(t.get("floor")?.qty).toBeCloseTo(6);
  });

  it("applies waste and rounds counts up", () => {
    const p = project();
    expect(pricedQty(p.items[0], 4)).toBe(4.4);
    expect(pricedQty({ ...p.items[1], wastePct: 10 }, 2)).toBe(3);
  });

  it("groups lines and prices the sheet with extras and BDI", () => {
    const q = buildQuote(project());
    expect(q.groups.map((g) => g.name)).toEqual(["Rede de Dutos", "Bocas de Ar"]);
    const duct = q.groups[0].lines[0];
    expect(duct.qty).toBeCloseTo(4.4);
    expect(duct.material).toBeCloseTo(440);
    expect(duct.labor).toBeCloseTo(176);
    expect(q.material).toBeCloseTo(440 + 500 + 300);
    expect(q.labor).toBeCloseTo(176 + 60);
    const subtotal = 1240 + 236;
    expect(q.subtotal).toBeCloseTo(subtotal);
    expect(q.extraEach).toBeCloseTo((subtotal * 0.05) / 3, 2);
    expect(q.totalGeral).toBeCloseTo(subtotal + q.extraEach * 3, 2);
    expect(q.proposal).toBeCloseTo(q.totalGeral * 1.4, 1);
  });
});

describe("migration", () => {
  it("upgrades version 1 projects", () => {
    const v1 = {
      version: 1,
      name: "old",
      pdfPath: null,
      pdfName: "",
      unit: "m",
      currency: "BRL",
      markupPct: 30,
      taxPct: 0,
      pages: [],
      items: [{ id: "a", name: "X", kind: "count", color: "#000", unitPrice: 12, wastePct: 0 }],
      measurements: [],
    };
    const p = migrateProject(v1);
    expect(p.version).toBe(2);
    expect(p.bdi).toBeCloseTo(1.3);
    expect(p.items[0].materialPrice).toBe(12);
    expect(p.items[0].group).toBe("Geral");
    expect(() => migrateProject({ version: 9 })).toThrow();
  });
});

describe("zones", () => {
  it("assigns measurements to the smallest containing zone and builds the matrix", async () => {
    const { totalsByZone, zoneMatrix, NO_ZONE } = await import("./quantities");
    const p = project();
    const big = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    const small = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    p.zones = [
      { id: "zb", name: "Térreo", page: 0, points: big, color: "#fff" },
      { id: "zs", name: "Hall", page: 0, points: small, color: "#fff" },
    ];
    const by = totalsByZone(p);
    // count c1 at (1,1) on page 0 -> inside both, smallest wins (Hall)
    expect(by.get("zs")?.get("diff")?.qty).toBe(1);
    // duct m1 midpoint (~113,0) on page 0 -> Térreo; m2 is on page 1 -> no zone
    expect(by.get("zb")?.get("duct")?.qty).toBeCloseTo(4);
    expect(by.get(NO_ZONE)?.get("duct")?.unscaled).toBe(1);
    expect(by.get(NO_ZONE)?.get("diff")?.qty).toBe(1);
    const m = zoneMatrix(p);
    expect(m.columns.map((c) => c.name)).toEqual(["Térreo", "Hall", "Sem local"]);
    const duct = m.rows.find((r) => r.item.id === "duct")!;
    expect(duct.qty[0]).toBeCloseTo(4.4);
    expect(duct.total).toBeCloseTo(4.4);
  });
});
