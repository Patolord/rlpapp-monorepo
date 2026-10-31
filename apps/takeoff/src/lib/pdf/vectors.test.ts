import { OPS } from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { extractVectors, snapPoint } from "./vectors";

/** Minimal stand-in for a PDFPageProxy: identity viewport, one op list. */
function fakePage(fnArray: number[], argsArray: unknown[]) {
  return {
    getOperatorList: async () => ({ fnArray, argsArray }),
    getViewport: () => ({ transform: [1, 0, 0, 1, 0, 0] }),
    // biome-ignore lint/suspicious/noExplicitAny: test double
  } as any;
}

const path = (...cmds: number[]) =>
  [OPS.constructPath, [OPS.stroke, [Float32Array.from(cmds)], null]] as const;

describe("vector extraction", () => {
  it("extracts lines, closes subpaths and applies transforms", async () => {
    const fns: number[] = [];
    const args: unknown[] = [];
    const push = (op: readonly [number, unknown]) => {
      fns.push(op[0]);
      args.push(op[1]);
    };
    // square 0,0 -> 10,10 via moveTo/lineTo/closePath
    push(path(0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4));
    // translated by (100, 0) inside save/transform/restore
    fns.push(OPS.save);
    args.push(null);
    fns.push(OPS.transform);
    args.push([1, 0, 0, 1, 100, 0]);
    push(path(0, 0, 0, 1, 10, 0));
    fns.push(OPS.restore);
    args.push(null);
    push(path(0, 50, 50, 1, 60, 50));

    const idx = await extractVectors(fakePage(fns, args));
    expect(idx.count).toBe(6);
    const segs = Array.from(idx.segs);
    expect(segs.slice(16, 20)).toEqual([100, 0, 110, 0]);
    expect(segs.slice(20, 24)).toEqual([50, 50, 60, 50]);
  });

  it("snaps to endpoints before midpoints before the line", async () => {
    const fns = [OPS.constructPath];
    const args = [[OPS.stroke, [Float32Array.from([0, 0, 0, 1, 100, 0])], null]];
    const idx = await extractVectors(fakePage(fns, args));
    expect(snapPoint(idx, { x: 2, y: 3 }, 5)).toMatchObject({ x: 0, y: 0, kind: "end" });
    expect(snapPoint(idx, { x: 51, y: 2 }, 5)).toMatchObject({ x: 50, y: 0, kind: "mid" });
    expect(snapPoint(idx, { x: 30, y: 2 }, 5)).toMatchObject({ x: 30, y: 0, kind: "on" });
    expect(snapPoint(idx, { x: 30, y: 20 }, 5)).toBeNull();
  });
});
