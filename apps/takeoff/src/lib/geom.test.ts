import { describe, expect, it } from "vitest";
import {
  bbox,
  distToPolyline,
  hitMidpoint,
  hitVertex,
  insertVertex,
  moveVertex,
  orthoSnap,
  pointAlong,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polylineLength,
  removeVertex,
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

  it("hits the nearest vertex within the tolerance", () => {
    expect(hitVertex(square, { x: 9, y: 1 }, 2)).toBe(1);
    expect(hitVertex(square, { x: 5, y: 5 }, 2)).toBe(-1);
    // two vertices in reach: the nearer wins
    const close = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(hitVertex(close, { x: 0.8, y: 0 }, 2)).toBe(1);
  });

  it("hits segment midpoints, with the closing one only on polygons", () => {
    expect(hitMidpoint(square, { x: 5, y: 0.5 }, 1)).toBe(0);
    expect(hitMidpoint(square, { x: 10, y: 5 }, 1)).toBe(1);
    expect(hitMidpoint(square, { x: 0, y: 5 }, 1)).toBe(-1);
    expect(hitMidpoint(square, { x: 0, y: 5 }, 1, true)).toBe(3);
    expect(hitMidpoint(square, { x: 3, y: 3 }, 1, true)).toBe(-1);
  });

  it("inserts, moves and removes vertices without touching the input", () => {
    const pts = square.slice(0, 3);
    expect(insertVertex(pts, 0, { x: 5, y: 0 })).toEqual([
      square[0],
      { x: 5, y: 0 },
      square[1],
      square[2],
    ]);
    // the closing segment of a polygon appends after the last vertex
    expect(insertVertex(square, 3, { x: 0, y: 5 }).at(-1)).toEqual({ x: 0, y: 5 });
    expect(moveVertex(pts, 1, { x: 12, y: 1 })).toEqual([square[0], { x: 12, y: 1 }, square[2]]);
    expect(removeVertex(square, 1, 3)).toEqual([square[0], square[2], square[3]]);
    expect(removeVertex(pts, 1, 3)).toBeNull();
    expect(removeVertex(pts, 5, 2)).toBeNull();
    expect(pts).toEqual(square.slice(0, 3));
  });
});
