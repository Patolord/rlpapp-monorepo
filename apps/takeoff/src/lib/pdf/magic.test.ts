import { describe, expect, it } from "vitest";
import { freeSeed, openMask } from "./magic";

/** A w×h mask from rows of "#" (ink) and "." (paper). */
const mask = (rows: string[]) =>
  Uint8Array.from(rows.join("").split(""), (c) => (c === "#" ? 1 : 0));
const draw = (m: Uint8Array, w: number) =>
  Array.from({ length: m.length / w }, (_, y) =>
    Array.from(m.slice(y * w, (y + 1) * w), (v) => (v ? "#" : ".")).join(""),
  );

describe("openMask", () => {
  it("drops hairlines (hatch, text) and keeps thick strokes (walls) as they were", () => {
    const rows = [
      "..........",
      ".#....###.",
      "..#...###.",
      "...#..###.",
      "....#.###.",
      "......###.",
      "..........",
    ];
    // the diagonal one-pixel hatch line vanishes; the three-pixel wall stays whole
    expect(draw(openMask(mask(rows), 10, rows.length, 1), 10)).toEqual([
      "..........",
      "......###.",
      "......###.",
      "......###.",
      "......###.",
      "......###.",
      "..........",
    ]);
  });
});

describe("freeSeed", () => {
  it("keeps a free point, moves one on a line to the nearest paper, gives up when walled in", () => {
    const rows = [".....", "..#..", ".###.", "..#..", "....."];
    const m = mask(rows);
    expect(freeSeed(m, 5, 5, 0, 0, 2)).toEqual({ x: 0, y: 0 });
    // the centre is ink; the nearest paper is a diagonal neighbour
    expect(freeSeed(m, 5, 5, 2, 2, 2)).toEqual({ x: 1, y: 1 });
    expect(freeSeed(m, 5, 5, 2, 2, 0)).toBeNull();
    expect(freeSeed(m, 5, 5, 9, 9, 2)).toBeNull();
  });
});
