import { describe, expect, it } from "vitest";
import type { Pt } from "../geom";
import { shapesOf } from "../markingShapes";
import { metricScale } from "../units";
import { labelBox, labelCandidates, overlapArea, placeLabel } from "./labels";

const id = (p: Pt) => p;
const SIZE = { w: 40, h: 10 };
const SCALE = metricScale(50);

describe("label candidates", () => {
  it("tries a run at its middle, 0.3 and 0.7, then beside it, above first", () => {
    const run = shapesOf(
      [
        { x: 0, y: 100 },
        { x: 200, y: 100 },
      ],
      "linear",
      SCALE,
    );
    const c = labelCandidates(run, id, SIZE, 1);
    expect(c.slice(0, 3)).toEqual([
      { x: 100, y: 100 },
      { x: 60, y: 100 },
      { x: 140, y: 100 },
    ]);
    // beside a horizontal run: half the label's height plus the gap, up (y up) then down
    expect(c[3]).toEqual({ x: 100, y: 108 });
    expect(c[4]).toEqual({ x: 100, y: 92 });
  });

  it("clears a vertical run by half the label's width", () => {
    const run = shapesOf(
      [
        { x: 50, y: 0 },
        { x: 50, y: 300 },
      ],
      "linear",
      SCALE,
    );
    const c = labelCandidates(run, id, SIZE, 1);
    expect(Math.abs(c[3].x - 50)).toBeCloseTo(23);
    expect(c[3].y).toBeCloseTo(150);
  });

  it("starts an area at its centroid and a symbol at the screen's offset", () => {
    const area = shapesOf(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 60 },
        { x: 0, y: 60 },
      ],
      "area",
      SCALE,
    );
    const a = labelCandidates(area, id, SIZE, 1);
    expect(a[0]).toEqual({ x: 50, y: 30 });
    expect(a[1]).toEqual({ x: 50, y: 43 });
    const sym = shapesOf([{ x: 10, y: 10 }], "count", SCALE, { repeat: 3 });
    const s = labelCandidates(sym, id, SIZE, 0.5);
    // beside the symbol: the near edge at offset (10, -12) px, y flipped, 0.5 pt per px
    expect(s[0]).toEqual({ x: 10 + 5 + SIZE.w / 2, y: 16 });
    // mirrored to the left: the near edge as far on the other side
    expect(s[2]).toEqual({ x: 10 - 5 - SIZE.w / 2, y: 16 });
    expect(s).toHaveLength(4);
    expect(labelCandidates(shapesOf([{ x: 0, y: 0 }], "count", SCALE), id, SIZE, 1)).toEqual([]);
  });
});

describe("placeLabel", () => {
  const run = shapesOf(
    [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ],
    "linear",
    SCALE,
  );
  const candidates = labelCandidates(run, id, SIZE, 1);

  it("keeps the screen's spot when nothing is in the way", () => {
    expect(placeLabel(candidates, SIZE, { labels: [], text: [] })?.at).toEqual({ x: 100, y: 100 });
  });

  it("moves off the drawing's own text", () => {
    // "Sala 101" written across the middle of the run
    const text = [{ minX: 70, minY: 92, maxX: 130, maxY: 108 }];
    const placed = placeLabel(candidates, SIZE, { labels: [], text });
    expect(placed).toBeDefined();
    expect(overlapArea(placed!.box, text[0])).toBe(0);
  });

  it("avoids labels already placed before text, and stays in the frame", () => {
    const other = labelBox({ x: 100, y: 100 }, SIZE);
    const text = [{ minX: 30, minY: 95, maxX: 90, maxY: 105 }];
    const placed = placeLabel(candidates, SIZE, { labels: [other], text })!;
    expect(overlapArea(placed.box, other)).toBe(0);
    expect(placed.at).toEqual({ x: 140, y: 100 });
    // near the frame's right edge the in-frame spots win
    const bounds = { minX: 0, minY: 0, maxX: 150, maxY: 200 };
    const edge = placeLabel(candidates, SIZE, { labels: [other], text: [], bounds })!;
    expect(edge.box.maxX).toBeLessThanOrEqual(150);
    expect(overlapArea(edge.box, other)).toBe(0);
  });

  it("has nothing to place without candidates", () => {
    expect(placeLabel([], SIZE, { labels: [], text: [] })).toBeUndefined();
  });
});
