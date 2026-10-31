import { beforeEach, describe, expect, it } from "vitest";
import { emptyProject, type Project } from "../lib/types";
import { metricScale } from "../lib/units";
import { useStore } from "./index";

/** Two drawings, the second at another scale; a count, a kit group of two and a region on d1. */
function fixture(): Project {
  return {
    ...emptyProject(),
    drawings: [
      { id: "d1", path: null, name: "Térreo", pages: [{ scale: metricScale(50) }] },
      { id: "d2", path: null, name: "Tipo", pages: [{ scale: metricScale(100) }] },
    ],
    activeDrawingId: "d1",
    items: ["evap", "cobre", "cabo"].map((id) => ({
      id,
      name: id,
      kind: id === "evap" ? ("count" as const) : ("linear" as const),
      color: "#fff",
      group: "Geral",
      materialPrice: 0,
      laborPrice: 0,
      wastePct: 0,
    })),
    measurements: [
      { id: "m1", itemId: "evap", drawingId: "d1", page: 0, points: [{ x: 10, y: 10 }] },
      {
        id: "k1",
        itemId: "cobre",
        drawingId: "d1",
        page: 0,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        linkId: "L",
      },
      {
        id: "k2",
        itemId: "cabo",
        drawingId: "d1",
        page: 0,
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        linkId: "L",
      },
    ],
    locations: [{ id: "loc", name: "Sala", color: "#38bdf8" }],
    zones: [
      {
        id: "z1",
        locationId: "loc",
        drawingId: "d1",
        page: 0,
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
        ],
      },
    ],
  };
}

const ALL = ["m1", "k1", "k2", "z1"];

describe("copy and paste in the store", () => {
  beforeEach(() => {
    useStore.getState().resetProject(fixture());
    useStore.setState({ page: 0, selection: [], clipboard: null, tool: "select", status: null });
  });

  it("pastes in place on another drawing as one undo step, selecting the copies", () => {
    const s = useStore.getState();
    s.setSelection(ALL);
    expect(s.copySelection()).toBe(4);
    useStore.setState({ project: { ...useStore.getState().project, activeDrawingId: "d2" } });
    expect(useStore.getState().pasteClipboard(null)).toBe(4);

    const { project, selection, status } = useStore.getState();
    expect(status).toContain("4 marcações coladas");
    const pasted = project.measurements.filter((m) => m.drawingId === "d2");
    expect(pasted).toHaveLength(3);
    expect(project.zones.filter((z) => z.drawingId === "d2")).toHaveLength(1);
    expect(selection).toHaveLength(4);
    expect(selection.some((id) => ALL.includes(id))).toBe(false);
    expect(pasted.find((m) => m.itemId === "evap")?.points).toEqual([{ x: 10, y: 10 }]);
    expect(status).toContain("escala diferente");

    useStore.getState().undo();
    const after = useStore.getState().project;
    expect(after.measurements.map((m) => m.id)).toEqual(["m1", "k1", "k2"]);
    expect(after.zones.map((z) => z.id)).toEqual(["z1"]);
  });

  it("centres a paste on the cursor and keeps kit groups apart from the originals", () => {
    const s = useStore.getState();
    s.setSelection(["k1"]); // the group comes along
    s.copySelection();
    // the group's box is (0,0)-(20,0): its centre (10,0) goes under the cursor
    s.pasteClipboard({ x: 110, y: 50 });
    const { project, status } = useStore.getState();
    const copies = project.measurements.filter((m) => !["m1", "k1", "k2"].includes(m.id));
    expect(copies).toHaveLength(2);
    expect(copies[0].points).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
    ]);
    expect(copies[0].linkId).toBe(copies[1].linkId);
    expect(copies[0].linkId).not.toBe("L");
    expect(status).not.toContain("escala");
  });

  it("skips markings whose item was deleted and brings back a deleted location", () => {
    const s = useStore.getState();
    s.setSelection(["m1", "z1"]);
    s.copySelection();
    s.removeItem("evap");
    s.removeMeasurements(["z1"]);
    expect(useStore.getState().project.locations).toHaveLength(0);
    expect(useStore.getState().pasteClipboard(null)).toBe(1);
    const { project, status } = useStore.getState();
    expect(project.zones).toHaveLength(1);
    expect(project.locations.map((l) => l.id)).toEqual(["loc"]);
    expect(status).toContain("1 ignorada");
  });

  it("duplicates with an offset without touching the clipboard", () => {
    const s = useStore.getState();
    s.setSelection(["m1"]);
    expect(s.duplicateSelection({ x: 5, y: 5 })).toBe(1);
    const { project, clipboard, selection, status } = useStore.getState();
    const copy = project.measurements.find((m) => m.id === selection[0]);
    expect(copy?.points).toEqual([{ x: 15, y: 15 }]);
    expect(clipboard).toBeNull();
    expect(status).toBe("1 marcação duplicada");

    useStore.getState().setSelection(["m1", "z1"]);
    useStore.getState().duplicateSelection({ x: 5, y: 5 });
    expect(useStore.getState().status).toBe("2 marcações duplicadas");
  });
});
