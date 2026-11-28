import { describe, expect, it } from "vitest";
import { emptyProject, type Item, type Measurement, type Project, type Zone } from "../types";
import { metricScale } from "../units";
import { compareTakeoffs } from "./compare";
import { diffProject } from "./diffProject";
import { pairPoints, polygonIoU, rates } from "./match";
import { formatReport, formatSet, totalsOf } from "./report";

const square = (x: number, y: number, side: number) => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

const item = (id: string, name: string, kind: Item["kind"], extra: Partial<Item> = {}): Item => ({
  id,
  name,
  kind,
  color: "#fff",
  group: "Geral",
  materialPrice: 10,
  laborPrice: 0,
  wastePct: 0,
  ...extra,
});

const count = (id: string, itemId: string, x: number, y: number, page = 0): Measurement => ({
  id,
  itemId,
  drawingId: "d1",
  page,
  points: [{ x, y }],
});

const zone = (
  id: string,
  locationId: string,
  pts: Zone["points"],
  extra: Partial<Zone> = {},
): Zone => ({
  id,
  locationId,
  drawingId: "d1",
  page: 0,
  points: pts,
  ...extra,
});

/** A small closed takeoff: two rooms, grilles, a duct run and an area, on a 1:50 page. */
function reference(): Project {
  return {
    ...emptyProject(),
    name: "Referência",
    drawings: [{ id: "d1", path: null, name: "planta.pdf", pages: [{ scale: metricScale(50) }] }],
    activeDrawingId: "d1",
    items: [
      item("grelha", "Grelha 400x200", "count", { materialPrice: 100 }),
      item("exaustor", "Exaustor", "count", { materialPrice: 1000 }),
      item("tubo", "Tubo de cobre 1/4", "linear", { materialPrice: 20 }),
      item("forro", "Forro", "area", { materialPrice: 5 }),
    ],
    measurements: [
      count("g1", "grelha", 50, 50),
      count("g2", "grelha", 150, 50),
      count("g3", "grelha", 350, 60),
      count("e1", "exaustor", 60, 150),
      {
        id: "t1",
        itemId: "tubo",
        drawingId: "d1",
        page: 0,
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
      },
      { id: "f1", itemId: "forro", drawingId: "d1", page: 0, points: square(0, 0, 100) },
    ],
    locations: [
      { id: "sala", name: "Sala 101", color: "#fff" },
      { id: "copa", name: "Copa", color: "#fff" },
    ],
    zones: [zone("z1", "sala", square(0, 0, 200)), zone("z2", "copa", square(300, 0, 200))],
  };
}

describe("polygonIoU", () => {
  it("is 1 for the same outline, 0 for disjoint ones and the area ratio in between", () => {
    expect(polygonIoU(square(0, 0, 100), square(0, 0, 100))).toBe(1);
    expect(polygonIoU(square(0, 0, 100), square(500, 0, 100))).toBe(0);
    // half overlapping squares: 50 / 150
    expect(polygonIoU(square(0, 0, 100), square(50, 0, 100))).toBeCloseTo(1 / 3, 1);
  });
});

describe("pairPoints", () => {
  it("matches nearest first, once each, within the tolerance", () => {
    const ref = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const cand = [
      { x: 9, y: 0 },
      { x: 1, y: 0 },
      { x: 100, y: 0 },
    ];
    const pairing = pairPoints(ref, cand, 5);
    expect(pairing.pairs.sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(pairing.missed).toEqual([]);
    expect(pairing.extra).toEqual([2]);
  });
});

describe("rates", () => {
  it("separates precision from recall and treats two empty sides as agreement", () => {
    expect(rates(3, 1, 0)).toEqual({ precision: 1, recall: 0.75, f1: 6 / 7 });
    expect(rates(0, 2, 0)).toEqual({ precision: null, recall: 0, f1: 0 });
    expect(rates(0, 0, 0)).toEqual({ precision: 1, recall: 1, f1: 1 });
  });
});

describe("compareTakeoffs", () => {
  it("scores the reference against itself as perfect (oracle)", () => {
    const r = compareTakeoffs(reference(), reference());
    expect(r.locations).toMatchObject({
      recall: 1,
      precision: 1,
      f1: 1,
      meanIoU: 1,
      namesRight: 1,
    });
    expect(r.counts).toMatchObject({ recall: 1, precision: 1, f1: 1, wrongItem: 0 });
    expect(r.quantities.valueError).toBe(0);
    expect(r.quantities.rows.every((row) => row.error === 0 && row.status === "both")).toBe(true);
    expect(r.scales.wrong).toBe(0);
    expect(r.drawingsMissing).toEqual([]);
  });

  it("scores an empty takeoff as having found nothing (null baseline)", () => {
    const empty: Project = {
      ...emptyProject(),
      drawings: [{ id: "x", path: null, name: "planta.pdf", pages: [{ scale: null }] }],
    };
    const r = compareTakeoffs(reference(), empty);
    expect(r.locations).toMatchObject({ recall: 0, f1: 0 });
    expect(r.locations.missed).toHaveLength(2);
    expect(r.counts).toMatchObject({ recall: 0, f1: 0 });
    expect(r.counts.missed).toHaveLength(4);
    expect(r.quantities.valueError).toBe(1);
    expect(r.quantities.rows.every((row) => row.status === "missing")).toBe(true);
    expect(r.scales.wrong).toBe(1);
  });

  it("tells missed from extra from misplaced, per item", () => {
    const cand = reference();
    cand.drawings = [{ ...cand.drawings[0], id: "other" }];
    cand.zones = cand.zones.map((z) => ({ ...z, drawingId: "other" }));
    cand.measurements = [
      // g1 a little off (still the same mark), g2 missing, g3 far off, one grille invented
      { ...count("a", "grelha", 54, 53), drawingId: "other" },
      { ...count("b", "grelha", 350, 160), drawingId: "other" },
      { ...count("c", "grelha", 450, 450), drawingId: "other" },
      { ...count("d", "exaustor", 60, 150), drawingId: "other" },
    ];
    const r = compareTakeoffs(reference(), cand);
    const grelha = r.counts.items.find((i) => i.item === "Grelha 400x200");
    expect(grelha).toMatchObject({ matched: 1, missed: 2, extra: 2 });
    expect(grelha?.recall).toBeCloseTo(1 / 3);
    expect(r.counts.items.find((i) => i.item === "Exaustor")).toMatchObject({
      matched: 1,
      missed: 0,
      extra: 0,
    });
    // marks are reported in the reference's drawing, whatever id the candidate gave it
    expect(r.counts.extra.every((m) => m.drawingId === "d1")).toBe(true);
  });

  it("notices a mark placed on the wrong item", () => {
    const cand = reference();
    cand.measurements = cand.measurements.map((m) =>
      m.id === "e1" ? { ...m, itemId: "grelha" } : m,
    );
    const r = compareTakeoffs(reference(), cand);
    expect(r.counts.wrongItem).toBe(1);
    expect(r.counts.missed.map((m) => m.item)).toEqual(["Exaustor"]);
  });

  it("matches a line by catalog material even under another name", () => {
    const ref = reference();
    ref.items = ref.items.map((i) => (i.id === "grelha" ? { ...i, catalogId: "mat-1" } : i));
    const cand = reference();
    cand.items = cand.items.map((i) =>
      i.id === "grelha" ? { ...i, name: "Grelha de retorno 400 x 200", catalogId: "mat-1" } : i,
    );
    const r = compareTakeoffs(ref, cand);
    expect(r.counts.f1).toBe(1);
    expect(r.quantities.rows.every((row) => row.status === "both")).toBe(true);
  });

  it("pairs drawings that share a file name one to one", () => {
    // two sheets named alike (one per folder): each with its own marks
    const twoSheets = (): Project => {
      const p = reference();
      p.drawings = [p.drawings[0], { ...p.drawings[0], id: "d2" }];
      p.measurements = [...p.measurements, { ...count("g9", "grelha", 700, 700), drawingId: "d2" }];
      return p;
    };
    const r = compareTakeoffs(twoSheets(), twoSheets());
    expect(r.drawingsMissing).toEqual([]);
    expect(r.counts).toMatchObject({ recall: 1, precision: 1 });
    expect(r.counts.matched.filter((m) => m.drawingId === "d2")).toHaveLength(1);
  });

  it("treats the lines of one catalog material as one, whatever each is called", () => {
    // the same material on two budget lines (two disciplines), named differently
    const split = (): Project => {
      const p = reference();
      p.items = [
        ...p.items.map((i) => (i.id === "grelha" ? { ...i, catalogId: "mat-1" } : i)),
        item("grelha2", "Grelha (AC Leve)", "count", { catalogId: "mat-1" }),
      ];
      p.measurements = [...p.measurements, count("g9", "grelha2", 700, 700)];
      return p;
    };
    const r = compareTakeoffs(split(), split());
    expect(r.counts).toMatchObject({ recall: 1, precision: 1 });
    expect(r.quantities.rows.find((x) => x.item === "Grelha 400x200")).toMatchObject({
      reference: 4,
      candidate: 4,
      error: 0,
    });
    expect(r.quantities.rows.some((x) => x.item === "Grelha (AC Leve)")).toBe(false);
  });

  it("accepts a different way of drawing the same quantity", () => {
    // reference: one mark repeated 3 times; candidate: the mark inside a region with repeat 3
    const ref = reference();
    ref.measurements = [{ ...count("e1", "exaustor", 60, 150), repeat: 3 }];
    ref.zones = [];
    ref.locations = [];
    const cand = reference();
    cand.measurements = [count("e1", "exaustor", 60, 150)];
    cand.zones = [zone("z1", "sala", square(0, 0, 200), { repeat: 3 })];
    const row = compareTakeoffs(ref, cand).quantities.rows.find((x) => x.item === "Exaustor");
    expect(row).toMatchObject({ reference: 3, candidate: 3, error: 0 });
  });

  it("leaves out what cannot be read on the drawing", () => {
    const ref = reference();
    ref.items = [
      ...ref.items.map((i) => (i.id === "tubo" ? { ...i, manualQty: 50, vertical: 12 } : i)),
      item("rede", "Rede de dutos", "count", { derived: "duct" }),
    ];
    ref.measurements = ref.measurements.map((m) => (m.id === "t1" ? { ...m, vertical: 9 } : m));
    const r = compareTakeoffs(ref, reference());
    expect(r.quantities.rows.find((x) => x.item === "Tubo de cobre 1/4")?.error).toBe(0);
    expect(r.notCompared).toEqual({
      derived: ["Rede de dutos"],
      typedByHand: ["Tubo de cobre 1/4"],
    });
  });

  it("weighs the quantity error by price and flags a wrong scale", () => {
    const cand = reference();
    cand.drawings = [{ ...cand.drawings[0], pages: [{ scale: metricScale(100) }] }];
    const r = compareTakeoffs(reference(), cand);
    expect(r.scales.pages[0]).toMatchObject({ reference: "1:50", candidate: "1:100", ok: false });
    const tubo = r.quantities.rows.find((x) => x.item === "Tubo de cobre 1/4");
    // at 1:100 the same run reads twice as long, and the area four times as large
    expect(tubo?.error).toBeCloseTo(1);
    expect(r.quantities.rows.find((x) => x.item === "Forro")?.error).toBeCloseTo(3);
    expect(r.quantities.byKind.count).toBe(0);
    expect(r.quantities.valueError).toBeGreaterThan(0);
  });

  it("reports a location found under another name, and outlines that do not overlap enough", () => {
    const cand = reference();
    cand.locations = [
      { id: "sala", name: "Sala de reunião", color: "#fff" },
      { id: "copa", name: "copa ", color: "#fff" },
    ];
    cand.zones = [zone("z1", "sala", square(10, 10, 200)), zone("z2", "copa", square(450, 0, 200))];
    const r = compareTakeoffs(reference(), cand);
    expect(r.locations.matched).toHaveLength(1);
    expect(r.locations.matched[0]).toMatchObject({ name: "Sala 101", nameMatches: false });
    expect(r.locations.missed.map((m) => m.name)).toEqual(["Copa"]);
    expect(r.locations.extra.map((m) => m.name)).toEqual(["copa "]);
  });

  it("counts what was on a drawing the candidate does not have as missed", () => {
    const cand = reference();
    cand.drawings = [
      { ...cand.drawings[0], name: "outra.pdf" },
      { ...cand.drawings[0], id: "d2" },
    ];
    const r = compareTakeoffs(reference(), cand);
    // d2 carries the reference's file name: the candidate's markings on d1 are another drawing's
    expect(r.drawingsMissing).toEqual([]);
    expect(r.counts.recall).toBe(0);
  });

  it("tells which quantities sit on the reference's discipline tab", () => {
    const ref = reference();
    ref.items = ref.items.map((i) =>
      i.id === "exaustor" || i.id === "grelha"
        ? { ...i, system: "Exaustão" }
        : { ...i, system: "Infra AC" },
    );
    expect(compareTakeoffs(ref, ref).disciplines).toMatchObject({ right: 1, wrong: [] });
    // everything on one unnamed tab
    const flat = compareTakeoffs(ref, reference()).disciplines;
    expect(flat.right).toBe(0);
    expect(flat.candidateTabs).toEqual(["(sem disciplina)"]);
    expect(flat.wrong.map((w) => w.item)).toContain("Exaustor");
    // the tab's spelling does not matter, its system does
    const spelled = reference();
    spelled.items = ref.items.map((i) => ({
      ...i,
      system: i.system === "Exaustão" ? "EXAUSTAO" : "infra ac",
    }));
    expect(compareTakeoffs(ref, spelled).disciplines.right).toBe(1);
  });

  it("lists off-catalog lines and the catalog material the reference used there", () => {
    const ref = reference();
    ref.items = ref.items.map((i) => (i.id === "exaustor" ? { ...i, catalogId: "cat-9" } : i));
    const cand = reference();
    cand.items = cand.items.map((i) =>
      i.id === "exaustor" ? { ...i, name: "Exaustor Marca X modelo Y" } : i,
    );
    const r = compareTakeoffs(ref, cand);
    expect(r.catalog.offCatalog).toEqual(
      expect.arrayContaining([{ item: "Exaustor Marca X modelo Y", equivalent: "Exaustor" }]),
    );
    expect(r.catalog.hadEquivalent).toBe(1);
    expect(formatReport(r)).toContain("Exaustor Marca X modelo Y → na referência: Exaustor");
  });
});

describe("reports", () => {
  it("writes the comparison for a person", () => {
    const cand = reference();
    cand.measurements = cand.measurements.filter((m) => m.id !== "g2");
    const text = formatReport(compareTakeoffs(reference(), cand));
    expect(text).toContain("## Contagens");
    expect(text).toContain("| Grelha 400x200 | 2 | 1 | 0 | 67% | 100% |");
    expect(text).toContain("Grelha 400x200: planta.pdf p.1 em (150, 50)");
  });

  it("sums a set of cases, overall and per tag", () => {
    const empty: Project = { ...emptyProject(), drawings: reference().drawings };
    const results = [
      { id: "bom", tags: ["vetorial"], report: compareTakeoffs(reference(), reference()) },
      { id: "ruim", tags: ["escaneado"], report: compareTakeoffs(reference(), empty) },
    ];
    expect(totalsOf(results)).toMatchObject({ cases: 2, counts: { recall: 0.5, precision: 1 } });
    const text = formatSet(results);
    expect(text).toContain("| escaneado | 1 | 0% |");
    expect(text).toContain("| vetorial | 1 | 100% |");
  });
});

describe("diffProject", () => {
  it("turns the comparison into a takeoff of right, missed and extra marks", () => {
    const cand = reference();
    cand.measurements = [count("a", "grelha", 50, 50), count("b", "grelha", 900, 900)];
    cand.zones = [zone("z1", "sala", square(0, 0, 200))];
    const ref = reference();
    const diff = diffProject(ref, compareTakeoffs(ref, cand));
    expect(diff.drawings).toEqual(ref.drawings);
    const names = diff.items.map((i) => i.name).sort();
    expect(names).toEqual([
      "Certo: Grelha 400x200",
      "Faltou: Exaustor",
      "Faltou: Grelha 400x200",
      "Sobrou: Grelha 400x200",
    ]);
    expect(diff.measurements).toHaveLength(5);
    expect(diff.locations.map((l) => l.name).sort()).toEqual([
      "Certo: Sala 101 · 100%",
      "Faltou: Copa",
    ]);
    expect(diff.items.every((i) => i.materialPrice === 0)).toBe(true);
  });
});
