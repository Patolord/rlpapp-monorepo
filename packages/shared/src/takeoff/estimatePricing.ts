import { type EstimateLine, foldEstimateName } from "./estimate";
import { normalizeKitSku } from "./kits";
import { type BasePrices, basePrice, type WeightRow } from "./weights";

/**
 * Prices of estimate lines outside the desktop app (the backend's estimate tools): each line
 * takes the unit prices typed in the estimate, else the company material with its code or name,
 * else a row of the weight table priced by the kilo, as the app prices a new line. No project
 * here, so no line already in a takeoff to add to.
 */

/** A company material as the pricing needs it (the desktop catalog's fields). */
export interface PricingMaterial {
  id: string;
  sku: string | null;
  name: string;
  materialPrice: number;
  laborPrice: number;
}

export interface PricingCatalog {
  materials: readonly PricingMaterial[];
  /** The weight table in use (the company's, else the factory one). */
  weights: readonly WeightRow[];
  basePrices: BasePrices | null | undefined;
}

/** Where a line's material price came from. */
export type PriceSource = "digitado" | "catalogo" | "peso" | "sem_preco";

export interface PricedLine {
  name: string;
  sku: string | null;
  group: string;
  system: string | null;
  /** "m", "pç" or "m²". */
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  materialTotal: number;
  laborTotal: number;
  total: number;
  priceSource: PriceSource;
  /** Company material the line was priced from; null when none matched. */
  materialId: string | null;
}

export interface EstimateTotals {
  material: number;
  labor: number;
  /** Material + labour, before BDI. */
  subtotal: number;
  bdiPercent: number;
  bdi: number;
  /** Subtotal with BDI. */
  total: number;
}

const cents = (v: number): number => Math.round(v * 100) / 100;

const UNIT: Record<EstimateLine["kind"], string> = { count: "pç", linear: "m", area: "m²" };

/** Price every line and total them, with the BDI (percent over material + labour). */
export function priceEstimate(
  lines: readonly EstimateLine[],
  catalog: PricingCatalog,
  bdiPercent = 0,
): { lines: PricedLine[]; totals: EstimateTotals } {
  const bySku = new Map<string, PricingMaterial>();
  const byName = new Map<string, PricingMaterial>();
  for (const m of catalog.materials) {
    const sku = normalizeKitSku(m.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, m);
    const name = foldEstimateName(m.name.trim());
    if (!byName.has(name)) byName.set(name, m);
  }
  const weights = new Map(catalog.weights.map((w) => [foldEstimateName(w.name.trim()), w]));

  const priced = lines.map((line): PricedLine => {
    const sku = normalizeKitSku(line.sku);
    const key = foldEstimateName(line.name.trim());
    const material = (sku ? bySku.get(sku) : undefined) ?? byName.get(key);
    const weight = material ? undefined : weights.get(key);
    const perKg = weight ? basePrice(catalog.basePrices ?? undefined, weight.material) : undefined;

    let materialUnitPrice = 0;
    let laborUnitPrice = material?.laborPrice ?? 0;
    let priceSource: PriceSource = "sem_preco";
    if (material && material.materialPrice > 0) {
      materialUnitPrice = material.materialPrice;
      priceSource = "catalogo";
    } else if (weight && perKg !== undefined) {
      materialUnitPrice = cents(weight.kgPerUnit * perKg);
      priceSource = "peso";
    }
    if (line.price?.material !== undefined) {
      materialUnitPrice = line.price.material;
      priceSource = "digitado";
    }
    if (line.price?.labor !== undefined) {
      laborUnitPrice = line.price.labor;
      // a labour line typed in the estimate ({ material: 0, labor }) is priced, not missing
      if (priceSource === "sem_preco" && line.price.labor > 0) priceSource = "digitado";
    }
    if (priceSource === "sem_preco" && laborUnitPrice > 0) priceSource = "catalogo";

    const materialTotal = cents(line.qty * materialUnitPrice);
    const laborTotal = cents(line.qty * laborUnitPrice);
    return {
      name: material && sku ? material.name : line.name,
      sku: sku ?? normalizeKitSku(material?.sku) ?? null,
      group: line.group,
      system: line.system ?? null,
      unit: UNIT[line.kind],
      quantity: line.qty,
      materialUnitPrice,
      laborUnitPrice,
      materialTotal,
      laborTotal,
      total: cents(materialTotal + laborTotal),
      priceSource,
      materialId: material?.id ?? null,
    };
  });

  const material = cents(priced.reduce((s, l) => s + l.materialTotal, 0));
  const labor = cents(priced.reduce((s, l) => s + l.laborTotal, 0));
  const subtotal = cents(material + labor);
  const pct = Number.isFinite(bdiPercent) && bdiPercent > 0 ? bdiPercent : 0;
  const bdi = cents((subtotal * pct) / 100);
  return {
    lines: priced,
    totals: { material, labor, subtotal, bdiPercent: pct, bdi, total: cents(subtotal + bdi) },
  };
}
