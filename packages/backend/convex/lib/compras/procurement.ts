/** Normaliza texto para busca/alias, ignorando acentos e pontuação. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type PriceFreshness = "fresh" | "usable" | "old" | "stale";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Idade do preço em dias, com base em `now` passado pelo cliente. */
export function priceAgeDays(occurredAt: number, now: number): number {
  return Math.max(0, Math.floor((now - occurredAt) / MS_PER_DAY));
}

export function priceFreshness(occurredAt: number, now: number): PriceFreshness {
  const age = priceAgeDays(occurredAt, now);
  if (age <= 7) return "fresh";
  if (age <= 30) return "usable";
  if (age <= 90) return "old";
  return "stale";
}

/** Markup sugerido sobre o último preço conhecido (percentual). */
export function suggestedMarkupPercent(freshness: PriceFreshness): number {
  switch (freshness) {
    case "fresh":
      return 5;
    case "usable":
      return 10;
    case "old":
      return 18;
    case "stale":
      return 0;
  }
}

export function suggestedUnitPriceCents(
  unitPriceCents: number,
  freshness: PriceFreshness
): number | null {
  if (freshness === "stale") return null;
  const markup = suggestedMarkupPercent(freshness);
  return Math.round(unitPriceCents * (1 + markup / 100));
}

/** Regras para marcar evento como precisando revisão. */
export function computeNeedsReview(params: {
  materialId?: string;
  supplierId?: string;
  supplierNameRaw?: string;
  unit?: string;
  rawDescription?: string;
}): boolean {
  if (!params.materialId) return true;
  if (!params.supplierId && !params.supplierNameRaw?.trim()) return true;
  if (!params.unit?.trim()) return true;
  if (!params.rawDescription?.trim() && !params.materialId) return true;
  return false;
}

export function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function parseBrlToCents(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Preço inválido");
  }
  return Math.round(num * 100);
}
