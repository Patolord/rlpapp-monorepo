import { describe, expect, test } from "vitest";

import { expandShelfLabels, filterShelfLabels, type ShelfLabelRow } from "./shelf-labels";

function row(overrides: Partial<ShelfLabelRow>): ShelfLabelRow {
  return {
    balanceId: overrides.balanceId ?? Math.random().toString(),
    materialId: overrides.materialId ?? Math.random().toString(),
    sku: "MAT-000001",
    name: "Item",
    variantLabel: null,
    unit: "un",
    physicalAddress: null,
    quantity: 1,
    ...overrides,
  };
}

describe("filterShelfLabels", () => {
  test("ordena endereço de forma natural e deixa sem endereço no fim", () => {
    const rows = [
      row({ name: "C", physicalAddress: "B3-12" }),
      row({ name: "A", physicalAddress: null }),
      row({ name: "B", physicalAddress: "b3-2" }),
      row({ name: "D", physicalAddress: "A1" }),
    ];
    expect(filterShelfLabels(rows, {}).map((r) => r.name)).toEqual(["D", "B", "C", "A"]);
  });

  test("filtra por prefixo de endereço, busca sem acento e saldo", () => {
    const rows = [
      row({ name: "Disjuntor", variantLabel: "10A", physicalAddress: "B3-1" }),
      row({ name: "Cabo elétrico", physicalAddress: "B3-2", quantity: 0 }),
      row({ name: "Fita", physicalAddress: "C1" }),
    ];
    expect(filterShelfLabels(rows, { addressPrefix: "b3" }).map((r) => r.name)).toEqual(["Disjuntor", "Cabo elétrico"]);
    expect(filterShelfLabels(rows, { search: "eletrico" }).map((r) => r.name)).toEqual(["Cabo elétrico"]);
    expect(filterShelfLabels(rows, { addressPrefix: "B3", onlyInStock: true }).map((r) => r.name)).toEqual(["Disjuntor"]);
  });
});

describe("expandShelfLabels", () => {
  test("repete por cópia e pula itens sem SKU", () => {
    const rows = [row({ name: "A" }), row({ name: "B", sku: null })];
    expect(expandShelfLabels(rows, 2).map((r) => r.name)).toEqual(["A", "A"]);
    expect(expandShelfLabels(rows, 0)).toHaveLength(1);
  });
});
