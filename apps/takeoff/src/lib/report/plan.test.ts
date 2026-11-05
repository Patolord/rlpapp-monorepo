import { DEFAULT_DUCT_SPEC, type DuctSpec } from "@rlpapp/shared/engenharia/ducts";
import { describe, expect, it } from "vitest";
import { DUCT_GROUP } from "../ductItems";
import type { Box, Pt } from "../geom";
import { NO_LOCATION, totalsByRegion } from "../quantities";
import { emptyProject, type Item, type Measurement, type Project, type Zone } from "../types";
import { metricScale } from "../units";
import type { VrfSpec } from "../vrf";
import { VRF_GROUP } from "../vrfItems";
import { soDutos, soVrf } from "./filter";
import {
  locationCandidates,
  type Orientation,
  pagesLabel,
  planReport,
  type ReportOptions,
  type ReportPage,
  reportLayout,
  tileGrid,
  tileLabel,
} from "./plan";

const SCALE = metricScale(50);
/** Page points per metre at 1:50. */
const M = SCALE.pointsPerUnit;
const D1 = "d1";
const D2 = "d2";
/** A 400 × 300 frame at floor 0.5: a tile covers 800 × 600 page points. */
const OPTS: ReportOptions = { frame: { width: 400, height: 300 } };

const item = (id: string, extra: Partial<Item>): Item => ({
  id,
  name: id,
  kind: "count",
  color: "#f97316",
  group: "Geral",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  ...extra,
});

function base(): Project {
  const p = emptyProject();
  p.system = "Exaustão";
  p.drawings = [
    { id: D1, path: null, name: "Térreo.pdf", pages: [{ scale: SCALE }, { scale: SCALE }] },
    { id: D2, path: null, name: "Cobertura.pdf", pages: [{ scale: SCALE }] },
  ];
  p.items = [
    item("grelha", { name: "Grelha", group: "Bocas de Ar", symbol: "square" }),
    item("duto", { name: "Duto flexível", kind: "linear", group: DUCT_GROUP, wastePct: 10 }),
    item("piso", { name: "Isolamento", kind: "area", group: "Isolamento", system: "TAE" }),
    item("rede", {
      name: "Rede de dutos",
      kind: "linear",
      group: DUCT_GROUP,
      unit: "cj",
      manualQty: 1,
      derived: "duct",
    }),
    item("vrf", {
      name: "Sistema VRF",
      kind: "linear",
      group: VRF_GROUP,
      unit: "cj",
      manualQty: 1,
      derived: "vrf",
      vrf: { brand: "daikin", hp: 8 },
      system: "Infra AC",
    }),
  ];
  return p;
}

let seq = 0;
const count = (itemId: string, d: string, page: number, x: number, y: number, extra = {}) =>
  ({ id: `m${++seq}`, itemId, drawingId: d, page, points: [{ x, y }], ...extra }) as Measurement;
const line = (itemId: string, d: string, page: number, pts: Pt[], extra = {}) =>
  ({ id: `m${++seq}`, itemId, drawingId: d, page, points: pts, ...extra }) as Measurement;
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const zone = (id: string, locationId: string, d: string, page: number, pts: Pt[], extra = {}) =>
  ({ id, locationId, drawingId: d, page, points: pts, ...extra }) as Zone;

function addLocation(p: Project, id: string, name: string, ...zones: Zone[]) {
  p.locations.push({ id, name, color: "#38bdf8" });
  p.zones.push(...zones);
}

const contains = (outer: Box, inner: Box) =>
  inner.minX >= outer.minX - 1e-9 &&
  inner.maxX <= outer.maxX + 1e-9 &&
  inner.minY >= outer.minY - 1e-9 &&
  inner.maxY <= outer.maxY + 1e-9;

const row = (page: { rows: ReportPage["rows"] }, itemId: string) =>
  page.rows.find((r) => r.itemId === itemId);

describe("layout", () => {
  it("gives the frame about 70 % of an A4 landscape page, the list beside it", () => {
    const l = reportLayout("A4", "landscape");
    expect(l.page.width).toBeCloseTo(841.89);
    expect(l.frame.width / (l.page.width - 48)).toBeGreaterThan(0.65);
    expect(l.list.x).toBeGreaterThan(l.frame.x + l.frame.width);
    expect(l.header.y).toBeGreaterThan(l.frame.y + l.frame.height);
    expect(l.footer.y + l.footer.height).toBeLessThan(l.frame.y);
  });

  it("puts the list under the frame in portrait, and A3 doubles the area", () => {
    const portrait: Orientation = "portrait";
    const l = reportLayout("A4", portrait);
    expect(l.list.y + l.list.height).toBeLessThan(l.frame.y);
    const a3 = reportLayout("A3");
    expect(a3.frame.width).toBeGreaterThan(reportLayout("A4").frame.width * 1.3);
  });

  it("uses the paper's frame unless one is given", () => {
    const p = base();
    addLocation(p, "l", "Sala", zone("z", "l", D1, 0, rect(0, 0, 500, 500)));
    p.measurements = [count("grelha", D1, 0, 100, 100)];
    const plan = planReport(p, {}, { paper: "A3" });
    expect(plan.frame.width).toBeCloseTo(reportLayout("A3").frame.width);
    expect(planReport(p, {}, OPTS).frame).toEqual({ width: 400, height: 300 });
  });
});

describe("filtering", () => {
  function project() {
    const p = base();
    addLocation(p, "sala", "Sala", zone("z1", "sala", D1, 0, rect(0, 0, 400, 400)));
    addLocation(p, "copa", "Copa", zone("z2", "copa", D1, 0, rect(500, 0, 900, 400)));
    addLocation(p, "hall", "Hall", zone("z3", "hall", D1, 0, rect(1000, 0, 1400, 400)));
    p.measurements = [
      count("grelha", D1, 0, 100, 100),
      line("duto", D1, 0, [
        { x: 50, y: 300 },
        { x: 350, y: 300 },
      ]),
      line(
        "rede",
        D1,
        0,
        [
          { x: 60, y: 200 },
          { x: 300, y: 200 },
        ],
        { duct: DEFAULT_DUCT_SPEC },
      ),
      count("grelha", D1, 0, 600, 100), // Copa: only an air terminal
      line("piso", D1, 0, rect(1100, 100, 1200, 200)), // Hall: TAE discipline
    ];
    return p;
  }

  it("only the locations with something selected make it in (Só dutos)", () => {
    const p = project();
    const plan = planReport(p, soDutos, OPTS);
    expect(plan.pages.map((pg) => pg.locationName)).toEqual(["Sala"]);
    expect(plan.skipped.map((s) => s.name)).toEqual(["Copa", "Hall"]);
    const [page] = plan.pages;
    // the grelha is not drawn nor listed, the duct runs are
    expect(page.measurementIds).toEqual([p.measurements[1].id, p.measurements[2].id]);
    expect(page.rows.map((r) => r.itemId)).toEqual(["duto"]);
    expect(page.ducts).toHaveLength(1);
    expect(plan.filterLabel).toBe("Categoria: Rede de Dutos");
  });

  it("filters by discipline", () => {
    const plan = planReport(project(), { systems: ["TAE"] }, OPTS);
    expect(plan.pages.map((pg) => pg.locationName)).toEqual(["Hall"]);
    expect(plan.pages[0].rows.map((r) => r.itemId)).toEqual(["piso"]);
  });

  it("filters by item and honours the chosen locations", () => {
    const p = project();
    expect(planReport(p, { itemIds: ["grelha"] }, OPTS).pages.map((x) => x.locationName)).toEqual([
      "Sala",
      "Copa",
    ]);
    const plan = planReport(p, { itemIds: ["grelha"] }, { ...OPTS, locationIds: ["copa"] });
    expect(plan.pages.map((x) => x.locationName)).toEqual(["Copa"]);
    expect(plan.skipped).toEqual([]);
  });

  it("lists every location for the dialog with its filtered markings", () => {
    const p = project();
    p.measurements.push(count("grelha", D1, 0, 2000, 2000));
    expect(locationCandidates(p, soDutos)).toEqual([
      { locationId: "sala", name: "Sala", regions: 1, markings: 2 },
      { locationId: "copa", name: "Copa", regions: 1, markings: 0 },
      { locationId: "hall", name: "Hall", regions: 1, markings: 0 },
    ]);
    expect(locationCandidates(p, {}).at(-1)).toEqual({
      locationId: NO_LOCATION,
      name: "Sem local",
      regions: 0,
      markings: 1,
    });
  });
});

describe("tight crop", () => {
  function project() {
    const p = base();
    addLocation(p, "sala", "Sala", zone("z", "sala", D1, 0, rect(0, 0, 2000, 1500)));
    p.measurements = [count("grelha", D1, 0, 150, 150), count("grelha", D1, 0, 200, 180)];
    return p;
  }

  it("crops to the markings plus the minimum margin, not to the polygon", () => {
    const plan = planReport(project(), {}, { ...OPTS, maxZoom: 10 });
    expect(plan.pages).toHaveLength(1);
    const [page] = plan.pages;
    expect(page.kind).toBe("cutout");
    // markings span 50 × 30: the 15 pt minimum margin wins over 5 %
    expect(page.zoom).toBeCloseTo(5);
    expect(page.crop.minX).toBeCloseTo(135);
    expect(page.crop.maxX).toBeCloseTo(215);
    expect(page.crop.minY).toBeCloseTo(135);
    expect(page.crop.maxY).toBeCloseTo(195);
    expect(page.polygon).toEqual(rect(0, 0, 2000, 1500));
    expect(page.rowsScope).toBe("region");
  });

  it("grows a tiny crop around its markings instead of zooming past the cap", () => {
    const [page] = planReport(project(), {}, OPTS).pages;
    expect(page.zoom).toBe(2);
    expect(page.crop.maxX - page.crop.minX).toBeCloseTo(200);
    expect(page.crop.maxY - page.crop.minY).toBeCloseTo(150);
    expect((page.crop.minX + page.crop.maxX) / 2).toBeCloseTo(175);
    expect(contains(page.crop, { minX: 135, minY: 135, maxX: 215, maxY: 195 })).toBe(true);
  });

  it("keeps the crop inside the sheet when its size is known", () => {
    const p = project();
    p.measurements = [count("grelha", D1, 0, 10, 10)];
    const [page] = planReport(
      p,
      {},
      { ...OPTS, pageSize: () => ({ width: 1000, height: 800 }) },
    ).pages;
    expect(page.crop).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 150 });
  });

  it("uses a 5 % margin on large crops and stays on one page at the floor", () => {
    const p = project();
    // 560 × 400: margin 28 → 616 × 456, zoom min(0.649, 0.658) ≥ 0.5 → one page
    p.measurements = [count("grelha", D1, 0, 100, 100), count("grelha", D1, 0, 660, 500)];
    const [page, ...rest] = planReport(p, {}, OPTS).pages;
    expect(rest).toHaveLength(0);
    expect(page.kind).toBe("cutout");
    expect(page.zoom).toBeCloseTo(400 / 616);
    expect(contains(page.crop, { minX: 72, minY: 72, maxX: 688, maxY: 528 })).toBe(true);
  });
});

describe("clusters", () => {
  function project() {
    const p = base();
    addLocation(p, "pav", "Pavimento 3", zone("z", "pav", D1, 1, rect(0, 0, 5000, 3000)));
    p.measurements = [
      // network B (bottom right) first in the file: pages still read top to bottom
      count("grelha", D1, 1, 3000, 2000),
      count("grelha", D1, 1, 3500, 2300),
      count("grelha", D1, 1, 100, 100),
      count("grelha", D1, 1, 600, 400),
      count("grelha", D1, 1, 350, 250),
    ];
    return p;
  }

  it("splits a region too large for the floor into a key map and one page per network", () => {
    const p = project();
    const plan = planReport(p, {}, OPTS);
    expect(plan.pages.map((pg) => pg.kind)).toEqual(["keymap", "cluster", "cluster"]);
    expect(plan.pages.map((pg) => pg.heading)).toEqual([
      "Pavimento 3 · mapa",
      "Pavimento 3 · trecho 1 de 2",
      "Pavimento 3 · trecho 2 de 2",
    ]);
    const [map, a, b] = plan.pages;
    expect(a.countedIds).toEqual([
      p.measurements[2].id,
      p.measurements[3].id,
      p.measurements[4].id,
    ]);
    expect(b.countedIds).toEqual([p.measurements[0].id, p.measurements[1].id]);
    for (const pg of [a, b]) {
      expect(pg.zoom).toBeGreaterThanOrEqual(0.5);
      expect(pg.rowsScope).toBe("page");
    }
    // cluster A: 500 × 300 + 25 margin → 550 × 350, zoom 0.727
    expect(a.zoom).toBeCloseTo(400 / 550);
    expect(map.rowsScope).toBe("region");
    expect(row(map, "grelha")?.qty).toBe(5);
    expect(row(a, "grelha")?.qty).toBe(3);
    expect(row(b, "grelha")?.qty).toBe(2);
    expect(map.frames).toEqual([
      { label: "1", crop: a.crop, pageIndex: 1 },
      { label: "2", crop: b.crop, pageIndex: 2 },
    ]);
    // the key map shows the whole region
    expect(contains(map.crop, { minX: 0, minY: 0, maxX: 5000, maxY: 3000 })).toBe(true);
    expect(plan.cover.locations[0].pagesLabel).toBe("1 mapa + 2 folhas");
  });

  it("tiles a cluster that still does not fit, labelled under its trecho", () => {
    const p = project();
    // network B becomes a 3000 pt run: too long for one page at the floor
    p.measurements.push(
      line("duto", D1, 1, [
        { x: 1500, y: 2600 },
        { x: 4500, y: 2600 },
      ]),
    );
    const plan = planReport(p, {}, OPTS);
    const kinds = plan.pages.map((pg) => pg.kind);
    expect(kinds[0]).toBe("keymap");
    expect(kinds.filter((k) => k === "tile").length).toBeGreaterThan(1);
    const tile = plan.pages.find((pg) => pg.kind === "tile")!;
    expect(tile.heading).toMatch(/^Pavimento 3 · trecho 2 de 2 · folha [A-Z]\d$/);
    const labels = plan.pages[0].frames?.map((f) => f.label) ?? [];
    expect(labels[0]).toBe("1");
    expect(labels.slice(1).every((l) => /^2·[A-Z]\d$/.test(l))).toBe(true);
    // the empty left end of trecho 2's grid (row A, columns 1 and 2) gets no page
    expect(labels).not.toContain("2·A1");
    // the duct run (anchored at its middle) is counted once over every page
    const dutos = plan.pages.slice(1).map((pg) => row(pg, "duto")?.count ?? 0);
    expect(dutos.reduce((s, n) => s + n, 0)).toBe(1);
  });
});

describe("tiles", () => {
  it("covers a box with overlapping frame-sized tiles, A1 A2 … row by row", () => {
    const tiles = tileGrid(
      { minX: -150, minY: -50, maxX: 3150, maxY: 270 },
      { width: 800, height: 600 },
      0.1,
    );
    expect(tiles.map((t) => t.label)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(tiles[0].crop.minX).toBeCloseTo(-340);
    expect(tiles[0].crop.minY).toBeCloseTo(-190);
    for (let i = 1; i < tiles.length; i++) {
      // neighbours overlap by 10 % of a tile; cells meet in the middle of the overlap
      expect(tiles[i - 1].crop.maxX - tiles[i].crop.minX).toBeCloseTo(80);
      expect(tiles[i - 1].cell.maxX).toBeCloseTo(tiles[i].cell.minX);
      expect(tiles[i].cell.minX).toBeCloseTo(tiles[i].crop.minX + 40);
    }
    expect(tiles[0].cell.minX).toBe(Number.NEGATIVE_INFINITY);
    expect(tiles[4].cell.maxX).toBe(Number.POSITIVE_INFINITY);
    const grid = tileGrid(
      { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      { width: 800, height: 600 },
      0.1,
    );
    expect(grid.map((t) => t.label)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(tileLabel(26, 2)).toBe("AA3");
  });

  function project() {
    const p = base();
    addLocation(p, "pav", "Pavimento 3", zone("z", "pav", D1, 1, rect(-500, -500, 4000, 1000)));
    p.measurements = [
      line("duto", D1, 1, [
        { x: 0, y: 100 },
        { x: 3000, y: 100 },
      ]),
    ];
    for (let x = 50; x < 3000; x += 100) p.measurements.push(count("grelha", D1, 1, x, 120));
    return p;
  }

  it("tiles one long network at the floor zoom behind a key map, nothing counted twice", () => {
    const p = project();
    const plan = planReport(p, {}, OPTS);
    expect(plan.pages.map((pg) => pg.kind)).toEqual([
      "keymap",
      "tile",
      "tile",
      "tile",
      "tile",
      "tile",
    ]);
    const [map, ...tiles] = plan.pages;
    expect(tiles.map((t) => t.tile)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(tiles.map((t) => t.heading)[0]).toBe("Pavimento 3 · folha A1");
    for (const t of tiles) {
      expect(t.zoom).toBe(0.5);
      expect(t.crop.maxX - t.crop.minX).toBeCloseTo(800);
      // the run crosses every tile, so every tile draws it
      expect(t.measurementIds).toContain(p.measurements[0].id);
    }
    expect(tiles[0].crop.maxX - tiles[1].crop.minX).toBeCloseTo(80);
    // counts by anchor: x = 50…350 on A1, 450… on A2; the run's middle (1500) on A3
    expect(row(tiles[0], "grelha")?.count).toBe(4);
    expect(row(tiles[2], "duto")?.count).toBe(1);
    const sum = (id: string) => tiles.reduce((s, t) => s + (row(t, id)?.qty ?? 0), 0);
    expect(sum("grelha")).toBe(30);
    expect(sum("duto")).toBeCloseTo(row(map, "duto")!.qty, 9);
    expect(row(map, "grelha")?.qty).toBe(30);
    expect(row(map, "duto")?.qty).toBeCloseTo(3000 / M, 9);
    // every marking counted on exactly one page
    const counted = tiles.flatMap((t) => t.countedIds);
    expect(new Set(counted).size).toBe(counted.length);
    expect(counted.sort()).toEqual(p.measurements.map((m) => m.id).sort());
    expect(map.frames?.map((f) => [f.label, f.pageIndex])).toEqual([
      ["A1", 1],
      ["A2", 2],
      ["A3", 3],
      ["A4", 4],
      ["A5", 5],
    ]);
    expect(plan.cover.locations[0].pagesLabel).toBe("1 mapa + 5 folhas");
  });

  it("skips tiles with nothing on them", () => {
    const p = base();
    addLocation(p, "pav", "Pavimento 3", zone("z", "pav", D1, 1, rect(-500, -500, 4000, 4000)));
    // an L of counts: the grid's far corner stays empty
    p.measurements = [];
    for (let x = 0; x <= 1600; x += 100) p.measurements.push(count("grelha", D1, 1, x, 0));
    for (let y = 100; y <= 1200; y += 100) p.measurements.push(count("grelha", D1, 1, 0, y));
    const plan = planReport(p, {}, OPTS);
    const tiles = plan.pages.filter((pg) => pg.kind === "tile");
    expect(tiles.map((t) => t.tile)).not.toContain("C3");
    expect(tiles.reduce((s, t) => s + (row(t, "grelha")?.qty ?? 0), 0)).toBe(29);
  });
});

describe("totals", () => {
  it("region pages carry totalsByRegion's quantities, repeats applied", () => {
    const p = base();
    addLocation(
      p,
      "apto",
      "Apartamento",
      zone("z", "apto", D2, 0, rect(0, 0, 800, 600), { repeat: 20 }),
    );
    p.measurements = [
      count("grelha", D2, 0, 100, 100),
      count("grelha", D2, 0, 200, 100, { repeat: 2 }),
      line(
        "duto",
        D2,
        0,
        [
          { x: 100, y: 300 },
          { x: 100 + 5 * M, y: 300 },
        ],
        { vertical: 1 },
      ),
      line("piso", D2, 0, rect(300, 300, 300 + 2 * M, 300 + 2 * M)),
    ];
    const plan = planReport(p, {}, OPTS);
    const [page] = plan.pages;
    expect(page.heading).toBe("Apartamento ×20");
    expect(page.regionRepeat).toBe(20);
    expect(row(page, "grelha")?.qty).toBe(60);
    expect(row(page, "grelha")?.count).toBe(2);
    expect(row(page, "duto")?.qty).toBeCloseTo(120, 9);
    expect(row(page, "duto")?.pricedQty).toBeCloseTo(132, 9); // 10 % waste, as the quote
    expect(row(page, "piso")?.qty).toBeCloseTo(80, 9);
    const region = totalsByRegion(p).get("z")!;
    for (const r of page.rows) expect(r.qty).toBeCloseTo(region.get(r.itemId)!.qty, 9);
    expect(page.rows.map((r) => [r.itemId, r.unit])).toEqual([
      ["piso", "m²"],
      ["duto", "m"],
      ["grelha", "pç"],
    ]);
    expect(plan.cover.locations[0].rows).toEqual(page.rows);
  });

  it("orders rows as the budget and leaves derived items to the breakdowns", () => {
    const p = base();
    addLocation(p, "l", "Sala", zone("z", "l", D1, 0, rect(0, 0, 800, 600)));
    p.measurements = [
      count("grelha", D1, 0, 100, 100),
      line("duto", D1, 0, [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
      ]),
      line(
        "rede",
        D1,
        0,
        [
          { x: 100, y: 300 },
          { x: 300, y: 300 },
        ],
        { duct: DEFAULT_DUCT_SPEC },
      ),
    ];
    const [page] = planReport(p, {}, OPTS).pages;
    // networks before air terminals, the derived network not as a 1 cj row
    expect(page.rows.map((r) => r.itemId)).toEqual(["duto", "grelha"]);
    expect(page.rows[1]).toMatchObject({ name: "Grelha", symbol: "square", unit: "pç" });
  });
});

describe("nested locations", () => {
  /**
   * A floor ×10 around two rooms: Sala 101 ×2 (a grelha and a duct run) and Sala 102 (a grelha),
   * plus a grelha in the corridor that only the floor holds.
   */
  function project() {
    const p = base();
    addLocation(
      p,
      "pav",
      "Pavimento tipo",
      zone("zp", "pav", D1, 0, rect(0, 0, 1000, 600), { repeat: 10 }),
    );
    addLocation(
      p,
      "s101",
      "Sala 101",
      zone("z1", "s101", D1, 0, rect(50, 50, 400, 300), { repeat: 2 }),
    );
    addLocation(p, "s102", "Sala 102", zone("z2", "s102", D1, 0, rect(500, 50, 900, 300)));
    p.measurements = [
      count("grelha", D1, 0, 100, 100), // Sala 101
      count("grelha", D1, 0, 600, 100, { repeat: 3 }), // Sala 102, own repeat 3
      count("grelha", D1, 0, 500, 450), // corridor: the floor only
      line("duto", D1, 0, [
        { x: 100, y: 200 },
        { x: 100 + 4 * M, y: 200 },
      ]), // Sala 101 (anchor at its middle)
      line(
        "rede",
        D1,
        0,
        [
          { x: 600, y: 200 },
          { x: 600 + 2 * M, y: 200 },
        ],
        { duct: DEFAULT_DUCT_SPEC },
      ), // Sala 102
    ];
    return p;
  }

  it("draws and lists every marking inside the floor; each room only its own", () => {
    const p = project();
    const [m101, m102, corridor, duto, rede] = p.measurements.map((m) => m.id);
    const plan = planReport(p, {}, { ...OPTS, frame: { width: 2000, height: 1500 } });
    expect(plan.pages.map((pg) => [pg.locationName, pg.kind])).toEqual([
      ["Pavimento tipo", "cutout"],
      ["Sala 101", "cutout"],
      ["Sala 102", "cutout"],
    ]);
    const [floor, s101, s102] = plan.pages;
    expect(floor.measurementIds).toEqual([m101, m102, corridor, duto, rede]);
    expect(floor.countedIds).toEqual([m101, m102, corridor, duto, rede]);
    expect(s101.countedIds).toEqual([m101, duto]);
    expect(s102.countedIds).toEqual([m102, rede]);
    // the crop is tight around everything the floor holds, the rooms' markings included
    expect(contains(floor.crop, { minX: 100, minY: 100, maxX: 600 + 2 * M, maxY: 450 })).toBe(true);
    // the floor applies its own repeat (×10) to every marking, times the marking's repeat
    expect(row(floor, "grelha")).toMatchObject({ count: 3, qty: 10 + 30 + 10 });
    expect(row(floor, "duto")?.qty).toBeCloseTo(40, 9);
    expect(floor.ducts.map((d) => [d.runs, d.length])).toEqual([[1, expect.closeTo(20, 9)]]);
    // each room its own repeat
    expect(row(s101, "grelha")?.qty).toBe(2);
    expect(row(s101, "duto")?.qty).toBeCloseTo(8, 9);
    expect(row(s102, "grelha")?.qty).toBe(3);
    expect(s102.ducts[0].length).toBeCloseTo(2, 9);
    // the budget is unchanged: the floor region keeps only the corridor's grelha
    expect(totalsByRegion(p).get("zp")?.get("grelha")?.count).toBe(1);
  });

  it("counts each marking once in the grand total, as the budget, and flags the nesting", () => {
    const p = project();
    const plan = planReport(p, {}, { ...OPTS, frame: { width: 2000, height: 1500 } });
    const [floor, s101, s102] = plan.cover.locations;
    expect(floor).toMatchObject({
      name: "Pavimento tipo",
      markings: 5,
      containsLocations: ["Sala 101", "Sala 102"],
    });
    expect(s101.containsLocations).toEqual([]);
    expect(s102.markings).toBe(2);
    expect(plan.cover.nested).toBe(true);
    // budget semantics: Sala 101 ×2, Sala 102 own ×3, corridor floor ×10
    const totals = plan.cover.totals;
    expect(row(totals, "grelha")).toMatchObject({ count: 3, qty: 2 + 3 + 10 });
    expect(row(totals, "duto")?.qty).toBeCloseTo(8, 9);
    expect(totals.ducts.map((d) => [d.runs, d.length])).toEqual([[1, expect.closeTo(2, 9)]]);
    // the floor alone still counts each marking once; only the rooms alone nest nothing
    const alone = planReport(p, {}, { ...OPTS, locationIds: ["pav"] });
    expect(alone.cover.nested).toBe(true);
    expect(row(alone.cover.totals, "grelha")).toMatchObject({ count: 3, qty: 15 });
    const rooms = planReport(p, {}, { ...OPTS, locationIds: ["s101", "s102"] });
    expect(rooms.cover.nested).toBe(false);
  });

  it("counts the floor's tile pages once per marking, the rooms' markings included", () => {
    const p = project();
    // a 400 × 300 frame at floor 0.5 cannot hold the floor's markings: key map and tiles
    p.measurements.push(count("grelha", D1, 0, 950, 550));
    p.zones[0].points = rect(0, 0, 3000, 600);
    p.measurements.push(count("grelha", D1, 0, 2900, 120));
    const plan = planReport(p, {}, OPTS);
    const floorPages = plan.pages.filter((pg) => pg.locationId === "pav");
    expect(floorPages[0].kind).toBe("keymap");
    const parts = floorPages.slice(1);
    expect(parts.length).toBeGreaterThan(1);
    const counted = parts.flatMap((pg) => pg.countedIds);
    expect(new Set(counted).size).toBe(counted.length);
    expect(counted.sort()).toEqual(p.measurements.map((m) => m.id).sort());
    const grelhas = parts.reduce((s, pg) => s + (row(pg, "grelha")?.qty ?? 0), 0);
    expect(grelhas).toBe(row(floorPages[0], "grelha")?.qty);
    expect(row(floorPages[0], "grelha")?.qty).toBe((1 + 3 + 1 + 1 + 1) * 10);
  });

  it("offers the floor in the dialog with everything inside it", () => {
    const p = project();
    expect(locationCandidates(p, { itemIds: ["grelha"] }).map((c) => [c.name, c.markings])).toEqual(
      [
        ["Pavimento tipo", 3],
        ["Sala 101", 1],
        ["Sala 102", 1],
      ],
    );
  });
});

describe("duct and VRF breakdown", () => {
  const spec = (a: number, b: number, insulation: DuctSpec["insulation"]): DuctSpec => ({
    ...DEFAULT_DUCT_SPEC,
    a,
    b,
    insulation,
  });

  it("lists duct runs by section and insulation with length and sheet area", () => {
    const p = base();
    addLocation(p, "l", "Casa de máquinas", zone("z", "l", D1, 0, rect(-10, -10, 1200, 1200)));
    const run = (y: number, metres: number, s: DuctSpec, extra = {}) =>
      line(
        "rede",
        D1,
        0,
        [
          { x: 0, y },
          { x: metres * M, y },
        ],
        { duct: s, ...extra },
      );
    p.measurements = [
      run(0, 10, spec(40, 25, "L")),
      run(100, 5, spec(60, 30, "S")),
      run(200, 8, spec(40, 25, "L"), { vertical: 2 }),
      count("grelha", D1, 0, 50, 50),
    ];
    const plan = planReport(p, soDutos, OPTS);
    const [page] = plan.pages;
    expect(page.rows).toEqual([]);
    expect(page.ducts.map((d) => [d.section, d.insulation, d.runs])).toEqual([
      ["60×30", "S", 1],
      ["40×25", "L", 2],
    ]);
    const d40 = page.ducts[1];
    expect(d40.length).toBeCloseTo(20, 9);
    expect(d40.area).toBeCloseTo(1.3 * 20, 9);
    expect(d40.insulationLabel).toBe("Manta lã de vidro");
    expect(d40.gauge).toBe("# 26");
    expect(d40.networkName).toBe("Rede de dutos");
    expect(page.ducts[0].area).toBeCloseTo(1.8 * 5, 9);
    expect(plan.cover.totals.ducts).toEqual(page.ducts);
  });

  it("lists VRF runs by role and tube pair, sized over the whole system", () => {
    const p = base();
    addLocation(p, "l", "Sala", zone("z", "l", D1, 0, rect(-10, -400, 1000, 400)));
    addLocation(p, "c", "Cobertura", zone("zc", "c", D2, 0, rect(-10, -10, 1000, 1000)));
    const vrf = (role: VrfSpec["role"], hp: number): { vrf: VrfSpec } => ({
      vrf: { role, hp, curves: 0 },
    });
    const at = (x: number, y = 0) => ({ x: x * M, y: y * M });
    p.measurements = [
      line("vrf", D1, 0, [at(0), at(10)], vrf("main", 0)),
      line("vrf", D1, 0, [at(10), at(10, 5)], vrf("branch", 2)),
      line("vrf", D1, 0, [at(10), at(15)], vrf("branch", 1.5)),
      line("grelha", D2, 0, [{ x: 10, y: 10 }]),
    ];
    const plan = planReport(p, soVrf, OPTS);
    expect(plan.cover.locations.map((l) => l.name)).toEqual(["Sala"]);
    const rows = plan.cover.totals.vrf;
    expect(rows.map((r) => [r.roleLabel, r.gas, r.liquid, r.runs])).toEqual([
      ["Saída da condensadora", "3/4", "3/8", 1],
      ["Ramal da evaporadora", "5/8", "1/4", 1],
      ["Ramal da evaporadora", "1/2", "1/4", 1],
    ]);
    expect(rows[0].length).toBeCloseTo(10, 9);
    expect(rows[2].length).toBeCloseTo(5, 9);
    expect(rows[0].systemName).toBe("Sistema VRF");
  });
});

describe("locations across sheets", () => {
  function project() {
    const p = base();
    addLocation(
      p,
      "sala",
      "Sala",
      zone("z1", "sala", D2, 0, rect(0, 0, 500, 500)),
      zone("z2", "sala", D1, 0, rect(0, 0, 500, 500)),
    );
    addLocation(p, "copa", "Copa", zone("z3", "copa", D1, 1, rect(0, 0, 500, 500)));
    p.measurements = [
      count("grelha", D2, 0, 100, 100),
      count("grelha", D1, 0, 100, 100),
      count("grelha", D1, 0, 150, 100),
      count("grelha", D1, 1, 100, 100),
    ];
    return p;
  }

  it("orders regions by drawing and points each page at the location's other sheets", () => {
    const plan = planReport(project(), {}, OPTS);
    expect(plan.pages.map((pg) => [pg.locationName, pg.drawingName, pg.page])).toEqual([
      ["Sala", "Térreo.pdf", 0],
      ["Sala", "Cobertura.pdf", 0],
      ["Copa", "Térreo.pdf", 1],
    ]);
    const [t, c, copa] = plan.pages;
    expect(t.alsoIn).toEqual([{ drawingId: D2, page: 0, label: "Cobertura p.1", pageIndex: 1 }]);
    expect(c.alsoIn).toEqual([{ drawingId: D1, page: 0, label: "Térreo p.1", pageIndex: 0 }]);
    expect(copa.alsoIn).toEqual([]);
    expect(plan.pages.map((pg) => pg.index)).toEqual([0, 1, 2]);
  });

  it("sums a location over its cutouts on the cover", () => {
    const plan = planReport(project(), {}, OPTS);
    const [sala, copa] = plan.cover.locations;
    expect(sala).toMatchObject({ name: "Sala", regions: 2, markings: 3, pages: [0, 1] });
    expect(sala.pagesLabel).toBe("2 páginas");
    expect(row(sala, "grelha")?.qty).toBe(3);
    expect(copa.pagesLabel).toBe("1 página");
    expect(row(plan.cover.totals, "grelha")?.qty).toBe(4);
  });
});

describe("Sem local", () => {
  function project() {
    const p = base();
    addLocation(p, "sala", "Sala", zone("z", "sala", D1, 0, rect(0, 0, 500, 500)));
    p.measurements = [
      count("grelha", D1, 0, 100, 100),
      count("grelha", D1, 0, 900, 900),
      count("grelha", D2, 0, 50, 50, { repeat: 3 }),
    ];
    return p;
  }

  it("is left out unless asked for", () => {
    const plan = planReport(project(), {}, OPTS);
    expect(plan.pages.map((pg) => pg.locationName)).toEqual(["Sala"]);
    expect(plan.cover.locations.map((l) => l.name)).toEqual(["Sala"]);
  });

  it("adds one cutout per sheet of the markings outside every location, last", () => {
    const plan = planReport(project(), {}, { ...OPTS, includeUnassigned: true });
    expect(plan.pages.map((pg) => [pg.locationName, pg.drawingId])).toEqual([
      ["Sala", D1],
      ["Sem local", D1],
      ["Sem local", D2],
    ]);
    const loose = plan.pages[1];
    expect(loose.locationId).toBe(NO_LOCATION);
    expect(loose.regionId).toBeNull();
    expect(loose.polygon).toBeNull();
    expect(loose.alsoIn).toEqual([]);
    expect(row(plan.pages[2], "grelha")?.qty).toBe(3);
    const cover = plan.cover.locations.at(-1)!;
    expect(cover).toMatchObject({ locationId: NO_LOCATION, name: "Sem local", pages: [1, 2] });
    expect(row(cover, "grelha")?.qty).toBe(4);
    expect(row(plan.cover.totals, "grelha")?.qty).toBe(5);
  });
});

describe("whole-sheet mode", () => {
  function project() {
    const p = base();
    addLocation(p, "sala", "Sala", zone("z", "sala", D1, 0, rect(0, 0, 500, 500), { repeat: 2 }));
    p.measurements = [
      count("grelha", D2, 0, 100, 100),
      count("grelha", D1, 0, 100, 100),
      count("grelha", D1, 0, 1500, 900),
    ];
    return p;
  }

  it("makes one page per sheet with markings, the whole sheet, no polygon", () => {
    const plan = planReport(
      project(),
      {},
      {
        ...OPTS,
        wholeSheet: true,
        locationIds: [],
        pageSize: () => ({ width: 2000, height: 1000 }),
      },
    );
    expect(plan.pages.map((pg) => [pg.kind, pg.drawingId, pg.heading])).toEqual([
      ["sheet", D1, "Térreo · p.1"],
      ["sheet", D2, "Cobertura · p.1"],
    ]);
    const [t] = plan.pages;
    expect(t.polygon).toBeNull();
    expect(t.locationId).toBeNull();
    expect(t.zoom).toBeCloseTo(0.2);
    expect(t.crop).toEqual({ minX: 0, minY: -250, maxX: 2000, maxY: 1250 });
    // the region's repeat still applies to what lies in it
    expect(row(t, "grelha")?.qty).toBe(3);
    expect(plan.cover.locations.map((l) => [l.name, l.pages])).toEqual([
      ["Sala", [0]],
      ["Sem local", [0, 1]],
    ]);
  });

  it("crops to the markings and regions of the sheet when its size is unknown", () => {
    const plan = planReport(project(), {}, { ...OPTS, wholeSheet: true });
    expect(contains(plan.pages[0].crop, { minX: 0, minY: 0, maxX: 1500, maxY: 900 })).toBe(true);
  });
});

describe("plan", () => {
  it("is deterministic and empty when nothing matches", () => {
    const p = base();
    addLocation(p, "sala", "Sala", zone("z", "sala", D1, 0, rect(0, 0, 500, 500)));
    p.measurements = [count("grelha", D1, 0, 100, 100)];
    expect(planReport(p, {}, OPTS)).toEqual(planReport(p, {}, OPTS));
    const none = planReport(p, soVrf, OPTS);
    expect(none.pages).toEqual([]);
    expect(none.cover.locations).toEqual([]);
    expect(none.skipped).toEqual([{ locationId: "sala", name: "Sala" }]);
  });

  it("names page counts the way the dialog previews them", () => {
    expect(pagesLabel(["cutout"])).toBe("1 página");
    expect(pagesLabel(["cutout", "cutout"])).toBe("2 páginas");
    expect(pagesLabel(["keymap", "tile", "tile", "tile", "tile", "tile", "tile"])).toBe(
      "1 mapa + 6 folhas",
    );
  });
});
