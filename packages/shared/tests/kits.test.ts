import { describe, expect, test } from "vitest";
import {
  cloneKit,
  type Kit,
  kitSlugId,
  normalizeKit,
  SEED_KITS,
  sameKit,
} from "../src/takeoff/kits";

describe("factory kit presets", () => {
  test("have stable, unique ids derived from their names", () => {
    expect(new Set(SEED_KITS.map((k) => k.id)).size).toBe(SEED_KITS.length);
    expect(SEED_KITS.find((k) => k.name === "9.000 Inverter")?.id).toBe("kit-9-000-inverter");
    expect(kitSlugId("Linha frigorígena 9.000")).toBe("kit-linha-frigorigena-9-000");
    expect(kitSlugId("  ")).toBe("kit-");
  });

  test("cover every capacity, inverter and conventional, plus the count kits", () => {
    const linear = SEED_KITS.filter((k) => k.mode !== "count");
    expect(linear).toHaveLength(16);
    expect(SEED_KITS.filter((k) => k.mode === "count").length).toBeGreaterThanOrEqual(3);
    expect(linear.map((k) => k.name)).toContain("60.000 Convencional");
  });
});

describe("sameKit", () => {
  const kit: Kit = {
    id: "k",
    name: "Kit",
    components: [{ name: "Cobre", group: "Tubulações", kind: "linear", factor: 1 }],
  };

  test("ignores whitespace, an explicit default mode and empty optional texts", () => {
    const other: Kit = {
      id: "k",
      name: " Kit ",
      mode: "linear",
      label: "",
      components: [{ name: "Cobre ", group: "Tubulações", system: " ", kind: "linear", factor: 1 }],
    };
    expect(sameKit(kit, other)).toBe(true);
    expect(normalizeKit(other)).toEqual({ ...kit, mode: "linear" });
  });

  test("sees a changed factor, label, mode or component", () => {
    expect(sameKit(kit, { ...kit, label: "x" })).toBe(false);
    expect(sameKit(kit, { ...kit, mode: "count" })).toBe(false);
    expect(sameKit(kit, { ...kit, components: [{ ...kit.components[0], factor: 2 }] })).toBe(false);
    expect(sameKit(kit, { ...kit, components: [] })).toBe(false);
  });

  test("cloneKit copies the components", () => {
    const copy = cloneKit(kit);
    copy.components[0].factor = 3;
    expect(kit.components[0].factor).toBe(1);
  });
});
