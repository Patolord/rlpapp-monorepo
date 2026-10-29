import { describe, expect, it } from "vitest";
import type { Pt } from "./geom";
import type { VrfRole, VrfRun } from "./vrf";
import { buildVrfTree, inferredHp, layoutVrfTree } from "./vrfTree";

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
