import { parseCurrencyToCents } from "@rlpapp/shared";

/** Centavos → texto editável em reais com vírgula (4550 → "45,50"). */
export function centsToLaborPriceInput(
  cents: number | null | undefined
): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Texto do formulário → centavos; vazio vira `null` (sem preço).
 * Aceita "45,50", "R$ 1.234,56" e também "45.50" (ponto como decimal quando
 * não há vírgula e há no máximo duas casas depois do ponto).
 */
export function parseLaborPriceInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = /^\d+\.\d{1,2}$/.test(trimmed)
    ? trimmed.replace(".", ",")
    : trimmed;
  try {
    return parseCurrencyToCents(normalized);
  } catch {
    throw new Error("Preço de mão de obra inválido. Use o formato 45,50.");
  }
}
