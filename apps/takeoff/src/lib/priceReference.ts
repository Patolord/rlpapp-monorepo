/**
 * Budget reference of a company material: the median of every supplier's quotes in the last six
 * months, as `takeoffCatalog.current` publishes it (rules in
 * packages/shared/src/compras/priceReference.ts). Prices in reais.
 */
export interface PriceReference {
  /** Median of the window: the price to budget with. */
  price: number;
  minPrice: number;
  maxPrice: number;
  /** (max − min) / median. */
  spread: number;
  count: number;
  supplierCount: number;
  /** Change per month between the first and last quoted weeks; undefined if too close. */
  monthlyChange?: number;
  lastAt: number;
  /** ok; wide = spread above 10%; stale = no quote in 90 days. */
  status: "ok" | "wide" | "stale";
  /** More quotes in the window than the catalog reads: the most recent ones are used. */
  truncated?: boolean;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The `reference` object of a catalog item, or undefined when missing or malformed. */
export function parsePriceReference(json: unknown): PriceReference | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  if (!isNum(o.price) || o.price <= 0 || !isNum(o.lastAt)) return undefined;
  const status = o.status === "wide" || o.status === "stale" ? o.status : "ok";
  return {
    price: o.price,
    minPrice: isNum(o.minPrice) ? o.minPrice : o.price,
    maxPrice: isNum(o.maxPrice) ? o.maxPrice : o.price,
    spread: isNum(o.spread) ? o.spread : 0,
    count: isNum(o.count) ? o.count : 1,
    supplierCount: isNum(o.supplierCount) ? o.supplierCount : 1,
    monthlyChange: isNum(o.monthlyChange) ? o.monthlyChange : undefined,
    lastAt: o.lastAt,
    status,
    truncated: o.truncated === true ? true : undefined,
  };
}

/** "+2,7%" / "−1,8%" with one decimal. */
export function signedPercent(fraction: number): string {
  const value = Math.abs(fraction * 100)
    .toFixed(1)
    .replace(".", ",");
  if (fraction > 0.0005) return `+${value}%`;
  if (fraction < -0.0005) return `−${value}%`;
  return `${value}%`;
}

/** One line on whether the reference can be budgeted without a new quote (pt-BR). */
export function describeReferenceStatus(ref: PriceReference): string {
  switch (ref.status) {
    case "ok":
      return "Cotações dentro de 10%: dá para orçar sem cotar de novo";
    case "wide":
      return `Cotações variam ${signedPercent(ref.spread).replace("+", "")}: confirme com nova cotação`;
    case "stale":
      return "Sem cotação há mais de 90 dias: cote antes de fechar";
  }
}

/**
 * How far the line's price is from the reference, when it is: null within 0,5% (same price) or
 * without a price.
 */
export function offReference(price: number, ref: PriceReference): number | null {
  if (!(price > 0)) return null;
  const off = (price - ref.price) / ref.price;
  return Math.abs(off) < 0.005 ? null : off;
}
