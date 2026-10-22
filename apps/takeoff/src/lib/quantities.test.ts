import { describe, expect, it } from "vitest";
import {
  buildQuote,
  itemTotals,
  measurementQty,
  NO_ZONE,
  pricedQty,
  systemSheets,
  totalsByZone,
  zoneMatrix,
} from "./quantities";
import { emptyProject, migrateProject, type Project } from "./types";
import { imperialScale, metricScale, ratioLabel, toBaseUnit } from "./units";

const PT_PER_M_AT_1_50 = (1000 / 50) * (72 / 25.4); // 20 mm per metre on paper
const D1 = "d1";

function project(): Project {
  const p = emptyProject();
  p.drawings = [
    {
      id: D1,
      path: null,
      name: "planta.pdf",
      pages: [{ scale: metricScale(50) }, { scale: null }],
    },
  ];
  p.activeDrawingId = D1;
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
      drawingId: D1,
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
      drawingId: D1,
      page: 1,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    { id: "c1", itemId: "diff", drawingId: D1, page: 0, points: [{ x: 1, y: 1 }] },
    { id: "c2", itemId: "diff", drawingId: D1, page: 1, points: [{ x: 1, y: 1 }] },
    // 2 m x 3 m room
    {
      id: "a1",
      itemId: "floor",
      drawingId: D1,
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

const square = (s: number) => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: s },
  { x: 0, y: s },
];

describe("scales", () => {
  it("labels calibrated scales as ratios", () => {
    expect(ratioLabel(metricScale(75).pointsPerUnit, "m")).toBe("1:75");
    expect(ratioLabel(imperialScale("x", 1 / 4).pointsPerUnit, "ft")).toBe("1:48");
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
      drawingId: D1,
      page: 1,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    expect(measurementQty(m, "linear", null)).toBeNull();
    expect(measurementQty(m, "count", null)).toBe(1);
  });

  it("totals items per kind across drawings", () => {
    const p = project();
    // a second drawing with its own scale and one more duct
    p.drawings.push({
      id: "d2",
      path: null,
      name: "outra.pdf",
      pages: [{ scale: metricScale(100) }],
    });
    p.measurements.push({
      id: "m3",
      itemId: "duct",
      drawingId: "d2",
      page: 0,
      points: [
        { x: 0, y: 0 },
        { x: (1000 / 100) * (72 / 25.4) * 2, y: 0 }, // 2 m at 1:100
      ],
    });
    const t = itemTotals(p);
    expect(t.get("duct")?.qty).toBeCloseTo(6);
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
    const subtotal = 1240 + 236;
    expect(q.subtotal).toBeCloseTo(subtotal);
    expect(q.extraEach).toBeCloseTo((subtotal * 0.05) / 3, 2);
    expect(q.totalGeral).toBeCloseTo(subtotal + q.extraEach * 3, 2);
    expect(q.proposal).toBeCloseTo(q.totalGeral * 1.4, 1);
  });
});

describe("zones", () => {
  it("assigns measurements to the smallest containing zone of the same drawing", () => {
    const p = project();
    p.zones = [
      { id: "zb", name: "Térreo", drawingId: D1, page: 0, points: square(1000), color: "#fff" },
      { id: "zs", name: "Hall", drawingId: D1, page: 0, points: square(10), color: "#fff" },
      // same geometry on another drawing must not capture d1 measurements
      { id: "zx", name: "Outro", drawingId: "d2", page: 0, points: square(5), color: "#fff" },
    ];
    const by = totalsByZone(p);
    expect(by.get("zs")?.get("diff")?.qty).toBe(1);
    expect(by.get("zb")?.get("duct")?.qty).toBeCloseTo(4);
    expect(by.get("zx")).toBeUndefined();
    expect(by.get(NO_ZONE)?.get("duct")?.unscaled).toBe(1);
    const m = zoneMatrix(p);
    expect(m.columns.map((c) => c.name)).toEqual(["Térreo", "Hall", "Outro", "Sem local"]);
    expect(m.rows.find((r) => r.item.id === "duct")?.total).toBeCloseTo(4.4);
  });
});

describe("system sheets", () => {
  it("splits items into one sheet per system and sections per location or group", () => {
    const p = project();
    p.system = "Pressurização";
    p.items[1] = { ...p.items[1], system: "Exaustão" };
    p.zones = [
      { id: "z", name: "Térreo", drawingId: D1, page: 0, points: square(1000), color: "#fff" },
    ];
    p.sectionsBy = "local";
    const sheets = systemSheets(p);
    expect(sheets.map((s) => s.system)).toEqual(["Pressurização", "Exaustão"]);
    expect(sheets[0].sections.map((s) => s.name)).toEqual(["Térreo"]);
    expect(sheets[0].sections[0].rows.map((r) => [r.item.id, r.qty])).toEqual([
      ["duct", 4.4],
      ["floor", 6],
    ]);
    expect(sheets[1].sections.map((s) => s.name)).toEqual(["Térreo", "Sem local"]);
    p.sectionsBy = "grupo";
    expect(systemSheets(p)[0].sections.map((s) => s.name)).toEqual(["Rede de Dutos"]);
  });
});

describe("migration", () => {
  it("upgrades version 1 and 2 projects into a single drawing", () => {
    const v2 = {
      version: 2,
      name: "old",
      pdfPath: "C:\\obra\\planta.pdf",
      pdfName: "planta.pdf",
      unit: "m",
      currency: "BRL",
      bdi: 1.3,
      pages: [{ scale: null }],
      items: [
        {
          id: "a",
          name: "X",
          kind: "count",
          color: "#000",
          group: "Geral",
          materialPrice: 12,
          laborPrice: 0,
          wastePct: 0,
        },
      ],
      measurements: [{ id: "m", itemId: "a", page: 0, points: [{ x: 1, y: 1 }] }],
      zones: [{ id: "z", name: "T", page: 0, points: square(10), color: "#fff" }],
    };
    const p = migrateProject(v2);
    expect(p.version).toBe(3);
    expect(p.drawings).toHaveLength(1);
    expect(p.drawings[0].path).toBe("C:\\obra\\planta.pdf");
    expect(p.activeDrawingId).toBe(p.drawings[0].id);
    expect(p.measurements[0].drawingId).toBe(p.drawings[0].id);
    expect(p.zones[0].drawingId).toBe(p.drawings[0].id);
    expect(p.bdi).toBeCloseTo(1.3);
    const v1 = {
      version: 1,
      name: "v1",
      pdfPath: null,
      markupPct: 30,
      pages: [],
      items: [{ id: "a", name: "X", kind: "count", color: "#000", unitPrice: 5, wastePct: 0 }],
      measurements: [],
    };
    const q = migrateProject(v1);
    expect(q.drawings).toHaveLength(0);
    expect(q.items[0].materialPrice).toBe(5);
    expect(q.bdi).toBeCloseTo(1.3);
    expect(() => migrateProject({ version: 9 })).toThrow();
  });
});
