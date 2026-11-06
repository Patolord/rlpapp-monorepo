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

/** CPF/CNPJ formatado para exibição (só dígitos na entrada ou já formatado). */
export function formatTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value;
}

/** Tamanho de arquivo legível (B, KB, MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

/** Variação de preço: "+5,2%" ou, sem base percentual, "+R$ 0,50". */
export function formatPriceChange(change: {
  deltaCents: number;
  deltaPercent: number | null;
}): string {
  const sign = change.deltaCents > 0 ? "+" : change.deltaCents < 0 ? "−" : "";
  if (change.deltaPercent === null) {
    return `${sign}${formatCurrency(Math.abs(change.deltaCents))}`;
  }
  const percent = Math.abs(change.deltaPercent).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
  return `${sign}${percent}%`;
}
