import { describe, expect, it } from "vitest";
import { useStore } from "../store";
import type { Pt } from "./geom";
import { joinedAt, reshape } from "./reshape";
import { emptyProject, type Item, type Measurement, type Project } from "./types";

const p = (x: number, y: number): Pt => ({ x, y });
const item = (id: string, kind: Item["kind"]): Item => ({
  id,
  name: id,
  kind,
  color: "#000",
  group: "G",
  materialPrice: 0,
  laborPrice: 0,
  wastePct: 0,
});
const meas = (id: string, itemId: string, points: Pt[], over: Partial<Measurement> = {}) => ({
  id,
  itemId,
  drawingId: "d1",
  page: 0,
  points,
  ...over,
});
const vrf = { role: "branch" as const, hp: 2, curves: 0 };

const project = (): Project => ({
  ...emptyProject(),
  items: [item("lin", "linear"), item("cnt", "count"), item("sys", "linear")],
  measurements: [
    meas("k1", "lin", [p(0, 0), p(10, 0), p(10, 10)], { linkId: "kit" }),
    meas("k2", "lin", [p(0, 0), p(10, 0), p(10, 10)], { linkId: "kit" }),
    meas("k3", "cnt", [p(0, 0)], { linkId: "kit" }),
    meas("solo", "lin", [p(50, 50), p(60, 50)]),
    meas("v1", "sys", [p(0, 100), p(100, 100)], { vrf }),
    meas("v2", "sys", [p(102, 101), p(100, 150)], { vrf }),
    meas("v3", "sys", [p(100, 100), p(100, 50)], { vrf, page: 1 }),
    meas("v4", "lin", [p(100, 100), p(200, 100)]),
  ],
  zones: [
    { id: "z", locationId: "l", drawingId: "d1", page: 0, points: [p(0, 0), p(5, 0), p(5, 5)] },
  ],
});

describe("reshape", () => {
  it("gives kit members the same geometry and counted members the first point", () => {
    const next = [p(1, 1), p(10, 0), p(10, 10)];
    const out = reshape(project(), "k2", next);
    expect([...out.keys()].sort()).toEqual(["k1", "k2", "k3"]);
    expect(out.get("k1")).toEqual(next);
    expect(out.get("k3")).toEqual([p(1, 1)]);
    expect(reshape(project(), "solo", [p(0, 0), p(1, 1)]).size).toBe(1);
    expect(reshape(project(), "z", [p(0, 0), p(6, 0), p(6, 6)]).get("z")).toHaveLength(3);
    expect(reshape(project(), "nope", []).size).toBe(0);
  });

  it("moves the VRF run ends joined to a dragged endpoint, on the same page and system", () => {
    const pr = project();
    const joined = joinedAt(pr, "v1", 1);
    // v3 is on another page, v4 is not a VRF run
    expect(joined).toEqual({ end: 1, mates: [{ id: "v2", end: 0 }] });
    expect(joinedAt(pr, "v1", 0)).toBeNull();
    expect(joinedAt(pr, "solo", 1)).toBeNull();
    const out = reshape(pr, "v1", [p(0, 100), p(120, 90)], joined);
    expect(out.get("v2")).toEqual([p(120, 90), p(100, 150)]);
    expect(out.has("v3")).toBe(false);
    expect(out.has("v4")).toBe(false);
  });
});

describe("setPoints", () => {
  it("reshapes a kit run in one undo step", () => {
    const s = useStore.getState();
    s.resetProject(project(), null);
    const next = [p(0, 0), p(20, 0), p(20, 10)];
    useStore.getState().setPoints("k1", next);
    const after = useStore.getState().project.measurements;
    expect(after.find((m) => m.id === "k2")?.points).toEqual(next);
    expect(after.find((m) => m.id === "solo")?.points).toEqual([p(50, 50), p(60, 50)]);
    useStore.getState().undo();
    expect(useStore.getState().project.measurements.find((m) => m.id === "k2")?.points).toEqual([
      p(0, 0),
      p(10, 0),
      p(10, 10),
    ]);
  });

  it("reshapes a zone", () => {
    useStore.getState().resetProject(project(), null);
    useStore.getState().setPoints("z", [p(0, 0), p(8, 0), p(8, 8), p(0, 8)]);
    expect(useStore.getState().project.zones[0].points).toHaveLength(4);
  });
});
