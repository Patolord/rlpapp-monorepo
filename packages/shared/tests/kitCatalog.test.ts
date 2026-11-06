import { describe, expect, test } from "vitest";
import {
  cableSize,
  catalogProductName,
  inchSize,
  kitFamily,
  sortKitComponents,
} from "../src/takeoff/kitCatalog";
import { type KitComponent, normalizeKit, SEED_KITS } from "../src/takeoff/kits";

const comp = (name: string, sku?: string): KitComponent => ({
  name,
  ...(sku ? { sku } : {}),
  group: "Tubulações",
  kind: "linear",
  factor: 1,
});

describe("families and sizes", () => {
  test("tell copper tube, insulation and cable apart", () => {
    expect(kitFamily('Tubulação de Cobre 1/4"')).toBe("cobre");
    expect(kitFamily('Cobre de 3/4"')).toBe("cobre");
    expect(kitFamily('Isolamento Polipex 1/4"')).toBe("isolamento");
    expect(kitFamily('Isolamento de 1/4" - Espessura 09 mm')).toBe("isolamento");
    expect(kitFamily("Cabo PP 5x1,5 mm²")).toBe("cabo");
    // a copper cable is a cable, a copper elbow is not a tube
    expect(kitFamily("Cabo de cobre flexível 2,5 mm²")).toBe("cabo");
    expect(kitFamily('Joelho de Cobre de 3/8"')).toBe("outro");
    expect(kitFamily("Split Hi Wall 12.000 Btu/h")).toBe("outro");
  });

  test("read tube sizes in inches and cable sections", () => {
    expect(inchSize('Tubulação de Cobre 1/4"')).toBe(0.25);
    expect(inchSize('Tubo de cobre 1.1/8"')).toBe(1.125);
    expect(inchSize('Tubo de cobre 1"')).toBe(1);
    expect(inchSize("Isolamento Polipex — 3/4 pol")).toBe(0.75);
    expect(inchSize("Cabo PP 5x1,5")).toBeUndefined();
    expect(cableSize("Cabo PP 5 x 1,5 mm²")).toEqual({ conductors: 5, section: 1.5 });
    expect(cableSize("Cabo PP 3x2,5mm²")).toEqual({ conductors: 3, section: 2.5 });
  });
});

describe("sortKitComponents", () => {
  test("puts copper, insulation and cable first, each by ascending size", () => {
    const shuffled = [
      comp("Cabo PP 5x1,5 mm²"),
      comp('Isolamento Polipex 1/2"'),
      comp("Dreno"),
      comp('Tubulação de Cobre 1/2"'),
      comp('Isolamento Polipex 1/4"'),
      comp("Cabo PP 3x2,5 mm²"),
      comp('Tubulação de Cobre 1/4"'),
      comp('Tubulação de Cobre 3/8"'),
      comp("Suporte"),
    ];
    expect(sortKitComponents(shuffled).map((c) => c.name)).toEqual([
      'Tubulação de Cobre 1/4"',
      'Tubulação de Cobre 3/8"',
      'Tubulação de Cobre 1/2"',
      'Isolamento Polipex 1/4"',
      'Isolamento Polipex 1/2"',
      "Cabo PP 5x1,5 mm²",
      "Cabo PP 3x2,5 mm²",
      "Dreno",
      "Suporte",
    ]);
  });

  test("keeps a kit without those families as it is", () => {
    const list = [comp("Split"), comp("Suporte"), comp("Caixa")];
    expect(sortKitComponents(list)).toBe(list);
  });

  test("leaves every factory kit in order", () => {
    for (const k of SEED_KITS) expect(sortKitComponents(k.components), k.name).toBe(k.components);
  });
});

describe("catalogProductName", () => {
  test("joins family and variant as the app shows them", () => {
    expect(catalogProductName({ name: "Tubulação de Cobre", variant: '1/4"' })).toBe(
      'Tubulação de Cobre — 1/4"',
    );
    expect(catalogProductName({ name: "Split Hi Wall 12.000 Btu/h", variant: null })).toBe(
      "Split Hi Wall 12.000 Btu/h",
    );
  });
});

describe("kit component codes", () => {
  test("are part of the compared form, upper case", () => {
    const kit = { id: "k", name: "K", components: [comp("Cobre", " mat-000001 ")] };
    expect(normalizeKit(kit).components[0].sku).toBe("MAT-000001");
  });
});
