import { describe, expect, test } from "vitest";
import { matchCapturedItem, normalizeCaptureText } from "../src/estoque/captureMatch";

const catalog = [
  { _id: "1", name: "Disjuntor", variantLabel: "10A", sku: "MAT-000001", barcode: "7891234567890", unit: "un", category: "Elétrica" },
  { _id: "2", name: "Disjuntor", variantLabel: "20A", sku: "MAT-000002", barcode: null, unit: "un", category: "Elétrica" },
  { _id: "3", name: "Cabo PP", variantLabel: "3x2,5 mm²", sku: "MAT-000003", barcode: null, unit: "m", category: "Elétrica" },
  { _id: "4", name: "Fita isolante", variantLabel: null, sku: "MAT-000004", barcode: null, unit: "rolo", category: null },
];

describe("matchCapturedItem", () => {
  test("código de barras e SKU são correspondência certa", () => {
    expect(matchCapturedItem(catalog, { code: "7891234567890" }).exact).toEqual({ item: catalog[0], reason: "barcode" });
    expect(matchCapturedItem(catalog, { code: " mat-000003 " }).exact).toEqual({ item: catalog[2], reason: "sku" });
    expect(matchCapturedItem(catalog, { code: "000" }).exact).toBeNull();
  });

  test("mesmo nome, variação e unidade ignora acento e caixa", () => {
    const result = matchCapturedItem(catalog, { name: "FITA ISOLANTE", unit: "rolo" });
    expect(result.exact?.item._id).toBe("4");
    expect(matchCapturedItem(catalog, { name: "disjuntor", variantLabel: "10 a" }).exact).toBeNull();
  });

  test("parecidos trazem a mesma família primeiro", () => {
    const result = matchCapturedItem(catalog, { name: "Disjuntor", variantLabel: "32A" });
    expect(result.exact).toBeNull();
    expect(result.similar.map((item) => item._id)).toEqual(["1", "2"]);
    expect(matchCapturedItem(catalog, { name: "cabo pp" }).similar[0]?._id).toBe("3");
  });

  test("normaliza como o backend", () => {
    expect(normalizeCaptureText("  Cabo PP 3x2,5 mm² ")).toBe("cabo pp 3x2 5 mm2");
  });
});
