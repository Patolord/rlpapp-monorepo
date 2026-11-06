import { v } from "convex/values";
import { folhaMutation, folhaQuery } from "./lib/rbac";
import { employeePaymentMethod } from "./schema/hr";
import {
  archiveEmployeeLoan,
  createEmployeeLoan,
  listEmployeeLoans,
  updateEmployeeLoan,
} from "./model/hr/employeeLoans";
import {
  addEmployeeToPayrollRun,
  removePayrollLine,
  setPayrollLinePaid,
  updatePayrollLine,
} from "./model/hr/payrollLines";
import {
  closePayrollRun,
  createPayrollRun,
  reopenPayrollRun,
  updatePayrollRunParameters,
} from "./model/hr/payrollRuns";
import {
  employeeLoanValidator,
  payrollRunValidator,
  payrollWorkspaceValidator,
} from "./model/hr/payrollValidators";
import {
  getPayrollWorkspace,
  listPayrollRuns,
} from "./model/hr/payrollWorkspace";

export const listRuns = folhaQuery({
  args: { year: v.optional(v.number()) },
  returns: v.array(payrollRunValidator),
  handler: async (ctx, args) => {
    return await listPayrollRuns(ctx, args.year);
  },
});

export const getWorkspace = folhaQuery({
  args: {
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: payrollWorkspaceValidator,
  handler: async (ctx, args) => {
    return await getPayrollWorkspace(ctx, args);
  },
});

export const createRun = folhaMutation({
  args: {
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: v.id("payrollRuns"),
  handler: async (ctx, args) => {
    return await createPayrollRun(ctx, ctx.user, args);
  },
});

export const updateRunParameters = folhaMutation({
  args: {
    runId: v.id("payrollRuns"),
    mealVoucherPerDayCents: v.optional(v.number()),
    foodBasketCents: v.optional(v.number()),
    defaultDailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updatePayrollRunParameters(ctx, ctx.user, args);
    return null;
  },
});

export const addEmployeeToRun = folhaMutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.optional(v.id("employees")),
    name: v.optional(v.string()),
  },
  returns: v.id("payrollLines"),
  handler: async (ctx, args) => {
    return await addEmployeeToPayrollRun(ctx, ctx.user, args);
  },
});

export const removeLine = folhaMutation({
  args: { lineId: v.id("payrollLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removePayrollLine(ctx, ctx.user, args.lineId);
    return null;
  },
});

export const updateLine = folhaMutation({
  args: {
    lineId: v.id("payrollLines"),
    code: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    jobTitle: v.optional(v.union(v.string(), v.null())),
    baseSalaryCents: v.optional(v.number()),
    paymentMethod: v.optional(employeePaymentMethod),
    earningsCents: v.optional(v.number()),
    deductionsCents: v.optional(v.number()),
    foodBasketEnabled: v.optional(v.boolean()),
    transportFoodDays: v.optional(v.number()),
    dailyTransitCents: v.optional(v.number()),
    supplementCents: v.optional(v.number()),
    thirteenthFirstCents: v.optional(v.number()),
    thirteenthSecondCents: v.optional(v.number()),
    manualLoanDeductionCents: v.optional(v.number()),
    awayNotes: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updatePayrollLine(ctx, ctx.user, args);
    return null;
  },
});

export const togglePaid = folhaMutation({
  args: {
    lineId: v.id("payrollLines"),
    paid: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setPayrollLinePaid(ctx, ctx.user, args);
    return null;
  },
});

export const closeRun = folhaMutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closePayrollRun(ctx, ctx.user, args.runId);
    return null;
  },
});

export const reopenRun = folhaMutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await reopenPayrollRun(ctx, ctx.user, args.runId);
    return null;
  },
});

export const listLoans = folhaQuery({
  args: {
    employeeId: v.id("employees"),
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: v.array(employeeLoanValidator),
  handler: async (ctx, args) => {
    return await listEmployeeLoans(ctx, args);
  },
});

export const createLoan = folhaMutation({
  args: {
    employeeId: v.id("employees"),
    totalCents: v.number(),
    installmentCount: v.number(),
    installmentCents: v.optional(v.number()),
    startYear: v.number(),
    startMonth: v.number(),
    description: v.optional(v.string()),
  },
  returns: v.id("employeeLoans"),
  handler: async (ctx, args) => {
    return await createEmployeeLoan(ctx, ctx.user, args);
  },
});

export const updateLoan = folhaMutation({
  args: {
    loanId: v.id("employeeLoans"),
    totalCents: v.optional(v.number()),
    installmentCount: v.optional(v.number()),
    installmentCents: v.optional(v.number()),
    startYear: v.optional(v.number()),
    startMonth: v.optional(v.number()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateEmployeeLoan(ctx, ctx.user, args);
    return null;
  },
});

export const archiveLoan = folhaMutation({
  args: { loanId: v.id("employeeLoans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveEmployeeLoan(ctx, ctx.user, args.loanId);
    return null;
  },
});
