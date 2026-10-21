import { describe, expect, it } from "vitest";
import {
  bbox,
  distToPolyline,
  orthoSnap,
  pointAlong,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineLength,
  simplify,
} from "./geom";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("geom", () => {
  it("measures polyline length", () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
    expect(polylineLength(square, true)).toBe(40);
  });

  it("computes polygon area regardless of winding", () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
    expect(polygonArea(square.slice(0, 2))).toBe(0);
  });

  it("finds the centroid", () => {
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
  });

  it("walks along a polyline", () => {
    expect(
      pointAlong(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        0.5,
      ),
    ).toEqual({ x: 10, y: 0 });
    expect(
      pointAlong(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        0.25,
      ),
    ).toEqual({ x: 2.5, y: 0 });
  });

  it("tests point in polygon and distance to edges", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(distToPolyline({ x: 5, y: -3 }, square, true)).toBe(3);
    expect(distToPolyline({ x: 5, y: 12 }, square, false)).toBe(2);
  });

  it("snaps to 45 degree increments", () => {
    const p = orthoSnap({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.x).toBeCloseTo(Math.hypot(10, 1));
    expect(p.y).toBeCloseTo(0);
    const d = orthoSnap({ x: 0, y: 0 }, { x: 10, y: 9 });
    expect(d.x).toBeCloseTo(d.y);
  });

  it("simplifies near-collinear points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(simplify(pts, 0.5)).toEqual([pts[0], pts[2], pts[3]]);
    expect(bbox(pts)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});
