import { describe, expect, it } from "vitest";
import {
  buildQuote,
  itemTotals,
  locationMatrix,
  measurementQty,
  NO_LOCATION,
  pricedQty,
  systemSheets,
  totalsByLocation,
  totalsByRegion,
} from "./quantities";
import { emptyProject, type Project } from "./types";
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

  it("counts the fixed length of a one-click linear mark, even on an uncalibrated page", () => {
    const p = project();
    p.measurements = [
      { id: "k1", itemId: "duct", drawingId: D1, page: 1, points: [{ x: 5, y: 5 }], vertical: 3 },
      { id: "k2", itemId: "duct", drawingId: D1, page: 0, points: [{ x: 9, y: 9 }], vertical: 3 },
    ];
    expect(measurementQty(p.measurements[0], "linear", null)).toBe(0);
    const t = itemTotals(p).get("duct");
    expect(t?.qty).toBeCloseTo(6);
    expect(t?.unscaled).toBe(0);
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

describe("locations", () => {
  it("assigns measurements to the smallest containing region of the same drawing", () => {
    const p = project();
    p.locations = [
      { id: "lb", name: "Térreo", color: "#fff" },
      { id: "ls", name: "Hall", color: "#fff" },
      { id: "lx", name: "Outro", color: "#fff" },
    ];
    p.zones = [
      { id: "zb", locationId: "lb", drawingId: D1, page: 0, points: square(1000) },
      { id: "zs", locationId: "ls", drawingId: D1, page: 0, points: square(10) },
      // same geometry on another drawing must not capture d1 measurements
      { id: "zx", locationId: "lx", drawingId: "d2", page: 0, points: square(5) },
    ];
    const by = totalsByLocation(p);
    expect(by.get("ls")?.get("diff")?.qty).toBe(1);
    expect(by.get("lb")?.get("duct")?.qty).toBeCloseTo(4);
    expect(by.get("lx")).toBeUndefined();
    expect(by.get(NO_LOCATION)?.get("duct")?.unscaled).toBe(1);
    const m = locationMatrix(p);
    expect(m.columns.map((c) => c.name)).toEqual(["Térreo", "Hall", "Outro", "Sem local"]);
    expect(m.rows.find((r) => r.item.id === "duct")?.total).toBeCloseTo(4.4);
  });

  it("sums a location drawn on two drawings (condenser on the roof, evaporator in the room)", () => {
    const p = project();
    p.drawings.push({ id: "d2", path: null, name: "cobertura.pdf", pages: [{ scale: null }] });
    p.measurements.push({
      id: "c3",
      itemId: "diff",
      drawingId: "d2",
      page: 0,
      points: [{ x: 2, y: 2 }],
    });
    p.locations = [{ id: "cm", name: "Casa de Máquinas", color: "#fff" }];
    p.zones = [
      { id: "r1", locationId: "cm", drawingId: D1, page: 0, points: square(10) },
      { id: "r2", locationId: "cm", drawingId: "d2", page: 0, points: square(10), repeat: 2 },
    ];
    const by = totalsByLocation(p);
    expect(by.get("cm")?.get("diff")?.qty).toBe(3); // 1 on d1 + 1 × 2 on d2
    const regions = totalsByRegion(p);
    expect(regions.get("r1")?.get("diff")?.qty).toBe(1);
    expect(regions.get("r2")?.get("diff")?.qty).toBe(2);
    const m = locationMatrix(p);
    expect(m.columns.map((c) => c.name)).toEqual(["Casa de Máquinas", "Sem local"]);
    p.sectionsBy = "local";
    expect(systemSheets(p)[0].sections.map((s) => s.name)).toEqual([
      "Casa de Máquinas",
      "Sem local",
    ]);
    expect(systemSheets(p)[0].sections[0].rows.find((r) => r.item.id === "diff")?.qty).toBe(3);
  });
});

describe("system sheets", () => {
  it("splits items into one sheet per system and sections per location or group", () => {
    const p = project();
    p.system = "Pressurização";
    p.items[1] = { ...p.items[1], system: "Exaustão" };
    p.locations = [{ id: "l", name: "Térreo", color: "#fff" }];
    p.zones = [{ id: "z", locationId: "l", drawingId: D1, page: 0, points: square(1000) }];
    p.sectionsBy = "local";
    const sheets = systemSheets(p);
    // sheets follow the usual discipline order (Exaustão before Pressurização), not insertion
    expect(sheets.map((s) => s.system)).toEqual(["Exaustão", "Pressurização"]);
    expect(sheets[1].sections.map((s) => s.name)).toEqual(["Térreo"]);
    expect(sheets[1].sections[0].rows.map((r) => [r.item.id, r.qty])).toEqual([
      ["duct", 4.4],
      ["floor", 6],
    ]);
    expect(sheets[0].sections.map((s) => s.name)).toEqual(["Térreo", "Sem local"]);
    p.sectionsBy = "grupo";
    expect(systemSheets(p)[1].sections.map((s) => s.name)).toEqual(["Rede de Dutos"]);
  });
});

describe("disciplines", () => {
  it("keeps a room's items on separate discipline tabs", () => {
    const p = project();
    p.system = "AC Áreas Comuns";
    p.items = [
      { ...p.items[1], id: "ac1", name: "Difusor AC", system: "AC Áreas Comuns" },
      { ...p.items[1], id: "ex1", name: "Grelha de exaustão", system: "Exaustão" },
    ];
    p.measurements = [
      { id: "a", itemId: "ac1", drawingId: D1, page: 0, points: [{ x: 5, y: 5 }] },
      { id: "b", itemId: "ex1", drawingId: D1, page: 0, points: [{ x: 6, y: 6 }] },
      { id: "c", itemId: "ex1", drawingId: D1, page: 0, points: [{ x: 7, y: 7 }] },
    ];
    p.locations = [{ id: "room", name: "Sala 101", color: "#fff" }];
    p.zones = [{ id: "z", locationId: "room", drawingId: D1, page: 0, points: square(100) }];
    const sheets = systemSheets(p);
    expect(sheets.map((s) => s.system)).toEqual(["Exaustão", "AC Áreas Comuns"]);
    expect(sheets[1].sections.map((s) => s.name)).toEqual(["Sala 101"]);
    expect(sheets[1].sections[0].rows.map((r) => [r.item.name, r.qty])).toEqual([
      ["Difusor AC", 1],
    ]);
    expect(sheets[0].sections.map((s) => s.name)).toEqual(["Sala 101"]);
    expect(sheets[0].sections[0].rows.map((r) => [r.item.name, r.qty])).toEqual([
      ["Grelha de exaustão", 2],
    ]);
    // the room itself still shows both in the per-location totals
    expect(totalsByLocation(p).get("room")?.size).toBe(2);
  });
});
