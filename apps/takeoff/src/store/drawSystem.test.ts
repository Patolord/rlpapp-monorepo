import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalogStore } from "../lib/catalog";
import type { Kit } from "../lib/kits";
import { systemSheets } from "../lib/quantities";
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

const LINE_SET: Kit = {
  id: "kit-12k",
  name: "12.000 Inverter",
  mode: "linear",
  components: [
    { name: 'Cobre de 3/8"', group: "Tubulações", kind: "linear", factor: 1, system: "Infra AC" },
    {
      name: "Cabo PP 3 x 1,5 mm²",
      group: "Elétrica",
      kind: "linear",
      factor: 1,
      system: "Infra AC",
    },
  ],
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

describe('"Marcar em": the discipline of new markings', () => {
  beforeEach(() => {
    useStore.getState().resetProject(fixture());
    useStore.setState({
      catalog: { ...emptyCatalogStore(), kits: [LINE_SET] },
      page: 0,
      selection: [],
      status: null,
      drawSystem: null,
    });
  });

  it("leaves new markings on their item's discipline while unset", () => {
    useStore.getState().addKitRun("kit-12k", 0, run);
    const { project } = useStore.getState();
    expect(project.measurements.every((m) => m.system === undefined)).toBe(true);
    expect(systemSheets(project).map((s) => s.system)).toEqual(["Infra AC"]);
  });

  it("stamps every marking a kit draws, so one kit serves every discipline", () => {
    const s = useStore.getState();
    s.setDrawSystem("AC Pesado");
    s.addKitRun("kit-12k", 0, run);
    s.setDrawSystem("AC Leve");
    s.addKitRun("kit-12k", 0, run);
    const { project } = useStore.getState();
    // the same two items, budgeted on two tabs
    expect(project.items).toHaveLength(2);
    expect(project.measurements.map((m) => m.system)).toEqual([
      "AC Pesado",
      "AC Pesado",
      "AC Leve",
      "AC Leve",
    ]);
    expect(systemSheets(project).map((s) => s.system)).toEqual(["AC Leve", "AC Pesado"]);
  });

  it("stamps plain markings and treats a blank discipline as unset", () => {
    const s = useStore.getState();
    const id = s.addItem({ kind: "count", name: "Grelha", system: "Exaustão" });
    s.setDrawSystem("  ");
    expect(useStore.getState().drawSystem).toBeNull();
    s.setDrawSystem("AC Leve");
    const m = s.addMeasurement(id, 0, [{ x: 1, y: 1 }]);
    s.addMeasurements(id, 0, [[{ x: 2, y: 2 }]]);
    const ms = useStore.getState().project.measurements;
    expect(ms.find((x) => x.id === m)?.system).toBe("AC Leve");
    expect(ms.map((x) => x.system)).toEqual(["AC Leve", "AC Leve"]);
  });

  it("moves selected markings, with their kit group, to another discipline and back", () => {
    const s = useStore.getState();
    s.addKitRun("kit-12k", 0, run);
    s.addKitRun("kit-12k", 0, run);
    const [first, , third] = useStore.getState().project.measurements;
    // one member of the first run: its whole kit group moves, the second run stays
    s.setMarkingSystem([first.id], "AC Pesado");
    let ms = useStore.getState().project.measurements;
    expect(ms.map((m) => m.system)).toEqual(["AC Pesado", "AC Pesado", undefined, undefined]);
    s.setMarkingSystem([first.id], "");
    ms = useStore.getState().project.measurements;
    expect(ms.every((m) => !("system" in m))).toBe(true);
    s.setMarkingSystem([third.id], "AC Leve");
    s.undo();
    expect(useStore.getState().project.measurements.every((m) => !m.system)).toBe(true);
  });

  it("forgets the discipline when another project is opened", () => {
    useStore.getState().setDrawSystem("AC Pesado");
    useStore.getState().resetProject(fixture());
    expect(useStore.getState().drawSystem).toBeNull();
  });
});
