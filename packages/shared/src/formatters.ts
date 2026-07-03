/** Formata valor em centavos como moeda BRL (R$ 1.234,56). */
export function formatCurrency(valueInCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueInCents / 100);
}

/** Converte string BRL (ex: "12,80" ou "R$ 12,80") para centavos. */
export function parseCurrencyToCents(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Preço inválido");
  }
  return Math.round(num * 100);
}

/** Data curta pt-BR (dd/mm/aaaa). */
export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(timestamp);
}

/** Data e hora pt-BR (dd/mm/aaaa hh:mm:ss). */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR");
}

/** Número com separador de milhar pt-BR. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
