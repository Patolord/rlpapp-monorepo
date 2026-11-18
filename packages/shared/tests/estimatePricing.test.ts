import { describe, expect, it } from "vitest";
import type { EstimateLine } from "../src/takeoff/estimate";
import { priceEstimate } from "../src/takeoff/estimatePricing";
import {
  formatCapacity,
  lineSetForCapacity,
  SPLIT_TEMPLATE,
  templateValues,
} from "../src/takeoff/estimateTemplates";
import { SEED_KITS } from "../src/takeoff/kits";
import { SEED_WEIGHTS } from "../src/takeoff/weights";

const line = (l: Partial<EstimateLine> & Pick<EstimateLine, "name">): EstimateLine => ({
  group: "Tubulações",
  kind: "linear",
  qty: 10,
  ...l,
});

describe("priceEstimate", () => {
  const catalog = {
    materials: [
      {
        id: "m1",
        sku: "MAT-000001",
        name: 'Tubulação de Cobre 1/4"',
        unit: "m",
        materialPrice: 30,
        laborPrice: 5,
      },
      {
        id: "m2",
        sku: null,
        name: 'Isolamento Polipex 1/4"',
        unit: "metro",
        materialPrice: 4,
        laborPrice: 0,
      },
    ],
    weights: [{ ...SEED_WEIGHTS[0], name: 'Tubulação de Cobre 3/8"', kgPerUnit: 0.193 }],
    basePrices: { cobre: 100 },
  };

  it("prices by code, then name, then the weight table, and keeps typed prices", () => {
    const { lines, totals } = priceEstimate(
      [
        line({ name: "Cobre renomeado", sku: "mat-000001" }),
        line({ name: 'isolamento polipex 1/4"' }),
        line({ name: 'Tubulação de Cobre 3/8"' }),
        line({ name: "Split Hi Wall 18.000 Btu/h", kind: "count", qty: 2, price: { material: 3000 } }),
        line({ name: "Mão de obra", kind: "count", qty: 2, price: { material: 0, labor: 450 } }),
        line({ name: "Algo sem preço", kind: "count", qty: 1 }),
      ],
      catalog,
      30,
    );
    expect(lines.map((l) => [l.name, l.materialUnitPrice, l.laborUnitPrice, l.priceSource])).toEqual([
      // a coded line takes the catalog's current name
      ['Tubulação de Cobre 1/4"', 30, 5, "catalogo"],
      ['isolamento polipex 1/4"', 4, 0, "catalogo"],
      ['Tubulação de Cobre 3/8"', 19.3, 0, "peso"],
      ["Split Hi Wall 18.000 Btu/h", 3000, 0, "digitado"],
      ["Mão de obra", 0, 450, "digitado"],
      ["Algo sem preço", 0, 0, "sem_preco"],
    ]);
    expect(lines[0]).toMatchObject({ unit: "m", materialId: "m1", sku: "MAT-000001", total: 350 });
    expect(lines[3].unit).toBe("pç");
    const material = 300 + 40 + 193 + 6000;
    const labor = 50 + 900;
    expect(totals).toEqual({
      material,
      labor,
      subtotal: material + labor,
      bdiPercent: 30,
      bdi: Math.round((material + labor) * 30) / 100,
      total: Math.round((material + labor) * 130) / 100,
    });
  });

  it("prices kit copper by weight through the table's own spelling", () => {
    const { lines } = priceEstimate([line({ name: 'Tubulação de Cobre 1/2"' })], {
      materials: [],
      weights: SEED_WEIGHTS,
      basePrices: { cobre: 100 },
    });
    // `Tubo de cobre 1/2"`: 0,263 kg/m × R$ 100/kg
    expect(lines[0]).toMatchObject({ materialUnitPrice: 26.3, priceSource: "peso" });
  });

  it("ignores a catalog price quoted in another unit and keeps a labour-only line unpriced", () => {
    const { lines } = priceEstimate(
      [line({ name: 'Tubulação de Cobre 1/2"' }), line({ name: "Tubo PEAD" })],
      {
        materials: [
          { id: "k", sku: null, name: 'Tubulação de Cobre 1/2"', unit: "kg", materialPrice: 100, laborPrice: 0 },
          { id: "p", sku: null, name: "Tubo PEAD", unit: "m", materialPrice: 0, laborPrice: 8 },
        ],
        weights: SEED_WEIGHTS,
        basePrices: { cobre: 100 },
      },
    );
    // R$/kg is not R$/m: the weight table prices the copper instead
    expect(lines[0]).toMatchObject({ materialUnitPrice: 26.3, priceSource: "peso", materialId: null });
    // labour from the catalog, but the material is still missing
    expect(lines[1]).toMatchObject({ laborUnitPrice: 8, materialUnitPrice: 0, priceSource: "sem_preco" });
  });

  it("totals without BDI when none is given", () => {
    const { totals } = priceEstimate([line({ name: 'Tubulação de Cobre 1/4"' })], catalog);
    expect(totals).toMatchObject({ subtotal: 350, bdiPercent: 0, bdi: 0, total: 350 });
  });
});

describe("lineSetForCapacity", () => {
  it("finds the line set of a capacity, inverter unless asked otherwise", () => {
    expect(formatCapacity(18000)).toBe("18.000");
    expect(lineSetForCapacity(SEED_KITS, 18000)?.id).toBe("kit-18-000-inverter");
    expect(lineSetForCapacity(SEED_KITS, 18000, "Convencional")?.id).toBe(
      "kit-18-000-convencional",
    );
    expect(lineSetForCapacity(SEED_KITS, 9000)?.name).toBe("9.000 Inverter");
    expect(lineSetForCapacity(SEED_KITS, 15000)).toBeUndefined();
  });

  it("feeds the split calculator from an equipment list", () => {
    const kit18 = lineSetForCapacity(SEED_KITS, 18000);
    const lines = SPLIT_TEMPLATE.lines(
      {
        ...templateValues(SPLIT_TEMPLATE, undefined, SEED_KITS),
        machines: [{ type: "Cassete", lineSet: kit18?.id ?? "", qty: 2, meters: 12, price: 0 }],
      },
      SEED_KITS,
    );
    expect(lines.find((l) => l.name === 'Tubulação de Cobre 1/2"')?.qty).toBe(24);
    expect(lines.find((l) => l.name.startsWith("Split"))?.name).toBe("Split Cassete 18.000 Btu/h");
  });
});
