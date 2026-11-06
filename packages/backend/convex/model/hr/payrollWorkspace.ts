import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  alimonyTotals,
  listActiveAlimoniesForEmployee,
  listAlimonyLinesForRun,
  toAlimonyLineRow,
  toAlimonyRow,
} from "./alimonies";
import {
  addPayrollTotals,
  assertMonth,
  assertYear,
  emptyPayrollTotals,
  formatPayrollRunLabel,
  loanStatus,
} from "./payroll";
import { findRun } from "./payrollRuns";

/**
 * Leitura da folha: lista de competências e o workspace do mês (linhas dos
 * funcionários, totais, indicadores, funcionários e pensões disponíveis).
 */

export type GetPayrollWorkspaceInput = {
  year: number;
  paymentMonth: number;
};

function toRunRow(run: Doc<"payrollRuns">) {
  return {
    _id: run._id,
    year: run.year,
    paymentMonth: run.paymentMonth,
    referenceYear: run.referenceYear,
    referenceMonth: run.referenceMonth,
    paymentDay: run.paymentDay,
    status: run.status,
    mealVoucherPerDayCents: run.mealVoucherPerDayCents,
    foodBasketCents: run.foodBasketCents,
    defaultDailyTransitCents: run.defaultDailyTransitCents,
    defaultTransportFoodDays: run.defaultTransportFoodDays,
    label: formatPayrollRunLabel(run),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt ?? null,
    closedAt: run.closedAt ?? null,
  };
}

function toLineRow(line: Doc<"payrollLines">, activeLoanCount: number) {
  return {
    _id: line._id,
    runId: line.runId,
    employeeId: line.employeeId,
    code: line.code ?? null,
    name: line.name,
    jobTitle: line.jobTitle ?? null,
    baseSalaryCents: line.baseSalaryCents,
    paymentMethod: line.paymentMethod,
    earningsCents: line.earningsCents,
    deductionsCents: line.deductionsCents,
    foodBasketEnabled: line.foodBasketEnabled,
    transportFoodDays: line.transportFoodDays,
    dailyTransitCents: line.dailyTransitCents,
    supplementCents: line.supplementCents,
    thirteenthFirstCents: line.thirteenthFirstCents,
    thirteenthSecondCents: line.thirteenthSecondCents,
    manualLoanDeductionCents: line.manualLoanDeductionCents,
    awayNotes: line.awayNotes ?? null,
    notes: line.notes ?? null,
    paid: line.paid,
    paidAt: line.paidAt ?? null,
    mealVoucherCents: line.mealVoucherCents,
    transitVoucherCents: line.transitVoucherCents,
    foodBasketCents: line.foodBasketCents,
    scheduledLoanDeductionCents: line.scheduledLoanDeductionCents,
    totalLoanDeductionCents: line.totalLoanDeductionCents,
    totalPaymentCents: line.totalPaymentCents,
    activeLoanCount,
  };
}

export async function listPayrollRuns(ctx: QueryCtx, year?: number) {
  const runs = await ctx.db.query("payrollRuns").collect();
  const filtered =
    year === undefined ? runs : runs.filter((run) => run.year === year);
  return filtered
    .sort((a, b) =>
      a.year === b.year ? a.paymentMonth - b.paymentMonth : a.year - b.year
    )
    .map(toRunRow);
}

export async function getPayrollWorkspace(
  ctx: QueryCtx,
  args: GetPayrollWorkspaceInput
) {
  assertYear(args.year);
  assertMonth(args.paymentMonth);
  const run = await findRun(ctx, args.year, args.paymentMonth);
  const employees = await ctx.db.query("employees").collect();
  const activeEmployees = employees.filter(
    (employee) => !employee.archivedAt && employee.status !== "terminated"
  );

  if (!run) {
    return {
      run: null,
      lines: [],
      totals: emptyPayrollTotals(),
      kpis: {
        totalPaymentCents: 0,
        pixTotalCents: 0,
        pixCount: 0,
        outstandingLoanCents: 0,
        activeLoanCount: 0,
        monthLoanDeductionCents: 0,
        paidCount: 0,
        paidTotalCents: 0,
        lineCount: 0,
      },
      availableEmployees: activeEmployees
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((employee) => ({
          _id: employee._id,
          name: employee.name,
          code: employee.code ?? null,
          jobTitle: employee.jobTitle ?? null,
        })),
      alimonyLines: [],
      alimonyTotals: alimonyTotals([]),
      availableAlimonies: [],
    };
  }

  const lines = await ctx.db
    .query("payrollLines")
    .withIndex("by_run", (q) => q.eq("runId", run._id))
    .collect();
  const loans = await ctx.db.query("employeeLoans").collect();
  const activeLoans = loans.filter((loan) => !loan.archivedAt);
  const loanCountByEmployee = new Map<string, number>();
  let outstandingLoanCents = 0;
  let activeLoanCount = 0;
  for (const loan of activeLoans) {
    const status = loanStatus(loan, run.year, run.paymentMonth);
    if (!status.settled) {
      activeLoanCount += 1;
      outstandingLoanCents += status.outstandingCents;
      loanCountByEmployee.set(
        loan.employeeId,
        (loanCountByEmployee.get(loan.employeeId) ?? 0) + 1
      );
    }
  }

  const sorted = lines.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const lineRows = sorted.map((line) =>
    toLineRow(line, loanCountByEmployee.get(line.employeeId) ?? 0)
  );
  const totals = sorted.reduce(
    (acc, line) => addPayrollTotals(acc, line),
    emptyPayrollTotals()
  );
  const pixLines = sorted.filter((line) => line.paymentMethod === "pix");
  const paidLines = sorted.filter((line) => line.paid);
  const usedIds = new Set(sorted.map((line) => line.employeeId));

  const alimonyLines = (await listAlimonyLinesForRun(ctx, run._id)).sort(
    (a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, "pt-BR")
  );
  const alimonyLineIds = new Set(alimonyLines.map((line) => line.alimonyId));
  const availableAlimonies: Doc<"employeeAlimonies">[] = [];
  for (const employeeId of usedIds) {
    for (const alimony of await listActiveAlimoniesForEmployee(ctx, employeeId)) {
      if (!alimonyLineIds.has(alimony._id)) availableAlimonies.push(alimony);
    }
  }

  return {
    run: toRunRow(run),
    lines: lineRows,
    totals,
    kpis: {
      totalPaymentCents: totals.totalPaymentCents,
      pixTotalCents: pixLines.reduce(
        (sum, line) => sum + line.totalPaymentCents,
        0
      ),
      pixCount: pixLines.length,
      outstandingLoanCents,
      activeLoanCount,
      monthLoanDeductionCents: totals.totalLoanDeductionCents,
      paidCount: paidLines.length,
      paidTotalCents: paidLines.reduce(
        (sum, line) => sum + line.totalPaymentCents,
        0
      ),
      lineCount: sorted.length,
    },
    availableEmployees: activeEmployees
      .filter((employee) => !usedIds.has(employee._id))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((employee) => ({
        _id: employee._id,
        name: employee.name,
        code: employee.code ?? null,
        jobTitle: employee.jobTitle ?? null,
      })),
    alimonyLines: alimonyLines.map(toAlimonyLineRow),
    alimonyTotals: alimonyTotals(alimonyLines),
    availableAlimonies: availableAlimonies
      .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, "pt-BR"))
      .map(toAlimonyRow),
  };
}
