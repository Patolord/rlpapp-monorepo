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
