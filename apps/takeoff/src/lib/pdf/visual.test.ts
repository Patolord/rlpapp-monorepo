import { describe, expect, it } from "vitest";
import { crop, downsample, type Gray, matchTemplate, rotate90 } from "./visual";

const blank = (width: number, height: number): Gray => ({
  width,
  height,
  data: new Uint8Array(width * height),
});

/** Stamp an asymmetric "fan" glyph (box, diagonal, dot) with its top-left at (x, y). */
function stamp(g: Gray, x: number, y: number, size = 40, rot = 0) {
  const glyph = blank(size, size);
  const put = (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < size && py < size) glyph.data[py * size + px] = 255;
  };
  for (let i = 0; i < size; i++) {
    put(i, 0);
    put(i, size - 1);
    put(0, i);
    put(size - 1, i);
    put(i, i); // diagonal breaks the symmetry
    put(i, i + 1);
  }
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) put(size - 10 + dx, 10 + dy);
  const r = rotate90(glyph, rot);
  for (let yy = 0; yy < r.height; yy++) {
    for (let xx = 0; xx < r.width; xx++) {
      const v = r.data[yy * r.width + xx];
      if (v) g.data[(y + yy) * g.width + (x + xx)] = v;
    }
  }
}

describe("visual symbol search", () => {
  it("finds every copy of the template, including rotated ones, and nothing else", () => {
    const page = blank(600, 400);
    const places: [number, number, number][] = [
      [20, 20, 0],
      [300, 50, 0],
      [100, 250, 2],
      [450, 280, 1],
    ];
    for (const [x, y, r] of places) stamp(page, x, y, 40, r);
    // distractors: a plain box without the diagonal, and a long wall
    const box = blank(40, 40);
    for (let i = 0; i < 40; i++) {
      box.data[i] = box.data[39 * 40 + i] = box.data[i * 40] = box.data[i * 40 + 39] = 255;
    }
    for (let yy = 0; yy < 40; yy++)
      for (let xx = 0; xx < 40; xx++)
        page.data[(200 + yy) * 600 + 500 + xx] = box.data[yy * 40 + xx];
    for (let xx = 0; xx < 600; xx++) page.data[380 * 600 + xx] = 255;

    const tpl = crop(page, 18, 18, 44, 44);
    const matches = matchTemplate(page, tpl, { minScore: 0.6 });
    const strong = matches.filter((m) => m.score >= 0.8);
    expect(strong).toHaveLength(4);
    for (const [x, y] of places) {
      const hit = strong.find((m) => Math.hypot(m.cx - (x + 20), m.cy - (y + 20)) <= 3);
      expect(hit, `match at ${x},${y}`).toBeTruthy();
    }
    // the plain box must score clearly lower than the real copies
    const boxHit = matches.find((m) => Math.hypot(m.cx - 520, m.cy - 220) <= 4);
    expect(boxHit === undefined || boxHit.score < 0.8).toBe(true);
  });

  it("downsample averages and rotate90 keeps pixels", () => {
    const g = blank(4, 2);
    g.data.set([255, 255, 0, 0, 255, 255, 0, 0]);
    const d = downsample(g, 2);
    expect(Array.from(d.data)).toEqual([255, 0]);
    const r = rotate90(g, 1);
    expect(r.width).toBe(2);
    expect(r.height).toBe(4);
    expect(rotate90(rotate90(g, 2), 2).data).toEqual(g.data);
  });
});
