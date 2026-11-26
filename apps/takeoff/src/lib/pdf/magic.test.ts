import { describe, expect, it } from "vitest";
import { openMask } from "./magic";

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
