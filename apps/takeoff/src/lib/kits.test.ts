import { describe, expect, it } from "vitest";
import { SEED } from "./catalog";
import {
  type Kit,
  kitSummary,
  migrateKitLabels,
  refreshKitLabels,
  runLabel,
  SEED_KITS,
} from "./kits";
import { foldName } from "./text";
import type { Measurement } from "./types";

describe("kit presets", () => {
  it("every seed component is a catalog material, so prices come along", () => {
    const names = new Set(SEED.map((e) => foldName(e.name)));
    for (const kit of SEED_KITS) {
      for (const c of kit.components) {
        expect(names.has(foldName(c.name)), `${kit.name}: ${c.name}`).toBe(true);
      }
    }
  });

  it("covers every capacity of the reference table, inverter and conventional", () => {
    const names = SEED_KITS.filter((k) => k.mode !== "count").map((k) => k.name);
    expect(names).toHaveLength(16);
    expect(new Set(SEED_KITS.map((k) => k.id)).size).toBe(SEED_KITS.length);
    expect(names).toContain("9.000 Inverter");
    expect(names).toContain("9.000 Convencional");
    expect(names).toContain("60.000 Convencional");
    const k18c = SEED_KITS.find((k) => k.name === "18.000 Convencional");
    expect(k18c?.components.map((c) => c.name)).toEqual([
      'Cobre de 1/4"',
      'Cobre de 5/8"',
      'Isolamento de 1/4" - Espessura 09 mm',
      'Isolamento de 5/8" - Espessura 09 mm',
      "Cabo PP 5 x 1,5 mm²",
    ]);
  });

  it("ships count presets placed with one click", () => {
    const counts = SEED_KITS.filter((k) => k.mode === "count");
    expect(counts.length).toBeGreaterThanOrEqual(3);
    for (const k of counts) for (const c of k.components) expect(c.kind).toBe("count");
  });

  it("summarises factors", () => {
    expect(kitSummary(SEED_KITS[0])).toContain("×2");
  });

  it("summarises the length per click of linear components in a count kit", () => {
    const kit: Kit = {
      id: "k",
      name: "Detector + cabo",
      mode: "count",
      components: [
        { name: "Detector", group: "Detecção", kind: "count", factor: 1 },
        { name: "Cabo", group: "Elétrica", kind: "linear", factor: 3 },
      ],
    };
    expect(kitSummary(kit)).toBe("Detector · Cabo 3 m");
    expect(kitSummary(kit, "ft")).toBe("Detector · Cabo 3 ft");
  });
});

describe("kit labels", () => {
  const seed = (name: string) => SEED_KITS.find((k) => k.name === name);

  it("seeds the line-set kits with their liquid and gas diameters, count kits with none", () => {
    expect(seed("9.000 Inverter")?.label).toBe('1/4" · 3/8"');
    expect(seed("12.000 Inverter")?.label).toBe('1/4" · 3/8"');
    expect(seed("12.000 Convencional")?.label).toBe('1/4" · 1/2"');
    expect(seed("24.000 Inverter")?.label).toBe('3/8" · 5/8"');
    expect(seed("60.000 Convencional")?.label).toBe('3/8" · 7/8"');
    for (const k of SEED_KITS) {
      if (k.mode === "count") expect(k.label, k.name).toBeUndefined();
      // the label names the same diameters as the copper components
      else expect(k.components[0].name, k.name).toBe(`Cobre de ${k.label?.split(" · ")[0]}`);
    }
  });

  it("gives saved seed kits from before labels their seed's label, a cleared one stays empty", () => {
    const [a, b, c] = SEED_KITS;
    const own: Kit = { id: "mine", name: "Meu kit", components: [] };
    const { label: _a, ...oldA } = a;
    const saved: Kit[] = [
      { ...oldA, name: "Renomeado" }, // no label field: saved before labels existed
      { ...b, label: "" }, // cleared by the user
      { ...c, label: "LS-1" }, // the user's own text
      own,
    ];
    const out = migrateKitLabels(saved);
    expect(out[0]).toEqual({ ...a, name: "Renomeado" });
    expect(out[1].label).toBe("");
    expect(out[2].label).toBe("LS-1");
    expect(out[3]).toBe(own);
    expect("label" in out[3]).toBe(false);
    // nothing to do: the same array
    expect(migrateKitLabels(out)).toBe(out);
  });

  const kits: Kit[] = [
    { id: "k", name: "Ventilador", mode: "count", label: "VE-01 · 1.200 m³/h", components: [] },
    { id: "blank", name: "Sem rótulo", label: "", components: [] },
  ];

  it("resolves the label: the run's own, else the live kit's, else the saved one", () => {
    const run = { kitId: "k", kitLabel: "VE-01 · antigo" };
    expect(runLabel({ ...run, label: "VE-02" }, kits)).toBe("VE-02");
    expect(runLabel(run, kits)).toBe("VE-01 · 1.200 m³/h");
    expect(runLabel(run, new Map(kits.map((k) => [k.id, k])))).toBe("VE-01 · 1.200 m³/h");
    // the kit was deleted, or this catalog never had it
    expect(runLabel(run, [])).toBe("VE-01 · antigo");
    expect(runLabel({ kitId: "gone" }, kits)).toBeUndefined();
    // a kit whose label was cleared shows none, even with an older saved label
    expect(runLabel({ kitId: "blank", kitLabel: "velho" }, kits)).toBeUndefined();
    // a blank override does not hide the kit's label; any marking can have its own
    expect(runLabel({ ...run, label: "  " }, kits)).toBe("VE-01 · 1.200 m³/h");
    expect(runLabel({ label: "Prumada A" })).toBe("Prumada A");
    expect(runLabel({})).toBeUndefined();
  });

  it("refreshes the saved label of the runs of a relabelled kit only", () => {
    const m = (id: string, extra: Partial<Measurement>): Measurement => ({
      id,
      itemId: "i",
      drawingId: "d",
      page: 0,
      points: [],
      ...extra,
    });
    const ms = [
      m("a", { kitId: "k", kitLabel: "VE-01 · 1.200 m³/h", linkId: "L" }),
      m("b", { kitId: "k", kitLabel: "VE-01 · 1.200 m³/h", linkId: "L", label: "VE-09" }),
      m("c", { kitId: "blank" }),
      m("d", {}),
    ];
    expect(refreshKitLabels(ms, kits, kits)).toBe(ms);
    const after = kits.map((k) => (k.id === "k" ? { ...k, label: "VE-01 · 900 m³/h" } : k));
    const out = refreshKitLabels(ms, kits, after);
    expect(out.map((x) => x.kitLabel)).toEqual([
      "VE-01 · 900 m³/h",
      "VE-01 · 900 m³/h",
      undefined,
      undefined,
    ]);
    expect(out[1].label).toBe("VE-09");
    expect(out[2]).toBe(ms[2]);
    expect(out[3]).toBe(ms[3]);
    // cleared: the saved label goes too
    const cleared = refreshKitLabels(out, after, [{ ...after[0], label: "" }, after[1]]);
    expect("kitLabel" in cleared[0]).toBe(false);
    // a deleted kit keeps the last saved text
    expect(refreshKitLabels(out, after, [after[1]])).toBe(out);
  });
});
