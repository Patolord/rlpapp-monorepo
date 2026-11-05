import { describe, expect, it } from "vitest";
import { findSimilar } from "./similar";
import { buildIndex } from "./vectorsCore";

/** A small "diffuser" symbol: square with a diagonal, placed at (ox, oy). */
function symbol(ox: number, oy: number, rot = 0): number[] {
  const pts = [
    [0, 0, 20, 0],
    [20, 0, 20, 20],
    [20, 20, 0, 20],
    [0, 20, 0, 0],
    [0, 0, 20, 20],
    [10, 0, 10, 8],
  ];
  const r = (x: number, y: number): [number, number] => {
    let p: [number, number] = [x - 10, y - 10];
    for (let k = 0; k < rot; k++) p = [-p[1], p[0]];
    return [p[0] + 10 + ox, p[1] + 10 + oy];
  };
  return pts.flatMap(([x1, y1, x2, y2]) => [...r(x1, y1), ...r(x2, y2)]);
}

describe("findSimilar", () => {
  it("finds translated copies of a symbol and ignores different shapes", () => {
    const segs = [
      ...symbol(100, 100),
      ...symbol(400, 250),
      ...symbol(700, 100),
      // a plain square without the diagonal and tick: must not match
      0,
      0,
      20,
      0,
      20,
      0,
      20,
      20,
      20,
      20,
      0,
      20,
      0,
      20,
      0,
      0,
      // random noise lines
      300,
      300,
      350,
      340,
      500,
      10,
      520,
      90,
    ];
    const idx = buildIndex(Float32Array.from(segs.map((v) => v + 1000)));
    const res = findSimilar(
      idx,
      { minX: 1095, minY: 1095, maxX: 1125, maxY: 1125 },
      { rotations: false },
    );
    expect(res.templateSegments).toBe(6);
    const found = res.centers
      .map((c) => [Math.round(c.x), Math.round(c.y)])
      .sort((a, b) => a[0] - b[0]);
    expect(found).toEqual([
      [1110, 1110],
      [1410, 1260],
      [1710, 1110],
    ]);
  });

  it("matches rotated copies when asked", () => {
    const segs = [...symbol(100, 100), ...symbol(300, 100, 1), ...symbol(500, 100, 2)];
    const idx = buildIndex(Float32Array.from(segs));
    const none = findSimilar(
      idx,
      { minX: 95, minY: 95, maxX: 125, maxY: 125 },
      { rotations: false },
    );
    expect(none.centers.length).toBe(1);
    const all = findSimilar(idx, { minX: 95, minY: 95, maxX: 125, maxY: 125 });
    expect(all.centers.length).toBe(3);
  });
});
