import { describe, expect, it } from "vitest";
import { clampRegion, gridLines, gridStep, MAX_PX_PER_PT, viewScale } from "./viewMath";

const page = { w: 2384, h: 1684 }; // an A1 sheet in points

describe("clampRegion", () => {
  it("is the whole page when no region is asked", () => {
    expect(clampRegion(undefined, page)).toEqual({ x: 0, y: 0, w: 2384, h: 1684 });
  });

  it("cuts a region to the page and rejects one that misses it", () => {
    expect(clampRegion({ x: -50, y: 1600, w: 200, h: 200 }, page)).toEqual({
      x: 0,
      y: 1600,
      w: 150,
      h: 84,
    });
    expect(clampRegion({ x: 3000, y: 0, w: 100, h: 100 }, page)).toBeNull();
  });
});

describe("viewScale", () => {
  it("fits the longest side to the asked pixels", () => {
    expect(viewScale({ x: 0, y: 0, w: 2384, h: 1684 }, 1400)).toBeCloseTo(1400 / 2384);
    expect(viewScale({ x: 0, y: 0, w: 200, h: 400 }, 1400)).toBeCloseTo(3.5);
  });

  it("does not upscale a tiny region beyond what is useful, nor exceed the largest picture", () => {
    expect(viewScale({ x: 0, y: 0, w: 20, h: 20 }, 1400)).toBe(MAX_PX_PER_PT);
    expect(viewScale({ x: 0, y: 0, w: 1000, h: 1000 }, 99_999)).toBe(2);
  });
});

describe("gridStep and gridLines", () => {
  it("picks a round step that gives about ten lines", () => {
    expect(gridStep({ x: 0, y: 0, w: 2384, h: 1684 })).toBe(500);
    expect(gridStep({ x: 0, y: 0, w: 400, h: 300 })).toBe(50);
    expect(gridStep({ x: 0, y: 0, w: 90, h: 60 })).toBe(10);
    expect(gridStep({ x: 0, y: 0, w: 4, h: 4 })).toBe(1);
  });

  it("lists the multiples of the step inside the region", () => {
    expect(gridLines(120, 390, 50)).toEqual([150, 200, 250, 300, 350]);
    expect(gridLines(100, 200, 50)).toEqual([100, 150, 200]);
  });
});
