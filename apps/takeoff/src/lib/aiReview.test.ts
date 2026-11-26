import { describe, expect, it } from "vitest";
import {
  acceptAi,
  acceptanceRate,
  aiStats,
  pendingAiIds,
  pendingAmong,
  rejectAi,
  touchedAi,
} from "./aiReview";
import { emptyProject, type Measurement, type Project, type Zone } from "./types";

const m = (id: string, extra: Partial<Measurement> = {}): Measurement => ({
  id,
  itemId: "i1",
  drawingId: "d1",
  page: 0,
  points: [{ x: 1, y: 1 }],
  ...extra,
});

const z = (id: string, extra: Partial<Zone> = {}): Zone => ({
  id,
  locationId: "l1",
  drawingId: "d1",
  page: 0,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ],
  ...extra,
});

const project = (patch: Partial<Project>): Project => ({
  ...emptyProject(),
  locations: [{ id: "l1", name: "Sala", color: "#fff" }],
  ...patch,
});

describe("aiStats", () => {
  it("counts each review state and the discarded suggestions", () => {
    const p = project({
      measurements: [
        m("a", { ai: "suggested" }),
        m("b", { ai: "accepted" }),
        m("c", { ai: "edited" }),
        m("d"),
      ],
      zones: [z("z1", { ai: "suggested" })],
      aiRejected: 3,
    });
    expect(aiStats(p)).toEqual({ pending: 2, accepted: 1, edited: 1, rejected: 3 });
    expect(acceptanceRate(aiStats(p))).toBeCloseTo(1 / 5);
  });

  it("has no acceptance rate before anything is reviewed", () => {
    expect(acceptanceRate(aiStats(project({ measurements: [m("a", { ai: "suggested" })] })))).toBe(
      null,
    );
  });
});

describe("touchedAi", () => {
  it("turns a pending suggestion into an edited one and leaves the rest", () => {
    expect(touchedAi("suggested")).toBe("edited");
    expect(touchedAi("accepted")).toBe("accepted");
    expect(touchedAi(undefined)).toBeUndefined();
  });
});

describe("pendingAiIds", () => {
  it("lists pending suggestions, optionally of one page", () => {
    const p = project({
      measurements: [m("a", { ai: "suggested" }), m("b", { ai: "suggested", page: 1 }), m("c")],
      zones: [z("z1", { ai: "suggested" }), z("z2", { ai: "accepted" })],
    });
    expect(pendingAiIds(p).sort()).toEqual(["a", "b", "z1"]);
    expect(pendingAiIds(p, { drawingId: "d1", page: 1 })).toEqual(["b"]);
  });
});

describe("acceptAi", () => {
  it("accepts every pending suggestion when no ids are given", () => {
    const p = project({
      measurements: [m("a", { ai: "suggested" }), m("b")],
      zones: [z("z1", { ai: "suggested" })],
    });
    const next = acceptAi(p);
    expect(next.measurements.map((x) => x.ai)).toEqual(["accepted", undefined]);
    expect(next.zones[0].ai).toBe("accepted");
  });

  it("accepts a whole kit group from one of its members", () => {
    const p = project({
      measurements: [
        m("a", { ai: "suggested", linkId: "k" }),
        m("b", { ai: "suggested", linkId: "k" }),
        m("c", { ai: "suggested" }),
      ],
    });
    expect(acceptAi(p, ["a"]).measurements.map((x) => x.ai)).toEqual([
      "accepted",
      "accepted",
      "suggested",
    ]);
  });

  it("returns the same project when nothing is pending", () => {
    const p = project({ measurements: [m("a", { ai: "accepted" })] });
    expect(acceptAi(p)).toBe(p);
    expect(acceptAi(p, ["a"])).toBe(p);
  });
});

describe("rejectAi", () => {
  it("removes pending suggestions, counts them and drops emptied locations", () => {
    const p = project({
      measurements: [m("a", { ai: "suggested" }), m("b"), m("c", { ai: "edited" })],
      zones: [z("z1", { ai: "suggested" })],
    });
    const next = rejectAi(p);
    expect(next.measurements.map((x) => x.id)).toEqual(["b", "c"]);
    expect(next.zones).toEqual([]);
    expect(next.locations).toEqual([]);
    expect(next.aiRejected).toBe(2);
  });

  it("never removes a marking a person drew or already reviewed", () => {
    const p = project({ measurements: [m("a"), m("b", { ai: "accepted" })] });
    expect(rejectAi(p, ["a", "b"])).toBe(p);
  });
});

describe("pendingAmong", () => {
  it("counts the pending suggestions among the ids", () => {
    const p = project({
      measurements: [m("a", { ai: "suggested" }), m("b")],
      zones: [z("z1", { ai: "suggested" })],
    });
    expect(pendingAmong(p, ["a", "b", "z1", "x"])).toBe(2);
  });
});
