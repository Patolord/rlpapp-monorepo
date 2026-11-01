/** Centavos → texto editável em reais com vírgula (4550 → "45,50"). */
export function centsToLaborPriceInput(
  cents: number | null | undefined
): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

const INVALID_LABOR_PRICE =
  "Preço de mão de obra inválido. Use o formato 45,50.";

// pt-BR: "45", "45,5", "1234,56", "1.234,56" (pontos só como milhar).
const PT_BR_AMOUNT = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;
// Ponto como decimal: "45.5", "45.50" (no máximo duas casas).
const DOT_DECIMAL_AMOUNT = /^\d+\.\d{1,2}$/;

/**
 * Texto do formulário → centavos; vazio vira `null` (sem preço).
 * Aceita um "R$" opcional seguido de "45", "45,50", "1234,56", "1.234,56" ou
 * "45.50"; qualquer outra coisa ("45,50,99", "45-50", "abc") é rejeitada.
 */
export function parseLaborPriceInput(input: string): number | null {
  const amount = input
    .trim()
    .replace(/^R\$\s*/i, "")
    .trim();
  if (!amount) {
    if (input.trim()) throw new Error(INVALID_LABOR_PRICE);
    return null;
  }
  let normalized: string;
  if (DOT_DECIMAL_AMOUNT.test(amount)) {
    normalized = amount;
  } else if (PT_BR_AMOUNT.test(amount)) {
    normalized = amount.replace(/\./g, "").replace(",", ".");
  } else {
    throw new Error(INVALID_LABOR_PRICE);
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(INVALID_LABOR_PRICE);
  return Math.round(value * 100);
}
