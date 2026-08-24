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

export const DEFAULT_MEAL_VOUCHER_PER_DAY_CENTS = 2500;
export const DEFAULT_FOOD_BASKET_CENTS = 35_000;
export const DEFAULT_DAILY_TRANSIT_CENTS = 2140;
export const DEFAULT_TRANSPORT_FOOD_DAYS = 22;
export const DEFAULT_PAYMENT_DAY = 5;

export type MonthKey = { year: number; month: number };

export function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Mês inválido");
  }
}

export function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Ano inválido");
  }
}

export function monthIndex(year: number, month: number): number {
  assertYear(year);
  assertMonth(month);
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): MonthKey {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month };
}

export function previousMonth(year: number, month: number): MonthKey {
  return fromMonthIndex(monthIndex(year, month) - 1);
}

export function addMonths(year: number, month: number, delta: number): MonthKey {
  return fromMonthIndex(monthIndex(year, month) + delta);
}

export function formatMonthLabel(year: number, month: number): string {
  assertMonth(month);
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

export type LoanInput = {
  totalCents: number;
  installmentCount: number;
  installmentCents: number;
  startYear: number;
  startMonth: number;
};

export type LoanStatus = {
  installmentCount: number;
  installmentCents: number;
  totalCents: number;
  paidCount: number;
  dueCents: number;
  outstandingCents: number;
  endYear: number;
  endMonth: number;
  settled: boolean;
  progressPercent: number;
};

export function loanStatus(
  loan: LoanInput,
  year: number,
  month: number
): LoanStatus {
  const current = monthIndex(year, month);
  const start = monthIndex(loan.startYear, loan.startMonth);
  const installmentCount = Math.max(1, Math.round(loan.installmentCount));
  const installmentCents = Math.max(0, Math.round(loan.installmentCents));
  const totalCents = Math.max(0, Math.round(loan.totalCents));
  const end = start + installmentCount - 1;
  const paidCount = Math.min(Math.max(current - start + 1, 0), installmentCount);
  const dueCents =
    current >= start && current <= end ? installmentCents : 0;
  const outstandingCents = Math.max(totalCents - paidCount * installmentCents, 0);
  const endKey = fromMonthIndex(end);
  return {
    installmentCount,
    installmentCents,
    totalCents,
    paidCount,
    dueCents,
    outstandingCents,
    endYear: endKey.year,
    endMonth: endKey.month,
    settled: paidCount >= installmentCount,
    progressPercent: installmentCount
      ? Math.round((paidCount / installmentCount) * 100)
      : 0,
  };
}

export type PayrollLineAmounts = {
  earningsCents: number;
  deductionsCents: number;
  foodBasketEnabled: boolean;
  transportFoodDays: number;
  dailyTransitCents: number;
  supplementCents: number;
  thirteenthFirstCents: number;
  thirteenthSecondCents: number;
  manualLoanDeductionCents: number;
};

export type PayrollRunParams = {
  mealVoucherPerDayCents: number;
  foodBasketCents: number;
};

export type ComputedPayrollLine = {
  mealVoucherCents: number;
  transitVoucherCents: number;
  foodBasketCents: number;
  scheduledLoanDeductionCents: number;
  totalLoanDeductionCents: number;
  totalPaymentCents: number;
};

export function computePayrollLine(
  line: PayrollLineAmounts,
  params: PayrollRunParams,
  scheduledLoanDeductionCents: number
): ComputedPayrollLine {
  const days = Math.max(0, line.transportFoodDays);
  const mealVoucherCents = Math.round(days * params.mealVoucherPerDayCents);
  const transitVoucherCents = Math.round(days * line.dailyTransitCents);
  const foodBasketCents = line.foodBasketEnabled ? params.foodBasketCents : 0;
  const scheduled = Math.max(0, Math.round(scheduledLoanDeductionCents));
  const manual = Math.max(0, Math.round(line.manualLoanDeductionCents));
  const totalLoanDeductionCents = scheduled + manual;
  const totalPaymentCents =
    Math.round(line.earningsCents) -
    Math.round(line.deductionsCents) +
    foodBasketCents +
    mealVoucherCents +
    transitVoucherCents +
    Math.round(line.supplementCents) +
    Math.round(line.thirteenthFirstCents) +
    Math.round(line.thirteenthSecondCents) -
    totalLoanDeductionCents;

  return {
    mealVoucherCents,
    transitVoucherCents,
    foodBasketCents,
    scheduledLoanDeductionCents: scheduled,
    totalLoanDeductionCents,
    totalPaymentCents,
  };
}

export function emptyPayrollTotals() {
  return {
    baseSalaryCents: 0,
    earningsCents: 0,
    deductionsCents: 0,
    foodBasketCents: 0,
    mealVoucherCents: 0,
    transitVoucherCents: 0,
    supplementCents: 0,
    thirteenthFirstCents: 0,
    thirteenthSecondCents: 0,
    totalLoanDeductionCents: 0,
    totalPaymentCents: 0,
  };
}

export type PayrollTotals = ReturnType<typeof emptyPayrollTotals>;

export function addPayrollTotals(
  totals: PayrollTotals,
  row: {
    baseSalaryCents: number;
    earningsCents: number;
    deductionsCents: number;
    foodBasketCents: number;
    mealVoucherCents: number;
    transitVoucherCents: number;
    supplementCents: number;
    thirteenthFirstCents: number;
    thirteenthSecondCents: number;
    totalLoanDeductionCents: number;
    totalPaymentCents: number;
  }
): PayrollTotals {
  return {
    baseSalaryCents: totals.baseSalaryCents + row.baseSalaryCents,
    earningsCents: totals.earningsCents + row.earningsCents,
    deductionsCents: totals.deductionsCents + row.deductionsCents,
    foodBasketCents: totals.foodBasketCents + row.foodBasketCents,
    mealVoucherCents: totals.mealVoucherCents + row.mealVoucherCents,
    transitVoucherCents: totals.transitVoucherCents + row.transitVoucherCents,
    supplementCents: totals.supplementCents + row.supplementCents,
    thirteenthFirstCents: totals.thirteenthFirstCents + row.thirteenthFirstCents,
    thirteenthSecondCents:
      totals.thirteenthSecondCents + row.thirteenthSecondCents,
    totalLoanDeductionCents:
      totals.totalLoanDeductionCents + row.totalLoanDeductionCents,
    totalPaymentCents: totals.totalPaymentCents + row.totalPaymentCents,
  };
}

export function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Valor inválido");
  }
  return Math.round(value);
}

export function assertNonNegativeCents(value: number, label: string): number {
  const cents = roundCents(value);
  if (cents < 0) {
    throw new Error(`${label} não pode ser negativo`);
  }
  return cents;
}
