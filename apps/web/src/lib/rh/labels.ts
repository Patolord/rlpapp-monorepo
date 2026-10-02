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

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;
}

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
