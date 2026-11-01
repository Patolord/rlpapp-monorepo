import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalogStore } from "../lib/catalog";
import type { Kit } from "../lib/kits";
import { emptyProject, type Project } from "../lib/types";
import { metricScale } from "../lib/units";
import { useStore } from "./index";

/** The catalog is written to localStorage outside Tauri: keep it in memory here. */
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const LINE: Kit = {
  id: "kit-ls",
  name: "12.000 Inverter",
  mode: "linear",
  label: '1/4" · 3/8"',
  components: [
    { name: 'Cobre de 1/4"', group: "Tubulações", kind: "linear", factor: 1 },
    { name: 'Cobre de 3/8"', group: "Tubulações", kind: "linear", factor: 1 },
    { name: "Cabo PP 5 x 1,5 mm²", group: "Elétrica", kind: "linear", factor: 2 },
  ],
};
const FAN: Kit = {
  id: "kit-fan",
  name: "Ventilador",
  mode: "count",
  components: [{ name: "Ventilador", group: "Equipamentos", kind: "count", factor: 1 }],
};

function fixture(): Project {
  return {
    ...emptyProject(),
    drawings: [{ id: "d1", path: null, name: "Térreo", pages: [{ scale: metricScale(50) }] }],
    activeDrawingId: "d1",
  };
}

const run = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("kit labels in the store", () => {
  beforeEach(() => {
    useStore.getState().resetProject(fixture());
    useStore.setState({
      catalog: { ...emptyCatalogStore(), kits: [LINE, FAN] },
      page: 0,
      selection: [],
      status: null,
    });
  });

  it("a kit run remembers its kit and the kit's label on every member", () => {
    expect(useStore.getState().addKitRun("kit-ls", 0, run)).toBe(3);
    const ms = useStore.getState().project.measurements;
    expect(ms).toHaveLength(3);
    for (const m of ms) {
      expect(m.kitId).toBe("kit-ls");
      expect(m.kitLabel).toBe('1/4" · 3/8"');
      expect(m.label).toBeUndefined();
    }
    // a kit without a label: the kit is remembered, no label saved
    useStore.getState().addKitRun("kit-fan", 0, [{ x: 5, y: 5 }]);
    const fan = useStore.getState().project.measurements[3];
    expect(fan.kitId).toBe("kit-fan");
    expect("kitLabel" in fan).toBe(false);
  });

  it("a run's own label goes on the whole group in one undo step; blank clears it", () => {
    const s = useStore.getState();
    s.addKitRun("kit-ls", 0, run);
    s.addMeasurement(s.resolveItem("count"), 0, [{ x: 50, y: 50 }]);
    const [first, , , other] = useStore.getState().project.measurements;
    const undoBefore = useStore.getState().past.length;

    useStore.getState().setMarkingLabel([first.id], "  Linha A ");
    const after = useStore.getState();
    expect(after.past.length).toBe(undoBefore + 1);
    expect(after.project.measurements.slice(0, 3).map((m) => m.label)).toEqual([
      "Linha A",
      "Linha A",
      "Linha A",
    ]);
    expect(after.project.measurements[3].label).toBeUndefined();

    // the same text again: no step
    useStore.getState().setMarkingLabel([first.id], "Linha A");
    expect(useStore.getState().past.length).toBe(undoBefore + 1);

    // any marking, kit or not
    useStore.getState().setMarkingLabel([other.id], "VE-01");
    expect(useStore.getState().project.measurements[3].label).toBe("VE-01");

    useStore.getState().setMarkingLabel([first.id], "");
    expect(
      useStore
        .getState()
        .project.measurements.slice(0, 3)
        .some((m) => "label" in m),
    ).toBe(false);

    useStore.getState().undo();
    useStore.getState().undo();
    expect(useStore.getState().project.measurements.map((m) => m.label)).toEqual([
      "Linha A",
      "Linha A",
      "Linha A",
      undefined,
    ]);
    useStore.getState().undo();
    expect(useStore.getState().project.measurements.every((m) => m.label === undefined)).toBe(true);
  });

  it("an item added to a group takes the group's kit and label", () => {
    const s = useStore.getState();
    s.addKitRun("kit-ls", 0, run);
    const first = useStore.getState().project.measurements[0];
    useStore.getState().setMarkingLabel([first.id], "Linha A");
    const extra = useStore.getState().addItem({ kind: "linear", name: "Fita PVC" });
    useStore.getState().addToGroup(first.linkId ?? "", extra);
    const added = useStore.getState().project.measurements.at(-1);
    expect(added).toMatchObject({
      itemId: extra,
      kitId: "kit-ls",
      kitLabel: '1/4" · 3/8"',
      label: "Linha A",
    });
  });

  it("editing a kit's label refreshes the saved copy on its runs, without an undo step", async () => {
    const s = useStore.getState();
    s.addKitRun("kit-ls", 0, run);
    s.addKitRun("kit-fan", 0, [{ x: 5, y: 5 }]);
    useStore.setState({ dirty: false });
    const { past, project: before } = useStore.getState();
    const undoBefore = past.length;

    await useStore.getState().saveKits([{ ...LINE, label: '1/4" · 1/2"' }, FAN]);
    const after = useStore.getState();
    expect(after.catalog.kits[0].label).toBe('1/4" · 1/2"');
    expect(after.past.length).toBe(undoBefore);
    expect(after.dirty).toBe(true);
    expect(after.project.measurements.slice(0, 3).map((m) => m.kitLabel)).toEqual([
      '1/4" · 1/2"',
      '1/4" · 1/2"',
      '1/4" · 1/2"',
    ]);
    // the fan kit was not relabelled: its run is untouched
    expect(after.project.measurements[3]).toBe(before.measurements[3]);
    // the undo history follows, so undoing the fan brings no old label back
    useStore.getState().undo();
    expect(useStore.getState().project.measurements.map((m) => m.kitLabel)).toEqual([
      '1/4" · 1/2"',
      '1/4" · 1/2"',
      '1/4" · 1/2"',
    ]);

    // saving without a label change leaves the project alone
    useStore.setState({ dirty: false });
    const project = useStore.getState().project;
    await useStore.getState().saveKits([...useStore.getState().catalog.kits]);
    expect(useStore.getState().project).toBe(project);
    expect(useStore.getState().dirty).toBe(false);
  });
});
