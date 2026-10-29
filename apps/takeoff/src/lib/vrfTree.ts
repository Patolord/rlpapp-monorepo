import { dist, type Pt } from "./geom";
import type { VrfRun } from "./vrf";

/**
 * The topology of a VRF system, recovered from the drawing: runs that share an endpoint on the
 * same page are joined, a run may also name the run it continues (`spec.parent`, for risers and
 * runs drawn apart), and the tree is walked from the condenser outlet (the main run). With the
 * tree, the capacity downstream of every joint is the sum of the evaporators below it, which is
 * what sizes intermediate runs and Y-kits; the schematic view draws it.
 */

/** Endpoints this close (page points, about 2 mm on paper) count as one joint. */
export const JOIN_TOLERANCE = 6;

export type VrfNodeKind =
  /** The condenser outlet: the root. */
  | "condenser"
  /** Two or more runs leave: a Y-kit (or a header when three or more). */
  | "joint"
  /** One run continues another without branching (a bend, a page change, a riser). */
  | "pass"
  /** A ramal ends here: an evaporator. */
  | "evaporator"
  /** A main or intermediate run ends with nothing after it. */
  | "open";

export interface VrfNode {
  id: string;
  kind: VrfNodeKind;
  /** Run arriving here (none at the condenser). */
  inRun?: string;
  /** Runs leaving here, in drawing order. */
  children: string[];
  /** Capacity downstream: the sum of the evaporators below (the ramal's HP at an evaporator). */
  hp: number;
  /** Edges from the condenser. */
  depth: number;
}

export interface VrfEdge {
  from: string;
  to: string;
  /** Capacity the run carries: the HP of the node it arrives at. */
  hp: number;
}

export interface VrfTree {
  /** Condenser node id, or null when no run is marked "Saída da condensadora". */
  root: string | null;
  nodes: Map<string, VrfNode>;
  /** By run id, for every run reached from the condenser. */
  edges: Map<string, VrfEdge>;
  /** Runs not reached from the condenser (drawn apart, or no main run at all). */
  loose: VrfRun[];
}

interface Endpoint {
  run: VrfRun;
  end: 0 | 1;
  pt: Pt;
  page: string;
}

const pageKey = (r: VrfRun) => `${r.drawingId ?? ""}#${r.page ?? 0}`;

/** Clusters run endpoints into joints: "runId:end" -> joint id. */
function joinEndpoints(runs: VrfRun[]): Map<string, string> {
  const endpoints: Endpoint[] = [];
  for (const r of runs) {
    if (!r.id || !r.points || r.points.length < 2) continue;
    const page = pageKey(r);
    endpoints.push({ run: r, end: 0, pt: r.points[0], page });
    endpoints.push({ run: r, end: 1, pt: r.points[r.points.length - 1], page });
  }
  const joints: { id: string; page: string; pt: Pt }[] = [];
  const of = new Map<string, string>();
  for (const e of endpoints) {
    let joint = joints.find((j) => j.page === e.page && dist(j.pt, e.pt) <= JOIN_TOLERANCE);
    if (!joint) {
      joint = { id: `j${joints.length}`, page: e.page, pt: e.pt };
      joints.push(joint);
    }
    of.set(`${e.run.id}:${e.end}`, joint.id);
  }
  return of;
}

/** Builds the tree of one system's runs. Runs without an id or geometry can only be loose. */
export function buildVrfTree(runs: VrfRun[]): VrfTree {
  const byId = new Map<string, VrfRun>();
  for (const r of runs) if (r.id) byId.set(r.id, r);
  const jointOf = joinEndpoints(runs);
  const endJoint = (r: VrfRun, end: 0 | 1) => jointOf.get(`${r.id}:${end}`);

  // runs touching each joint, and runs naming each run as their parent
  const atJoint = new Map<string, VrfRun[]>();
  for (const r of byId.values()) {
    for (const end of [0, 1] as const) {
      const j = endJoint(r, end);
      if (!j) continue;
      const list = atJoint.get(j) ?? [];
      if (!list.includes(r)) list.push(r);
      atJoint.set(j, list);
    }
  }
  const childrenByParent = new Map<string, VrfRun[]>();
  for (const r of byId.values()) {
    const p = r.spec.parent;
    if (!p || !byId.has(p) || p === r.id) continue;
    childrenByParent.set(p, [...(childrenByParent.get(p) ?? []), r]);
  }

  const nodes = new Map<string, VrfNode>();
  const edges = new Map<string, VrfEdge>();
  const visited = new Set<string>();

  // the condenser outlet: the first main run that no run claims as its continuation
  const main = [...byId.values()].find((r) => r.spec.role === "main" && !r.spec.parent);
  if (!main?.id) return { root: null, nodes, edges, loose: runs };

  // the main run leaves the condenser by the end nothing else touches (else by its first point)
  const shared = (j: string | undefined) => (j ? (atJoint.get(j)?.length ?? 0) > 1 : false);
  const upstreamEnd: 0 | 1 = shared(endJoint(main, 0)) && !shared(endJoint(main, 1)) ? 1 : 0;
  const rootId = "condenser";
  nodes.set(rootId, { id: rootId, kind: "condenser", children: [], hp: 0, depth: 0 });

  // walk downstream: each run arrives at a node where the runs continuing it leave
  const walk = (run: VrfRun, fromNode: string, upEnd: 0 | 1 | null, depth: number) => {
    if (!run.id || visited.has(run.id)) return;
    visited.add(run.id);
    nodes.get(fromNode)?.children.push(run.id);
    const downJoint = upEnd === null ? undefined : endJoint(run, upEnd === 0 ? 1 : 0);
    // one node per run end; a joint already reached by another path is not reused
    const nodeId = downJoint && !nodes.has(downJoint) ? downJoint : `end:${run.id}`;
    nodes.set(nodeId, { id: nodeId, kind: "open", inRun: run.id, children: [], hp: 0, depth });
    edges.set(run.id, { from: fromNode, to: nodeId, hp: 0 });
    const next: { run: VrfRun; upEnd: 0 | 1 | null }[] = [];
    if (downJoint) {
      for (const r of atJoint.get(downJoint) ?? []) {
        if (r.id === run.id || visited.has(r.id ?? "")) continue;
        next.push({ run: r, upEnd: endJoint(r, 0) === downJoint ? 0 : 1 });
      }
    }
    for (const r of childrenByParent.get(run.id) ?? []) {
      // a run attached by name is taken as drawn from its upstream end
      if (!visited.has(r.id ?? "")) next.push({ run: r, upEnd: r.points ? 0 : null });
    }
    for (const n of next) walk(n.run, nodeId, n.upEnd, depth + 1);
  };
  walk(main, rootId, upstreamEnd, 1);

  // kinds and capacities, leaves first
  const settle = (id: string): number => {
    const node = nodes.get(id);
    if (!node) return 0;
    const inRun = node.inRun ? byId.get(node.inRun) : undefined;
    if (node.children.length === 0) {
      if (node.id !== rootId) node.kind = inRun?.spec.role === "branch" ? "evaporator" : "open";
      // an open end keeps the typed capacity, so the sizing does not collapse to zero
      node.hp = inRun?.spec.hp ?? 0;
    } else {
      if (node.id !== rootId) node.kind = node.children.length > 1 ? "joint" : "pass";
      node.hp = 0;
      for (const c of node.children) {
        const e = edges.get(c);
        if (!e) continue;
        e.hp = settle(e.to);
        node.hp += e.hp;
      }
    }
    return node.hp;
  };
  settle(rootId);

  const loose = runs.filter((r) => !r.id || !visited.has(r.id));
  return { root: rootId, nodes, edges, loose };
}

/** Capacity the tree gives a run: the sum of the evaporators downstream of it. */
export const inferredHp = (tree: VrfTree, runId: string): number | undefined =>
  tree.edges.get(runId)?.hp;

export interface VrfLayout {
  /** Node id -> column (edges from the condenser) and row (evaporators top to bottom). */
  pos: Map<string, { col: number; row: number }>;
  cols: number;
  rows: number;
}

/** Tidy left-to-right layout: leaves get successive rows, each parent the mean of its children. */
export function layoutVrfTree(tree: VrfTree): VrfLayout {
  const pos = new Map<string, { col: number; row: number }>();
  let rows = 0;
  let cols = 0;
  const place = (id: string): number => {
    const node = tree.nodes.get(id);
    if (!node) return 0;
    cols = Math.max(cols, node.depth + 1);
    let row: number;
    if (node.children.length === 0) row = rows++;
    else {
      const ys = node.children
        .map((c) => tree.edges.get(c)?.to)
        .filter((t): t is string => !!t)
        .map(place);
      row = ys.reduce((a, b) => a + b, 0) / ys.length;
    }
    pos.set(id, { col: node.depth, row });
    return row;
  };
  if (tree.root) place(tree.root);
  return { pos, cols, rows };
}
