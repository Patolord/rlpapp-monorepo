import { parseCurrencyToCents } from "@rlpapp/shared";

/** Formata centavos para input compacto (1.234,56). */
export function formatCentsInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Aceita tanto o formato BR (1.234,56) quanto o da planilha (1234.56).
 */
export function parsePayrollAmountToCents(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return 0;
  if (trimmed.includes(",")) {
    return parseCurrencyToCents(trimmed);
  }
  const cleaned = trimmed.replace(/[^\d.-]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
    const num = Number.parseFloat(cleaned);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error("Valor inválido");
    }
    return Math.round(num * 100);
  }
  return parseCurrencyToCents(trimmed.replace(".", ","));
}

export function parseDays(value: string): number {
  const num = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}
