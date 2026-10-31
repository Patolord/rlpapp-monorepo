import { describe, expect, it } from "vitest";
import type { Pt } from "./geom";
import type { VrfRole, VrfRun } from "./vrf";
import {
  buildVrfTree,
  inferredHp,
  joinedEnds,
  layoutVrfTree,
  parentCandidates,
  type VrfTree,
  withEnd,
} from "./vrfTree";

let n = 0;
const run = (
  role: VrfRole,
  hp: number,
  points: Pt[],
  over: Partial<VrfRun> & { parent?: string } = {},
): VrfRun => ({
  id: over.id ?? `r${++n}`,
  system: "sys",
  spec: { role, hp, curves: 0, ...(over.parent ? { parent: over.parent } : {}) },
  length: 10,
  drawingId: over.drawingId ?? "d1",
  page: over.page ?? 0,
  points,
});
const p = (x: number, y: number): Pt => ({ x, y });
const endOf = (tree: ReturnType<typeof buildVrfTree>, runId: string) =>
  tree.nodes.get(tree.edges.get(runId)?.to ?? "");

describe("VRF tree from the drawing", () => {
  it("joins runs by shared endpoints and sums the evaporators downstream", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const trunk = run("trunk", 99, [p(100, 0), p(200, 0)], { id: "trunk" });
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const b = run("branch", 3, [p(200, 0), p(200, 50)], { id: "b" });
    const c = run("branch", 1.5, [p(250, 0), p(200, 0)], { id: "c" }); // drawn backwards
    const loose = run("branch", 4, [p(500, 500), p(600, 500)], { id: "loose" });
    const tree = buildVrfTree([main, trunk, a, b, c, loose]);

    expect(tree.root).toBe("condenser");
    expect(tree.loose.map((r) => r.id)).toEqual(["loose"]);
    expect(tree.nodes.get("condenser")?.hp).toBe(6.5);
    // the trunk carries b + c, whatever was typed
    expect(inferredHp(tree, "trunk")).toBe(4.5);
    expect(inferredHp(tree, "main")).toBe(6.5);
    expect(inferredHp(tree, "c")).toBe(1.5);
    expect(endOf(tree, "main")?.kind).toBe("joint");
    expect(endOf(tree, "main")?.children.sort()).toEqual(["a", "trunk"]);
    expect(endOf(tree, "trunk")?.kind).toBe("joint");
    expect(endOf(tree, "trunk")?.children.sort()).toEqual(["b", "c"]);
    expect(endOf(tree, "b")?.kind).toBe("evaporator");
  });

  it("joins endpoints within the tolerance", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const a = run("branch", 2, [p(104, 3), p(100, 50)], { id: "a" });
    const far = run("branch", 2, [p(110, 0), p(110, 50)], { id: "far" });
    const tree = buildVrfTree([main, a, far]);
    expect(tree.loose.map((r) => r.id)).toEqual(["far"]);
    expect(inferredHp(tree, "main")).toBe(2);
  });

  it("takes the main run's free end as the condenser", () => {
    const main = run("main", 0, [p(100, 0), p(0, 0)], { id: "main" }); // drawn towards the condenser
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const tree = buildVrfTree([main, a]);
    expect(tree.loose).toEqual([]);
    expect(inferredHp(tree, "main")).toBe(2);
  });

  it("attaches a run by its explicit parent when it is drawn elsewhere (another page)", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const trunk = run("trunk", 0, [p(100, 0), p(200, 0)], { id: "trunk" });
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const up = run("branch", 5, [p(10, 10), p(10, 60)], { id: "up", page: 1, parent: "trunk" });
    const tree = buildVrfTree([main, trunk, a, up]);
    expect(tree.loose).toEqual([]);
    expect(inferredHp(tree, "trunk")).toBe(5);
    expect(tree.nodes.get("condenser")?.hp).toBe(7);
    expect(endOf(tree, "trunk")?.kind).toBe("pass");
  });

  it("without a main run everything is loose", () => {
    const tree = buildVrfTree([run("branch", 2, [p(0, 0), p(10, 0)])]);
    expect(tree.root).toBeNull();
    expect(tree.loose).toHaveLength(1);
  });

  it("flags an intermediate run that ends in nothing and keeps its typed capacity", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const trunk = run("trunk", 6, [p(100, 0), p(200, 0)], { id: "trunk" });
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const tree = buildVrfTree([main, trunk, a]);
    expect(endOf(tree, "trunk")?.kind).toBe("open");
    expect(inferredHp(tree, "trunk")).toBe(6);
    expect(inferredHp(tree, "main")).toBe(8);
  });

  it("lays leaves out on successive rows and parents between their children", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const trunk = run("trunk", 0, [p(100, 0), p(200, 0)], { id: "trunk" });
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const b = run("branch", 3, [p(200, 0), p(200, 50)], { id: "b" });
    const c = run("branch", 1.5, [p(200, 0), p(250, 0)], { id: "c" });
    const tree = buildVrfTree([main, trunk, a, b, c]);
    const layout = layoutVrfTree(tree);
    expect(layout.rows).toBe(3);
    expect(layout.cols).toBe(4);
    const rowOf = (runId: string) => layout.pos.get(tree.edges.get(runId)?.to ?? "")?.row ?? -1;
    expect([rowOf("a"), rowOf("b"), rowOf("c")].sort()).toEqual([0, 1, 2]);
    expect(layout.pos.get(tree.edges.get("trunk")?.to ?? "")?.row).toBe(
      (rowOf("b") + rowOf("c")) / 2,
    );
    expect(layout.pos.get("condenser")?.col).toBe(0);
  });
});

describe("parent candidates", () => {
  it("offers reached main and intermediate runs, never the run itself or its descendants", () => {
    const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
    const trunk = run("trunk", 0, [p(100, 0), p(200, 0)], { id: "trunk" });
    const a = run("branch", 2, [p(100, 0), p(100, 50)], { id: "a" });
    const b = run("branch", 3, [p(200, 0), p(200, 50)], { id: "b" });
    const loose = run("branch", 4, [p(500, 500), p(600, 500)], { id: "loose" });
    const all = [main, trunk, a, b, loose];
    const tree = buildVrfTree(all);
    expect(parentCandidates(tree, all, "loose").map((r) => r.id)).toEqual(["main", "trunk"]);
    expect(parentCandidates(tree, all, "b").map((r) => r.id)).toEqual(["main", "trunk"]);
    // the trunk cannot hang from itself nor from what it feeds
    expect(parentCandidates(tree, all, "trunk").map((r) => r.id)).toEqual(["main"]);
    expect(parentCandidates(tree, all, "main")).toEqual([]);
  });
});

/** The tree's shape without coordinates: node kinds, children, capacities and loose runs. */
const shape = (tree: VrfTree) => ({
  root: tree.root,
  nodes: [...tree.nodes.values()].map((n) => [n.kind, n.inRun, n.children, n.hp, n.depth]),
  edges: [...tree.edges.entries()].map(([id, e]) => [id, e.hp]),
  loose: tree.loose.map((r) => r.id),
});

describe("joined ends", () => {
  const main = run("main", 0, [p(0, 0), p(100, 0)], { id: "main" });
  const trunk = run("trunk", 0, [p(100, 0), p(200, 0)], { id: "trunk" });
  const a = run("branch", 2, [p(103, 2), p(100, 50)], { id: "a" }); // clicked near the joint
  const b = run("branch", 3, [p(200, 50), p(200, 0)], { id: "b" }); // joined by its last point
  const other = run("branch", 1, [p(100, 0), p(100, -50)], { id: "other", page: 1 });
  const all = [main, trunk, a, b, other];

  it("finds the ends sharing a joint on the same page, as the tree joins them", () => {
    expect(joinedEnds(all, "main", 1)).toEqual([
      { id: "trunk", end: 0 },
      { id: "a", end: 0 },
    ]);
    expect(joinedEnds(all, "trunk", 1)).toEqual([{ id: "b", end: 1 }]);
    expect(joinedEnds(all, "main", 0)).toEqual([]);
    expect(joinedEnds(all, "nope", 0)).toEqual([]);
  });

  it("keeps the tree when a joint is dragged with its joined ends", () => {
    const before = buildVrfTree(all);
    const to = p(140, 80);
    const mates = joinedEnds(all, "main", 1);
    const moved = all.map((r) => {
      let pts = r.points ?? [];
      if (r.id === "main") pts = withEnd(pts, 1, to);
      for (const e of mates) if (e.id === r.id) pts = withEnd(pts, e.end, to);
      return { ...r, points: pts };
    });
    expect(moved.find((r) => r.id === "a")?.points).toEqual([to, p(100, 50)]);
    expect(shape(buildVrfTree(moved))).toEqual(shape(before));
    // dragged alone (Ctrl), the end leaves the joint and the runs after it come apart
    const detached = all.map((r) =>
      r.id === "main" ? { ...r, points: withEnd(r.points ?? [], 1, to) } : r,
    );
    expect(shape(buildVrfTree(detached))).not.toEqual(shape(before));
  });
});
