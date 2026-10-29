import { describe, expect, it } from "vitest";
import { SEED } from "./catalog";
import { type Kit, kitSummary, SEED_KITS } from "./kits";
import { foldName } from "./text";

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
