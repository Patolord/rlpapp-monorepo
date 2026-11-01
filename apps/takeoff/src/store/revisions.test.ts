import { beforeEach, describe, expect, it } from "vitest";
import { emptyProject, type Project } from "../lib/types";
import { useStore } from "./index";

/** One drawing on rev0.pdf, a second drawing with no history. */
function fixture(): Project {
  return {
    ...emptyProject(),
    drawings: [
      { id: "d1", path: "/p/rev0.pdf", name: "rev0.pdf", pages: [{ scale: null }] },
      { id: "d2", path: "/p/outra.pdf", name: "outra.pdf", pages: [{ scale: null }] },
    ],
    activeDrawingId: "d1",
  };
}

describe("compare overlay toggle", () => {
  beforeEach(() => {
    useStore.getState().resetProject(fixture());
    useStore.setState({ page: 0, compareRevision: false });
  });

  it("stays off after undoing a replacement, and does not come back on by itself", () => {
    const s = useStore.getState();
    s.replaceDrawing("d1", "/p/rev1.pdf", [0], [null], 1);
    s.setCompareRevision(true);
    expect(useStore.getState().compareRevision).toBe(true);

    useStore.getState().undo();
    expect(useStore.getState().compareRevision).toBe(false);

    useStore.getState().redo();
    expect(useStore.getState().compareRevision).toBe(false);
  });

  it("turns off when the drawing in view has no previous revision", () => {
    const s = useStore.getState();
    s.replaceDrawing("d1", "/p/rev1.pdf", [0], [null], 1);
    s.setCompareRevision(true);
    useStore.getState().setActiveDrawing("d2");
    expect(useStore.getState().compareRevision).toBe(false);
  });

  it("cannot be turned on without a previous revision", () => {
    useStore.getState().setCompareRevision(true);
    expect(useStore.getState().compareRevision).toBe(false);
  });
});
