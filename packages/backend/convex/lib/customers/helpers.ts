import { normalizeText } from "../compras/procurement";

/** Normaliza CNPJ/CPF para comparação (somente dígitos). */
export function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeCustomerName(value: string): string {
  return normalizeText(value);
}

export function formatTaxId(value: string): string | undefined {
  const digits = normalizeTaxId(value);
  if (!digits) return undefined;
  return digits;
}

export type CustomerPersonType = "pf" | "pj";

export function validateTaxIdForPersonType(
  taxId: string | undefined,
  personType: CustomerPersonType | undefined
): void {
  if (!taxId || !personType) return;
  const digits = normalizeTaxId(taxId);
  const expectedLength = personType === "pf" ? 11 : 14;
  if (digits.length !== expectedLength) {
    throw new Error(
      personType === "pf"
        ? "CPF deve conter 11 dígitos"
        : "CNPJ deve conter 14 dígitos"
    );
  }
}
