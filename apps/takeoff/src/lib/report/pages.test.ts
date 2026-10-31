import { describe, expect, it } from "vitest";
import type { Pt } from "../geom";
import { emptyProject, type Item, type Measurement, type Project, type Zone } from "../types";
import { metricScale } from "../units";
import {
  cropFocusBox,
  omittedNote,
  pageKey,
  pageKeys,
  skippedIndices,
  withoutPages,
} from "./pages";
import { planReport, type ReportOptions } from "./plan";

const SCALE = metricScale(50);
const D1 = "d1";
const D2 = "d2";
/** A 400 × 300 frame at floor 0.5: a tile covers 800 × 600 page points. */
const OPTS: ReportOptions = { frame: { width: 400, height: 300 } };

const grelha: Item = {
  id: "grelha",
  name: "Grelha",
  kind: "count",
  color: "#f97316",
  group: "Bocas de Ar",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
};
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
let seq = 0;
const count = (d: string, page: number, x: number, y: number) =>
  ({ id: `m${++seq}`, itemId: "grelha", drawingId: d, page, points: [{ x, y }] }) as Measurement;
const zone = (id: string, locationId: string, d: string, page: number, pts: Pt[]) =>
  ({ id, locationId, drawingId: d, page, points: pts }) as Zone;

/**
 * Pages: 0 Sala (Térreo p.1), 1 Sala (Cobertura p.1), 2 Pavimento key map, 3–7 its tiles A1–A5,
 * 8 Copa.
 */
function project(): Project {
  const p = emptyProject();
  p.drawings = [
    { id: D1, path: null, name: "Térreo.pdf", pages: [{ scale: SCALE }, { scale: SCALE }] },
    { id: D2, path: null, name: "Cobertura.pdf", pages: [{ scale: SCALE }] },
  ];
  p.items = [grelha];
  p.locations = [
    { id: "sala", name: "Sala", color: "#38bdf8" },
    { id: "pav", name: "Pavimento", color: "#38bdf8" },
    { id: "copa", name: "Copa", color: "#38bdf8" },
  ];
  p.zones = [
    zone("z1", "sala", D1, 0, rect(0, 0, 500, 500)),
    zone("z2", "sala", D2, 0, rect(0, 0, 500, 500)),
    zone("zp", "pav", D1, 1, rect(-500, -500, 4000, 1000)),
    zone("zc", "copa", D2, 0, rect(1000, 1000, 1500, 1500)),
  ];
  p.measurements = [count(D1, 0, 100, 100), count(D2, 0, 100, 100), count(D2, 0, 1200, 1200)];
  for (let x = 50; x < 3000; x += 100) p.measurements.push(count(D1, 1, x, 120));
  return p;
}

const plan = planReport(project(), {}, OPTS);

describe("the test plan", () => {
  it("has two sheets of Sala, a tiled floor and Copa", () => {
    expect(plan.pages.map((p) => p.kind)).toEqual([
      "cutout",
      "cutout",
      "keymap",
      "tile",
      "tile",
      "tile",
      "tile",
      "tile",
      "cutout",
    ]);
    expect(plan.pages[2].frames?.map((f) => f.pageIndex)).toEqual([3, 4, 5, 6, 7]);
    expect(plan.pages[0].alsoIn.map((s) => s.pageIndex)).toEqual([1]);
    expect(plan.pages[1].alsoIn.map((s) => s.pageIndex)).toEqual([0]);
  });
});

describe("pageKey", () => {
  it("is unique per page and names drawing, sheet, location, region, kind and part", () => {
    const keys = pageKeys(plan);
    expect(new Set(keys).size).toBe(plan.pages.length);
    expect(keys[0]).toBe("d1|0|sala|z1|cutout|");
    expect(keys[3]).toBe("d1|1|pav|zp|tile|folha A1");
  });

  it("survives changes that do not move the pages, and re-planning with other locations", () => {
    const again = planReport(project(), {}, OPTS);
    expect(pageKeys(again)).toEqual(pageKeys(plan));
    // without Sala the other pages keep their keys although their indices move
    const noSala = planReport(project(), {}, { ...OPTS, locationIds: ["pav", "copa"] });
    expect(noSala.pages[0].index).toBe(0);
    expect(pageKey(noSala.pages[0])).toBe(pageKeys(plan)[2]);
    expect(pageKeys(noSala)).toEqual(pageKeys(plan).slice(2));
  });

  it("finds the plan indices of skipped keys, ignoring keys of pages no longer planned", () => {
    const keys = pageKeys(plan);
    expect(skippedIndices(plan, [keys[4], "gone|0|x|y|tile|folha Z9", keys[8]])).toEqual([4, 8]);
    expect(skippedIndices(plan, [])).toEqual([]);
  });
});

describe("withoutPages", () => {
  it("returns the plan itself when nothing is skipped", () => {
    expect(withoutPages(plan, [])).toBe(plan);
    expect(withoutPages(plan, [99, -1])).toBe(plan);
  });

  it("renumbers the pages and keeps their content", () => {
    const out = withoutPages(plan, [0, 4]);
    expect(out.pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(out.pages.map((p) => p.heading)).toEqual([
      "Sala",
      "Pavimento · mapa",
      "Pavimento · folha A1",
      "Pavimento · folha A3",
      "Pavimento · folha A4",
      "Pavimento · folha A5",
      "Copa",
    ]);
    expect(out.pages[0].crop).toEqual(plan.pages[1].crop);
    expect(out.pages[0].rows).toEqual(plan.pages[1].rows);
    // the input plan is untouched
    expect(plan.pages.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("points the key map's frames at the new page numbers and drops omitted tiles", () => {
    const out = withoutPages(plan, [0, 4]);
    const map = out.pages[1];
    expect(map.frames?.map((f) => [f.label, f.pageIndex])).toEqual([
      ["A1", 2],
      ["A3", 3],
      ["A4", 4],
      ["A5", 5],
    ]);
    // every tile skipped: the map stays, with no frames
    const bare = withoutPages(plan, [3, 4, 5, 6, 7]);
    expect(bare.pages.map((p) => p.kind)).toEqual(["cutout", "cutout", "keymap", "cutout"]);
    expect(bare.pages[2].frames).toEqual([]);
  });

  it("keeps the tiles when the key map is skipped", () => {
    const out = withoutPages(plan, [2]);
    expect(out.pages.filter((p) => p.kind === "tile")).toHaveLength(5);
    expect(out.pages.some((p) => p.kind === "keymap")).toBe(false);
    expect(out.cover.locations[1].pagesLabel).toBe("5 páginas");
  });

  it("moves 'também em' to the new page number, and drops it when that sheet is all omitted", () => {
    const out = withoutPages(plan, [2, 3]);
    // Sala p.0 ↔ Cobertura p.1 are still pages 0 and 1; Copa moved from 8 to 6
    expect(out.pages[0].alsoIn.map((s) => s.pageIndex)).toEqual([1]);
    const shifted = withoutPages(plan, [0]);
    expect(shifted.pages[0].heading).toBe("Sala");
    expect(shifted.pages[0].alsoIn).toEqual([]);
    // the floor first: Sala's pages come after its tiles and move when tiles are skipped
    const p = project();
    p.locations = [p.locations[1], p.locations[0], p.locations[2]];
    const floorFirst = planReport(p, {}, OPTS);
    expect(floorFirst.pages.slice(6, 8).map((pg) => pg.alsoIn[0].pageIndex)).toEqual([7, 6]);
    const moved = withoutPages(floorFirst, [1, 2]);
    expect(moved.pages.slice(4, 6).map((pg) => pg.heading)).toEqual(["Sala", "Sala"]);
    expect(moved.pages.slice(4, 6).map((pg) => pg.alsoIn[0].pageIndex)).toEqual([5, 4]);
  });

  it("renumbers the cover's page index and labels, keeps the totals and notes the omissions", () => {
    const out = withoutPages(plan, [1, 4, 5]);
    const [sala, pav, copa] = out.cover.locations;
    expect(sala.pages).toEqual([0]);
    expect(sala.pagesLabel).toBe("1 página");
    expect(pav.pages).toEqual([1, 2, 3, 4]);
    expect(pav.pagesLabel).toBe("1 mapa + 3 folhas");
    expect(copa.pages).toEqual([5]);
    // totals describe the locations, not the printed pages
    expect(sala.rows).toEqual(plan.cover.locations[0].rows);
    expect(out.cover.totals).toEqual(plan.cover.totals);
    expect(out.omitted).toEqual(["Sala", "Pavimento · folha A2", "Pavimento · folha A3"]);
    expect(omittedNote(out)).toBe("3 páginas omitidas; os totais da capa incluem os itens delas.");
    expect(omittedNote(withoutPages(plan, [8]))).toBe(
      "1 página omitida; os totais da capa incluem os itens dela.",
    );
    expect(omittedNote(plan)).toBeUndefined();
    // a location with every page omitted stays on the cover, without pages
    const noCopa = withoutPages(plan, [8]);
    expect(noCopa.cover.locations[2]).toMatchObject({ pages: [], pagesLabel: "omitido" });
  });
});

describe("cropFocusBox", () => {
  it("is the crop, limited to the sheet when its size is known", () => {
    const crop = { minX: -40, minY: 100, maxX: 760, maxY: 700 };
    expect(cropFocusBox({ crop })).toEqual(crop);
    expect(cropFocusBox({ crop }, { width: 600, height: 650 })).toEqual({
      minX: 0,
      minY: 100,
      maxX: 600,
      maxY: 650,
    });
    // a crop off the sheet (should not happen) is kept as it is
    const off = { minX: 900, minY: 0, maxX: 1000, maxY: 100 };
    expect(cropFocusBox({ crop: off }, { width: 600, height: 400 })).toEqual(off);
  });
});
