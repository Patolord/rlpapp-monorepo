import { describe, expect, test } from "vitest";
import {
  cableSize,
  catalogProductName,
  inchSize,
  type KitCatalogMaterial,
  kitFamily,
  linkKitComponent,
  matchKitComponent,
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

const mat = (
  sku: string | null,
  name: string,
  variant: string | null,
  status: KitCatalogMaterial["status"] = "active",
  spec?: string,
): KitCatalogMaterial => ({
  sku,
  name,
  variant,
  description: [name, variant, spec].filter(Boolean).join(" — "),
  status,
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

describe("matchKitComponent", () => {
  const catalog = [
    mat("MAT-000010", "Tubulação de Cobre", '1/4"'),
    mat("MAT-000011", "Tubulação de Cobre", '3/8"'),
    mat("MAT-000012", "Tubulação de Cobre", '1/2"', "draft"),
    mat("MAT-000013", "Tubulação de Cobre", '1/2"'),
    mat("MAT-000020", "Isolamento Polipex", '1/4"', "active", "espessura 9 mm"),
    mat("MAT-000021", "Isolamento Polipex", '1/4"', "active", "espessura 13 mm"),
    mat("MAT-000022", "Isolamento Polipex", '3/8"'),
    mat("MAT-000030", "Cabo PP", "5x1,5 mm²"),
    mat("MAT-000031", "Cabo PP", "3x2,5 mm²"),
    mat("MAT-000040", "Split Hi Wall 12.000 Btu/h", null),
    mat(null, "Tubulação de Cobre", '5/8"'),
    mat("MAT-000050", "Tubulação de Cobre", '3/4"', "archived"),
  ];

  test("finds the material by its code first", () => {
    const m = matchKitComponent(comp("Qualquer nome", "mat-000011"), catalog);
    expect(m).toMatchObject({ kind: "match", by: "sku", material: { sku: "MAT-000011" } });
  });

  test("then by the exact name, then by family and size", () => {
    expect(matchKitComponent(comp("Split Hi Wall 12.000 Btu/h"), catalog)).toMatchObject({
      kind: "match",
      by: "name",
      material: { sku: "MAT-000040" },
    });
    expect(matchKitComponent(comp('Cobre de 1/4"'), catalog)).toMatchObject({
      kind: "match",
      by: "size",
      material: { sku: "MAT-000010" },
    });
    expect(matchKitComponent(comp("Cabo PP 5 x 1,5 mm²"), catalog)).toMatchObject({
      material: { sku: "MAT-000030" },
    });
    expect(matchKitComponent(comp('Isolamento de 3/8" - Espessura 09 mm'), catalog)).toMatchObject(
      { material: { sku: "MAT-000022" } },
    );
  });

  test("prefers an active material and the insulation of the same thickness", () => {
    expect(matchKitComponent(comp('Cobre de 1/2"'), catalog)).toMatchObject({
      material: { sku: "MAT-000013" },
    });
    expect(matchKitComponent(comp('Isolamento de 1/4" - Espessura 09 mm'), catalog)).toMatchObject(
      { material: { sku: "MAT-000020" } },
    );
    // no thickness to tell them apart: someone has to pick
    const twoInsulations = matchKitComponent(comp('Isolamento Polipex 1/4"'), catalog);
    expect(twoInsulations.kind).toBe("ambiguous");
  });

  test("never links to an archived material or one without a code", () => {
    expect(matchKitComponent(comp('Cobre de 5/8"'), catalog).kind).toBe("none");
    expect(matchKitComponent(comp('Cobre de 3/4"'), catalog).kind).toBe("none");
    expect(matchKitComponent(comp("Mão de obra detectores"), catalog).kind).toBe("none");
  });

  test("linking takes the code and the name the app shows", () => {
    const linked = linkKitComponent({ ...comp('Cobre de 1/4"'), factor: 2 }, catalog[0]);
    expect(linked).toEqual({ ...comp('Tubulação de Cobre — 1/4"', "MAT-000010"), factor: 2 });
    expect(catalogProductName(catalog[9])).toBe("Split Hi Wall 12.000 Btu/h");
  });
});

describe("kit component codes", () => {
  test("are part of the compared form, upper case", () => {
    const kit = { id: "k", name: "K", components: [comp("Cobre", " mat-000001 ")] };
    expect(normalizeKit(kit).components[0].sku).toBe("MAT-000001");
  });
});
