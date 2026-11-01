import { describe, expect, it } from "vitest";
import { DEFAULT_DUCT_SPEC } from "./ducts";
import type { Kit } from "./kits";
import {
  carriersLast,
  labelCarriers,
  markingShapes,
  markingTag,
  RING_LABEL_OFFSET,
  SYMBOL_LABEL_OFFSET,
  shapesOf,
} from "./markingShapes";
import type { Item, Measurement } from "./types";
import { metricScale } from "./units";

/** 1:50, so one metre is M page points. */
const SCALE = metricScale(50);
const M = SCALE.pointsPerUnit;

const item = (extra: Partial<Item>): Item => ({
  id: "i",
  name: "Item",
  kind: "count",
  group: "Geral",
  color: "#f97316",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
  ...extra,
});

const mark = (
  points: { x: number; y: number }[],
  extra: Partial<Measurement> = {},
): Measurement => ({
  id: "m",
  itemId: "i",
  drawingId: "d",
  page: 0,
  points,
  ...extra,
});

describe("markingShapes", () => {
  it("count: the item's symbol on the point, no label unless it repeats", () => {
    const s = markingShapes(mark([{ x: 10, y: 20 }]), item({ symbol: "fan" }), SCALE);
    expect(s.type).toBe("symbol");
    if (s.type !== "symbol") return;
    expect(s.at).toEqual({ x: 10, y: 20 });
    expect(s.symbol.id).toBe("fan");
    expect(s.label).toBeUndefined();

    const r = markingShapes(mark([{ x: 10, y: 20 }], { repeat: 3 }), item({}), SCALE);
    if (r.type !== "symbol") throw new Error("symbol expected");
    expect(r.symbol.id).toBe("dot");
    expect(r.label).toEqual({
      text: "×3",
      at: { x: 10, y: 20 },
      offset: SYMBOL_LABEL_OFFSET,
      beside: true,
    });
  });

  it("linear: an open path labelled with its length at the middle", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3 * M, y: 0 },
      { x: 3 * M, y: 1 * M },
    ];
    const s = markingShapes(mark(pts, { vertical: 0.5 }), item({ kind: "linear" }), SCALE);
    if (s.type !== "path") throw new Error("path expected");
    expect(s.closed).toBe(false);
    expect(s.points).toBe(pts);
    expect(s.label?.text).toBe("4.00 m + 0.50 m vert.");
    expect(s.label?.at.x).toBeCloseTo(2 * M, 9);
    expect(s.label?.at.y).toBeCloseTo(0, 9);
    expect(s.label?.offset).toBeUndefined();
  });

  it("linear without a scale says so", () => {
    const s = shapesOf(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      "linear",
      null,
    );
    expect(s.type === "path" && s.label?.text).toBe("100 pt · sem escala");
  });

  it("a one-point linear (click kit) is a ring labelled with its fixed length", () => {
    const s = markingShapes(
      mark([{ x: 5, y: 5 }], { vertical: 2, repeat: 2 }),
      item({ kind: "linear" }),
      SCALE,
    );
    expect(s).toEqual({
      type: "ring",
      at: { x: 5, y: 5 },
      label: { text: "2.00 m ×2", at: { x: 5, y: 5 }, offset: RING_LABEL_OFFSET },
    });
  });

  it("area: a closed polygon labelled with its area at the centroid", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 2 * M, y: 0 },
      { x: 2 * M, y: 3 * M },
      { x: 0, y: 3 * M },
    ];
    const s = markingShapes(mark(pts, { repeat: 4 }), item({ kind: "area" }), SCALE);
    if (s.type !== "path") throw new Error("path expected");
    expect(s.closed).toBe(true);
    expect(s.label?.text).toBe("6.00 m² ×4");
    expect(s.label?.at.x).toBeCloseTo(M, 9);
    expect(s.label?.at.y).toBeCloseTo(1.5 * M, 9);
  });

  it("duct run: the section a×b leads the label", () => {
    const m = mark(
      [
        { x: 0, y: 0 },
        { x: 0, y: 2 * M },
      ],
      { duct: { ...DEFAULT_DUCT_SPEC, a: 40, b: 25 } },
    );
    const net = item({ kind: "linear", derived: "duct" });
    expect(markingTag(m, net)).toBe("40×25");
    const s = markingShapes(m, net, SCALE);
    expect(s.type === "path" && s.label?.text).toBe("40×25 · 2.00 m");
  });

  it("points override the stored ones (a marking being dragged)", () => {
    const s = markingShapes(mark([{ x: 0, y: 0 }]), item({}), SCALE, {
      points: [{ x: 7, y: 8 }],
    });
    expect(s.type === "symbol" && s.at).toEqual({ x: 7, y: 8 });
  });
});

describe("run labels", () => {
  const run = [
    { x: 0, y: 0 },
    { x: 3 * M, y: 0 },
  ];
  const kits: Kit[] = [
    { id: "ls", name: "12.000 Inverter", label: '1/4" · 3/8"', components: [] },
    { id: "fan", name: "Ventilador", mode: "count", label: "VE-01 · 1.200 m³/h", components: [] },
  ];
  const textOf = (m: Measurement, it: Item, opts = {}) =>
    markingShapes(m, it, SCALE, { kits, ...opts }).label?.text;

  it("a kit run: its kit's label before the length", () => {
    const m = mark(run, { kitId: "ls", kitLabel: "antigo", linkId: "L" });
    expect(textOf(m, item({ kind: "linear" }))).toBe('1/4" · 3/8" · 3.00 m');
    // without the kit in the catalog, the label saved with the run
    expect(markingShapes(m, item({ kind: "linear" }), SCALE).label?.text).toBe("antigo · 3.00 m");
  });

  it("a count kit: the label beside the symbol, with ×N when it repeats", () => {
    const m = mark([{ x: 1, y: 2 }], { kitId: "fan", linkId: "F" });
    const s = markingShapes(m, item({ symbol: "fan" }), SCALE, { kits });
    expect(s.label).toEqual({
      text: "VE-01 · 1.200 m³/h",
      at: { x: 1, y: 2 },
      offset: SYMBOL_LABEL_OFFSET,
      beside: true,
    });
    expect(textOf({ ...m, repeat: 3 }, item({}))).toBe("VE-01 · 1.200 m³/h ×3");
  });

  it("the run's own label wins over its kit's, on any marking", () => {
    const m = mark(run, { kitId: "ls", label: "Linha A" });
    expect(textOf(m, item({ kind: "linear" }))).toBe("Linha A · 3.00 m");
    const ring = mark([{ x: 0, y: 0 }], { vertical: 2, label: "Dreno" });
    expect(textOf(ring, item({ kind: "linear" }))).toBe("Dreno · 2.00 m");
    const area = mark(
      [
        { x: 0, y: 0 },
        { x: M, y: 0 },
        { x: M, y: M },
      ],
      { label: "Forro", repeat: 2 },
    );
    expect(textOf(area, item({ kind: "area" }))).toBe("Forro · 0.50 m² ×2");
  });

  it("duct and VRF tags come first: tag · label · quantity", () => {
    const m = mark(run, {
      duct: { ...DEFAULT_DUCT_SPEC, a: 30, b: 20 },
      label: "VE-01",
      vertical: 1,
      repeat: 2,
    });
    expect(textOf(m, item({ kind: "linear", derived: "duct" }))).toBe(
      "30×20 · VE-01 · 3.00 m + 1.00 m vert. ×2",
    );
  });

  it("bare: the geometry without text", () => {
    const m = mark(run, { kitId: "ls" });
    const s = markingShapes(m, item({ kind: "linear" }), SCALE, { kits, bare: true });
    expect(s.type).toBe("path");
    expect(s.label).toBeUndefined();
    const sym = markingShapes(mark([{ x: 0, y: 0 }], { repeat: 2 }), item({}), SCALE, {
      bare: true,
    });
    expect(sym.label).toBeUndefined();
  });
});

describe("labelCarriers", () => {
  const kinds: Record<string, Item["kind"]> = { cobre: "linear", cabo: "linear", evap: "count" };
  const kindOf = (m: Measurement) => kinds[m.itemId];
  const at = (id: string, itemId: string, points: Measurement["points"], extra = {}) =>
    mark(points, { id, itemId, ...extra });
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("labels one member of each kit group and every unlinked marking", () => {
    const ms = [
      at("u1", "cobre", line),
      at("a1", "evap", [{ x: 0, y: 0 }], { linkId: "A" }), // a per-run count in a line kit
      at("a2", "cobre", line, { linkId: "A" }),
      at("a3", "cabo", line, { linkId: "A" }),
      at("u2", "evap", [{ x: 5, y: 5 }]),
    ];
    // the first run of the group, not the count placed at its start
    expect([...labelCarriers(ms, kindOf)].sort()).toEqual(["a2", "u1", "u2"]);
  });

  it("prefers the longest run of a group", () => {
    const longer = [...line, { x: 100, y: 50 }];
    const ms = [
      at("a1", "cobre", line, { linkId: "A" }),
      at("a2", "cabo", longer, { linkId: "A" }),
    ];
    expect([...labelCarriers(ms, kindOf)]).toEqual(["a2"]);
  });

  it("a click kit: the symbol carries the label, not its rings", () => {
    const p = [{ x: 3, y: 3 }];
    const ms = [
      at("r1", "cabo", p, { linkId: "C", vertical: 3 }),
      at("s1", "evap", p, { linkId: "C" }),
      at("s2", "evap", p, { linkId: "C" }),
    ];
    expect([...labelCarriers(ms, kindOf)]).toEqual(["s1"]);
  });

  it("only one text per kit run through markingShapes", () => {
    const kits: Kit[] = [{ id: "ls", name: "x", label: '1/4" · 3/8"', components: [] }];
    const ms = ["cobre", "cabo"].map((itemId, i) =>
      at(`k${i}`, itemId, line, { linkId: "L", kitId: "ls" }),
    );
    const carriers = labelCarriers(ms, kindOf);
    const texts = ms
      .map((m) =>
        markingShapes(m, item({ kind: "linear" }), null, { kits, bare: !carriers.has(m.id) }),
      )
      .map((s) => s.label?.text);
    expect(texts).toEqual(['1/4" · 3/8" · 100 pt · sem escala', undefined]);
  });

  it("paints a group's carrier after the group's other members, the rest in order", () => {
    const ms = [
      at("a1", "cobre", line, { linkId: "A" }),
      at("u1", "evap", [{ x: 0, y: 0 }]),
      at("a2", "cabo", line, { linkId: "A" }),
      at("a3", "cabo", line, { linkId: "A" }),
      at("u2", "evap", [{ x: 0, y: 0 }]),
    ];
    const carriers = labelCarriers(ms, kindOf);
    expect([...carriers].sort()).toEqual(["a1", "u1", "u2"]);
    expect(carriersLast(ms, carriers).map((m) => m.id)).toEqual(["u1", "a2", "a3", "a1", "u2"]);
  });
});
