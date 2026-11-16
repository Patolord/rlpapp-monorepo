import { ruleViolation } from "../../lib/domainErrors";

/** Pessoa física (CPF) ou jurídica (CNPJ): clientes, empreiteiros, fornecedores e funcionários. */
export type PersonType = "pf" | "pj";

/** Normaliza CNPJ/CPF para comparação (somente dígitos). */
export function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, "");
}

export function optionalTaxIdDigits(value: string): string | undefined {
  const digits = normalizeTaxId(value);
  if (!digits) return undefined;
  return digits;
}

function hasValidCpfCheckDigits(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return false;
  const calculateDigit = (length: number): number => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return (
    calculateDigit(9) === Number(digits[9]) &&
    calculateDigit(10) === Number(digits[10])
  );
}

function hasValidCnpjCheckDigits(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return false;
  const calculateDigit = (length: 12 | 13): number => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + Number(digits[index]) * weight,
      0
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return (
    calculateDigit(12) === Number(digits[12]) &&
    calculateDigit(13) === Number(digits[13])
  );
}

export function validateTaxIdForPersonType(
  taxId: string | undefined,
  personType: PersonType | undefined
): void {
  if (!taxId || !personType) return;
  const digits = normalizeTaxId(taxId);
  const expectedLength = personType === "pf" ? 11 : 14;
  if (digits.length !== expectedLength) {
    throw ruleViolation(
      personType === "pf"
        ? "CPF deve conter 11 dígitos"
        : "CNPJ deve conter 14 dígitos"
    );
  }
  const valid =
    personType === "pf"
      ? hasValidCpfCheckDigits(digits)
      : hasValidCnpjCheckDigits(digits);
  if (!valid) {
    throw ruleViolation(personType === "pf" ? "CPF inválido" : "CNPJ inválido");
  }
}
