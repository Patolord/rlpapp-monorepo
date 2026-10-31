import { describe, expect, it } from "vitest";
import { clipboardOf, cloneMarkings, scalesDiffer } from "./clone";
import type { Pt } from "./geom";
import { emptyProject, type Measurement, type Project, type Zone } from "./types";
import { imperialScale, metricScale } from "./units";

const p = (x: number, y: number): Pt => ({ x, y });
const shift =
  (dx: number, dy: number) =>
  (q: Pt): Pt => ({ x: q.x + dx, y: q.y + dy });
const same = (q: Pt): Pt => q;

const m = (id: string, over: Partial<Measurement> = {}): Measurement => ({
  id,
  itemId: "count",
  drawingId: "d1",
  page: 0,
  points: [p(10, 10)],
  ...over,
});
const z = (id: string, over: Partial<Zone> = {}): Zone => ({
  id,
  locationId: "loc",
  drawingId: "d1",
  page: 0,
  points: [p(0, 0), p(100, 0), p(100, 50), p(0, 50)],
  ...over,
});

function project(measurements: Measurement[], zones: Zone[] = []): Project {
  return {
    ...emptyProject(),
    locations: [
      { id: "loc", name: "Térreo", color: "#38bdf8" },
      { id: "other", name: "Cobertura", color: "#fb923c" },
    ],
    measurements,
    zones,
  };
}

const target = { drawingId: "d2", page: 3 };

describe("cloneMarkings", () => {
  it("copies only the given ids onto the target page with fresh ids", () => {
    const src = project([m("a"), m("b"), m("c")], [z("z1"), z("z2")]);
    const out = cloneMarkings(src, ["a", "c", "z2"], target, same);
    expect(out.measurements).toHaveLength(2);
    expect(out.zones).toHaveLength(1);
    const ids = [...out.measurements, ...out.zones].map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(["a", "b", "c", "z1", "z2"]).not.toContain(id);
    for (const x of [...out.measurements, ...out.zones]) {
      expect(x.drawingId).toBe("d2");
      expect(x.page).toBe(3);
    }
  });

  it("keeps the source order and ignores unknown ids", () => {
    const src = project([m("a", { itemId: "i1" }), m("b", { itemId: "i2" })]);
    const out = cloneMarkings(src, ["b", "missing", "a"], target, same);
    expect(out.measurements.map((x) => x.itemId)).toEqual(["i1", "i2"]);
    expect(cloneMarkings(src, [], target, same)).toEqual({ measurements: [], zones: [] });
  });

  it("moves every point through the transform and leaves the originals untouched", () => {
    const run = m("a", { itemId: "lin", points: [p(0, 0), p(30, 40)] });
    const region = z("z1");
    const src = project([run], [region]);
    const out = cloneMarkings(src, ["a", "z1"], target, shift(5, -2));
    expect(out.measurements[0].points).toEqual([p(5, -2), p(35, 38)]);
    expect(out.zones[0].points[2]).toEqual(p(105, 48));
    expect(run.points).toEqual([p(0, 0), p(30, 40)]);
    expect(region.points[0]).toEqual(p(0, 0));
  });

  it("never shares point objects with the originals, even with an identity transform", () => {
    const src = project([m("a")], [z("z1")]);
    const out = cloneMarkings(src, ["a", "z1"], target, same);
    expect(out.measurements[0].points[0]).not.toBe(src.measurements[0].points[0]);
    expect(out.zones[0].points[0]).not.toBe(src.zones[0].points[0]);
  });

  it("remaps kit groups to new link ids: grouped among the copies, apart from the originals", () => {
    const src = project([
      m("k1", { linkId: "L1", itemId: "cobre" }),
      m("k2", { linkId: "L1", itemId: "cabo" }),
      m("k3", { linkId: "L2", itemId: "cobre" }),
      m("k4", { linkId: "L2", itemId: "cabo" }),
      m("solo"),
    ]);
    const out = cloneMarkings(src, ["k1", "k2", "k3", "k4", "solo"], target, same);
    const [c1, c2, c3, c4, solo] = out.measurements;
    expect(c1.linkId).toBeTruthy();
    expect(c1.linkId).toBe(c2.linkId);
    expect(c3.linkId).toBe(c4.linkId);
    expect(c1.linkId).not.toBe(c3.linkId);
    for (const c of [c1, c3]) expect(["L1", "L2"]).not.toContain(c.linkId);
    expect(solo.linkId).toBeUndefined();
    expect("linkId" in solo).toBe(false);
  });

  it("gives two pastes of the same group different link ids", () => {
    const src = project([m("k1", { linkId: "L1" }), m("k2", { linkId: "L1" })]);
    const a = cloneMarkings(src, ["k1", "k2"], target, same);
    const b = cloneMarkings(src, ["k1", "k2"], target, same);
    expect(a.measurements[0].linkId).not.toBe(b.measurements[0].linkId);
  });

  it("points a VRF parent at the copy of the parent when it is copied too", () => {
    const src = project([
      m("main", { itemId: "vrf", vrf: { role: "main", hp: 0, curves: 2 } }),
      m("riser", { itemId: "vrf", vrf: { role: "trunk", hp: 8, curves: 0, parent: "main" } }),
    ]);
    const out = cloneMarkings(src, ["riser", "main"], target, same);
    const [main, riser] = out.measurements;
    expect(riser.vrf).toEqual({ role: "trunk", hp: 8, curves: 0, parent: main.id });
    expect(src.measurements[1].vrf?.parent).toBe("main");
  });

  it("drops a VRF parent that is not part of the copy", () => {
    const src = project([
      m("main", { itemId: "vrf", vrf: { role: "main", hp: 0, curves: 0 } }),
      m("branch", { itemId: "vrf", vrf: { role: "branch", hp: 2, curves: 3, parent: "main" } }),
    ]);
    const out = cloneMarkings(src, ["branch"], target, same);
    expect(out.measurements[0].vrf).toEqual({ role: "branch", hp: 2, curves: 3 });
    expect(out.measurements[0].vrf && "parent" in out.measurements[0].vrf).toBe(false);
  });

  it("keeps item, duct section, vertical and repeat, without sharing the duct object", () => {
    const duct = {
      a: 60,
      b: 30,
      insulation: "L" as const,
      inner: "S" as const,
      flange: "P" as const,
      rechapeado: false,
      paintRechap: false,
    };
    const src = project([
      m("d", { itemId: "rede", points: [p(0, 0), p(50, 0)], duct, vertical: 3, repeat: 4 }),
    ]);
    const [copy] = cloneMarkings(src, ["d"], target, same).measurements;
    expect(copy.itemId).toBe("rede");
    expect(copy.duct).toEqual(duct);
    expect(copy.duct).not.toBe(duct);
    expect(copy.vertical).toBe(3);
    expect(copy.repeat).toBe(4);
  });

  it("keeps a region's location, hidden flag and repeat", () => {
    const src = project([], [z("z1", { locationId: "other", hidden: true, repeat: 20 })]);
    const [copy] = cloneMarkings(src, ["z1"], target, same).zones;
    expect(copy.locationId).toBe("other");
    expect(copy.hidden).toBe(true);
    expect(copy.repeat).toBe(20);
  });

  it("clones from a clipboard as well as from a project", () => {
    const src = project([m("a", { linkId: "L" }), m("b", { linkId: "L" })], [z("z1")]);
    const clip = clipboardOf(src, ["a", "b", "z1"]);
    if (!clip) throw new Error("no clipboard");
    const ids = [...clip.measurements, ...clip.zones].map((x) => x.id);
    const out = cloneMarkings(clip, ids, target, same);
    expect(out.measurements).toHaveLength(2);
    expect(out.zones).toHaveLength(1);
    expect(out.measurements[0].linkId).toBe(out.measurements[1].linkId);
  });
});

describe("clipboardOf", () => {
  it("takes the selected markings, their locations and the centre of their box", () => {
    const src = project(
      [m("a", { points: [p(200, 300)] }), m("b", { points: [p(999, 999)] })],
      [z("z1", { locationId: "other" })],
    );
    const clip = clipboardOf(src, ["a", "z1"]);
    expect(clip?.measurements.map((x) => x.id)).toEqual(["a"]);
    expect(clip?.zones.map((x) => x.id)).toEqual(["z1"]);
    expect(clip?.locations.map((l) => l.id)).toEqual(["other"]);
    // box from (0,0) to (200,300)
    expect(clip?.anchor).toEqual(p(100, 150));
  });

  it("is null when nothing selected exists", () => {
    expect(clipboardOf(project([m("a")]), [])).toBeNull();
    expect(clipboardOf(project([m("a")]), ["gone"])).toBeNull();
  });

  it("anchors a single count mark on the mark itself", () => {
    const clip = clipboardOf(project([m("a", { points: [p(7, 9)] })]), ["a"]);
    expect(clip?.anchor).toEqual(p(7, 9));
    expect(clip?.locations).toEqual([]);
  });
});

describe("scalesDiffer", () => {
  it("compares points per unit and unit", () => {
    expect(scalesDiffer(metricScale(50), metricScale(50))).toBe(false);
    expect(scalesDiffer(metricScale(50), metricScale(100))).toBe(true);
    expect(scalesDiffer(metricScale(50), { ...metricScale(50), label: "calibrada" })).toBe(false);
    expect(scalesDiffer(metricScale(50), imperialScale("1/4\" = 1'", 1 / 4))).toBe(true);
  });

  it("treats an uncalibrated page as different from a calibrated one", () => {
    expect(scalesDiffer(null, null)).toBe(false);
    expect(scalesDiffer(metricScale(50), null)).toBe(true);
    expect(scalesDiffer(null, metricScale(50))).toBe(true);
  });
});
