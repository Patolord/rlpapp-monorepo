/** Rótulos curtos de mês e da folha (web, native e backend). */
export const MONTH_LABELS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;

/** "MAR/26" */
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;
}

/** "05 ABR · ref MAR" (ou "· ref DEZ/25" quando o ano de referência difere). */
export function formatPayrollRunLabel(params: {
  paymentDay: number;
  paymentMonth: number;
  year: number;
  referenceMonth: number;
  referenceYear: number;
}): string {
  const pay = MONTH_LABELS[params.paymentMonth - 1];
  const ref = MONTH_LABELS[params.referenceMonth - 1];
  const day = String(params.paymentDay).padStart(2, "0");
  if (params.referenceYear !== params.year) {
    return `${day} ${pay} · ref ${ref}/${String(params.referenceYear).slice(-2)}`;
  }
  return `${day} ${pay} · ref ${ref}`;
}
