import { describe, expect, it } from "vitest";
import { DEFAULT_DUCT_SPEC } from "./ducts";
import {
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
    expect(r.label).toEqual({ text: "×3", at: { x: 10, y: 20 }, offset: SYMBOL_LABEL_OFFSET });
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
    expect(s.label.text).toBe("4.00 m + 0.50 m vert.");
    expect(s.label.at.x).toBeCloseTo(2 * M, 9);
    expect(s.label.at.y).toBeCloseTo(0, 9);
    expect(s.label.offset).toBeUndefined();
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
    expect(s.type === "path" && s.label.text).toBe("100 pt · sem escala");
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
    expect(s.label.text).toBe("6.00 m² ×4");
    expect(s.label.at.x).toBeCloseTo(M, 9);
    expect(s.label.at.y).toBeCloseTo(1.5 * M, 9);
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
    expect(s.type === "path" && s.label.text).toBe("40×25 · 2.00 m");
  });

  it("points override the stored ones (a marking being dragged)", () => {
    const s = markingShapes(mark([{ x: 0, y: 0 }]), item({}), SCALE, {
      points: [{ x: 7, y: 8 }],
    });
    expect(s.type === "symbol" && s.at).toEqual({ x: 7, y: 8 });
  });
});
