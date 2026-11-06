import { v } from "convex/values";
import { employeePaymentMethod } from "../../schema/hr";
import {
  alimonyLineValidator,
  alimonyTotalsValidator,
  alimonyValidator,
} from "./alimonies";

export const payrollRunValidator = v.object({
  _id: v.id("payrollRuns"),
  year: v.number(),
  paymentMonth: v.number(),
  referenceYear: v.number(),
  referenceMonth: v.number(),
  paymentDay: v.number(),
  status: v.union(v.literal("draft"), v.literal("closed")),
  mealVoucherPerDayCents: v.number(),
  foodBasketCents: v.number(),
  defaultDailyTransitCents: v.number(),
  defaultTransportFoodDays: v.number(),
  label: v.string(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  closedAt: v.union(v.number(), v.null()),
});

export const payrollLineValidator = v.object({
  _id: v.id("payrollLines"),
  runId: v.id("payrollRuns"),
  employeeId: v.id("employees"),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  baseSalaryCents: v.number(),
  paymentMethod: employeePaymentMethod,
  earningsCents: v.number(),
  deductionsCents: v.number(),
  foodBasketEnabled: v.boolean(),
  transportFoodDays: v.number(),
  dailyTransitCents: v.number(),
  supplementCents: v.number(),
  thirteenthFirstCents: v.number(),
  thirteenthSecondCents: v.number(),
  manualLoanDeductionCents: v.number(),
  awayNotes: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  paid: v.boolean(),
  paidAt: v.union(v.number(), v.null()),
  mealVoucherCents: v.number(),
  transitVoucherCents: v.number(),
  foodBasketCents: v.number(),
  scheduledLoanDeductionCents: v.number(),
  totalLoanDeductionCents: v.number(),
  totalPaymentCents: v.number(),
  activeLoanCount: v.number(),
});

export const payrollTotalsValidator = v.object({
  baseSalaryCents: v.number(),
  earningsCents: v.number(),
  deductionsCents: v.number(),
  foodBasketCents: v.number(),
  mealVoucherCents: v.number(),
  transitVoucherCents: v.number(),
  supplementCents: v.number(),
  thirteenthFirstCents: v.number(),
  thirteenthSecondCents: v.number(),
  totalLoanDeductionCents: v.number(),
  totalPaymentCents: v.number(),
});

export const payrollWorkspaceValidator = v.object({
  run: v.union(payrollRunValidator, v.null()),
  lines: v.array(payrollLineValidator),
  totals: payrollTotalsValidator,
  kpis: v.object({
    totalPaymentCents: v.number(),
    pixTotalCents: v.number(),
    pixCount: v.number(),
    outstandingLoanCents: v.number(),
    activeLoanCount: v.number(),
    monthLoanDeductionCents: v.number(),
    paidCount: v.number(),
    paidTotalCents: v.number(),
    lineCount: v.number(),
  }),
  availableEmployees: v.array(
    v.object({
      _id: v.id("employees"),
      name: v.string(),
      code: v.union(v.string(), v.null()),
      jobTitle: v.union(v.string(), v.null()),
    })
  ),
  // Pensões alimentícias do mês: linhas próprias, pagas ao beneficiário,
  // com totais separados dos totais dos funcionários.
  alimonyLines: v.array(alimonyLineValidator),
  alimonyTotals: alimonyTotalsValidator,
  // Pensões ativas de funcionários desta folha que ainda não têm linha.
  availableAlimonies: v.array(alimonyValidator),
});

export const employeeLoanValidator = v.object({
  _id: v.id("employeeLoans"),
  employeeId: v.id("employees"),
  totalCents: v.number(),
  installmentCount: v.number(),
  installmentCents: v.number(),
  startYear: v.number(),
  startMonth: v.number(),
  description: v.union(v.string(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  paidCount: v.number(),
  dueCents: v.number(),
  outstandingCents: v.number(),
  endYear: v.number(),
  endMonth: v.number(),
  settled: v.boolean(),
  progressPercent: v.number(),
});
