import { beforeEach, describe, expect, it } from "vitest";
import { aiStats } from "../lib/aiReview";
import { emptyProject, type Measurement, type Project, type Zone } from "../lib/types";
import { useStore } from "./index";

const mark = (id: string, x: number, extra: Partial<Measurement> = {}): Measurement => ({
  id,
  itemId: "i1",
  drawingId: "d1",
  page: 0,
  points: [{ x, y: 10 }],
  ai: "suggested",
  ...extra,
});

const region: Zone = {
  id: "z1",
  locationId: "l1",
  drawingId: "d1",
  page: 0,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  ai: "suggested",
};

function open(patch: Partial<Project> = {}) {
  useStore.getState().resetProject({
    ...emptyProject(),
    drawings: [{ id: "d1", path: null, name: "planta.pdf", pages: [{ scale: null }] }],
    activeDrawingId: "d1",
    items: [
      {
        id: "i1",
        name: "Grelha",
        kind: "count",
        color: "#fff",
        group: "Geral",
        materialPrice: 0,
        laborPrice: 0,
        wastePct: 0,
      },
    ],
    measurements: [mark("a", 10), mark("b", 50), mark("c", 90)],
    locations: [{ id: "l1", name: "Sala", color: "#fff" }],
    zones: [region],
    ...patch,
  });
}

const state = (id: string) =>
  [...useStore.getState().project.measurements, ...useStore.getState().project.zones].find(
    (x) => x.id === id,
  )?.ai;

describe("reviewing AI suggestions in the store", () => {
  beforeEach(() => open());

  it("counts a moved or reshaped suggestion as accepted with a correction", () => {
    const s = useStore.getState();
    s.moveMeasurements(["a"], 5, 0);
    s.setPoints(
      "z1",
      region.points.map((p) => ({ x: p.x + 1, y: p.y })),
    );
    expect(state("a")).toBe("edited");
    expect(state("z1")).toBe("edited");
    expect(state("b")).toBe("suggested");
    expect(aiStats(useStore.getState().project)).toEqual({
      pending: 2,
      accepted: 0,
      edited: 2,
      rejected: 0,
    });
  });

  it("counts a deleted pending suggestion as rejected, and undo takes the count back", () => {
    const s = useStore.getState();
    s.acceptAiSuggestions(["b"]);
    s.removeMeasurements(["a", "b"]);
    // "a" was pending (a rejection); "b" had been accepted (just a deletion)
    expect(useStore.getState().project.aiRejected).toBe(1);
    useStore.getState().undo();
    expect(useStore.getState().project.aiRejected).toBeUndefined();
    expect(state("a")).toBe("suggested");
  });

  it("counts the pending suggestions of a deleted item as rejected", () => {
    const s = useStore.getState();
    s.acceptAiSuggestions(["a"]);
    s.removeItem("i1");
    // "b" and "c" were still waiting; "a" had been accepted
    expect(useStore.getState().project.measurements).toEqual([]);
    expect(useStore.getState().project.aiRejected).toBe(2);
  });

  it("accepts and discards a selection or everything, each as one undo step", () => {
    const s = useStore.getState();
    s.acceptAiSuggestions(["a"]);
    expect(state("a")).toBe("accepted");
    s.setSelection(["b", "c"]);
    s.rejectAiSuggestions(["b"]);
    expect(useStore.getState().project.measurements.map((m) => m.id)).toEqual(["a", "c"]);
    expect(useStore.getState().selection).toEqual(["c"]);
    useStore.getState().acceptAiSuggestions();
    expect(aiStats(useStore.getState().project)).toEqual({
      pending: 0,
      accepted: 3,
      edited: 0,
      rejected: 1,
    });
    useStore.getState().undo();
    expect(state("c")).toBe("suggested");
    expect(state("z1")).toBe("suggested");
  });

  it("drops the emptied location, and its filter, when its only region is discarded", () => {
    useStore.getState().setZoneFilter("l1");
    useStore.getState().rejectAiSuggestions(["z1"]);
    expect(useStore.getState().project.locations).toEqual([]);
    expect(useStore.getState().zoneFilter).toBeNull();
  });

  it("makes a copy the user's own marking, not a suggestion", () => {
    const s = useStore.getState();
    s.setSelection(["a", "z1"]);
    s.duplicateSelection({ x: 20, y: 20 });
    const { project, selection } = useStore.getState();
    const copies = [...project.measurements, ...project.zones].filter((x) =>
      selection.includes(x.id),
    );
    expect(copies).toHaveLength(2);
    expect(copies.every((x) => x.ai === undefined)).toBe(true);
    expect(state("a")).toBe("suggested");
  });
});
