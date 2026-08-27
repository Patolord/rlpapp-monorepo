import { v } from "convex/values";
import { hrMutation, hrQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { normalizeCustomerName } from "./lib/customers/helpers";
import {
  DEFAULT_DAILY_TRANSIT_CENTS,
  DEFAULT_FOOD_BASKET_CENTS,
  DEFAULT_MEAL_VOUCHER_PER_DAY_CENTS,
  DEFAULT_PAYMENT_DAY,
  DEFAULT_TRANSPORT_FOOD_DAYS,
  addPayrollTotals,
  assertMonth,
  assertNonNegativeCents,
  assertYear,
  computePayrollLine,
  emptyPayrollTotals,
  formatPayrollRunLabel,
  loanStatus,
  previousMonth,
} from "./lib/rh/payroll";
import { employeePaymentMethod } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const paymentMethodValidator = employeePaymentMethod;

const payrollRunValidator = v.object({
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

const payrollLineValidator = v.object({
  _id: v.id("payrollLines"),
  runId: v.id("payrollRuns"),
  employeeId: v.id("employees"),
  code: v.union(v.string(), v.null()),
  name: v.string(),
  jobTitle: v.union(v.string(), v.null()),
  baseSalaryCents: v.number(),
  paymentMethod: paymentMethodValidator,
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

const payrollTotalsValidator = v.object({
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

const loanValidator = v.object({
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

async function requireRun(ctx: QueryCtx | MutationCtx, runId: Id<"payrollRuns">) {
  const run = await ctx.db.get("payrollRuns", runId);
  if (!run) throw new Error("Folha não encontrada");
  return run;
}

function assertDraft(run: Doc<"payrollRuns">) {
  if (run.status === "closed") {
    throw new Error("Folha fechada — reabra para editar");
  }
}

async function findRun(
  ctx: QueryCtx | MutationCtx,
  year: number,
  paymentMonth: number
) {
  return await ctx.db
    .query("payrollRuns")
    .withIndex("by_year_and_payment_month", (q) =>
      q.eq("year", year).eq("paymentMonth", paymentMonth)
    )
    .unique();
}

async function listActiveLoans(
  ctx: QueryCtx | MutationCtx,
  employeeId: Id<"employees">
) {
  const loans = await ctx.db
    .query("employeeLoans")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  return loans.filter((loan) => !loan.archivedAt);
}

async function scheduledLoanForEmployee(
  ctx: QueryCtx | MutationCtx,
  employeeId: Id<"employees">,
  year: number,
  month: number
) {
  const loans = await listActiveLoans(ctx, employeeId);
  return loans.reduce(
    (sum, loan) => sum + loanStatus(loan, year, month).dueCents,
    0
  );
}

async function recomputeLine(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  line: Doc<"payrollLines">,
  extra?: Partial<Doc<"payrollLines">>
) {
  const next = { ...line, ...extra };
  const scheduled = await scheduledLoanForEmployee(
    ctx,
    next.employeeId,
    run.year,
    run.paymentMonth
  );
  const computed = computePayrollLine(next, run, scheduled);
  await ctx.db.patch("payrollLines", line._id, {
    ...extra,
    ...computed,
    updatedAt: Date.now(),
  });
}

async function recomputeEmployeeDraftLines(
  ctx: MutationCtx,
  employeeId: Id<"employees">
) {
  const lines = await ctx.db
    .query("payrollLines")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  for (const line of lines) {
    const run = await ctx.db.get("payrollRuns", line.runId);
    if (!run || run.status !== "draft") continue;
    await recomputeLine(ctx, run, line);
  }
}

function lineInsertFields(
  run: Doc<"payrollRuns">,
  employee: Doc<"employees">,
  source: Partial<Doc<"payrollLines">> | undefined,
  computed: ReturnType<typeof computePayrollLine>,
  now: number
): Omit<Doc<"payrollLines">, "_id" | "_creationTime"> {
  return {
    runId: run._id,
    employeeId: employee._id,
    code: source?.code ?? employee.code,
    name: source?.name ?? employee.name,
    jobTitle: source?.jobTitle ?? employee.jobTitle,
    baseSalaryCents: source?.baseSalaryCents ?? employee.baseSalaryCents,
    paymentMethod: source?.paymentMethod ?? employee.paymentMethod,
    earningsCents: source?.earningsCents ?? employee.baseSalaryCents,
    deductionsCents: source?.deductionsCents ?? 0,
    foodBasketEnabled:
      source?.foodBasketEnabled ?? employee.receivesFoodBasket,
    transportFoodDays:
      source?.transportFoodDays ?? employee.defaultTransportFoodDays,
    dailyTransitCents: source?.dailyTransitCents ?? employee.dailyTransitCents,
    supplementCents: source?.supplementCents ?? 0,
    thirteenthFirstCents: source?.thirteenthFirstCents ?? 0,
    thirteenthSecondCents: source?.thirteenthSecondCents ?? 0,
    manualLoanDeductionCents: source?.manualLoanDeductionCents ?? 0,
    awayNotes: source?.awayNotes,
    notes: source?.notes,
    paid: false,
    mealVoucherCents: computed.mealVoucherCents,
    transitVoucherCents: computed.transitVoucherCents,
    foodBasketCents: computed.foodBasketCents,
    scheduledLoanDeductionCents: computed.scheduledLoanDeductionCents,
    totalLoanDeductionCents: computed.totalLoanDeductionCents,
    totalPaymentCents: computed.totalPaymentCents,
    createdAt: now,
    updatedAt: now,
  };
}

async function insertLineFromEmployee(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  employee: Doc<"employees">,
  source?: Partial<Doc<"payrollLines">>
) {
  const amounts = {
    earningsCents: source?.earningsCents ?? employee.baseSalaryCents,
    deductionsCents: source?.deductionsCents ?? 0,
    foodBasketEnabled:
      source?.foodBasketEnabled ?? employee.receivesFoodBasket,
    transportFoodDays:
      source?.transportFoodDays ??
      (source ? run.defaultTransportFoodDays : employee.defaultTransportFoodDays),
    dailyTransitCents: source?.dailyTransitCents ?? employee.dailyTransitCents,
    supplementCents: source?.supplementCents ?? 0,
    thirteenthFirstCents: source?.thirteenthFirstCents ?? 0,
    thirteenthSecondCents: source?.thirteenthSecondCents ?? 0,
    manualLoanDeductionCents: source?.manualLoanDeductionCents ?? 0,
  };
  const scheduled = await scheduledLoanForEmployee(
    ctx,
    employee._id,
    run.year,
    run.paymentMonth
  );
  const computed = computePayrollLine(amounts, run, scheduled);
  const now = Date.now();
  return await ctx.db.insert(
    "payrollLines",
    lineInsertFields(run, employee, { ...source, ...amounts }, computed, now)
  );
}

function toLineRow(
  line: Doc<"payrollLines">,
  activeLoanCount: number
) {
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

function toLoanRow(
  loan: Doc<"employeeLoans">,
  year: number,
  month: number
) {
  const status = loanStatus(loan, year, month);
  return {
    _id: loan._id,
    employeeId: loan.employeeId,
    totalCents: loan.totalCents,
    installmentCount: loan.installmentCount,
    installmentCents: loan.installmentCents,
    startYear: loan.startYear,
    startMonth: loan.startMonth,
    description: loan.description ?? null,
    archivedAt: loan.archivedAt ?? null,
    paidCount: status.paidCount,
    dueCents: status.dueCents,
    outstandingCents: status.outstandingCents,
    endYear: status.endYear,
    endMonth: status.endMonth,
    settled: status.settled,
    progressPercent: status.progressPercent,
  };
}

export const listRuns = hrQuery({
  args: { year: v.optional(v.number()) },
  returns: v.array(payrollRunValidator),
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("payrollRuns").collect();
    const filtered =
      args.year === undefined
        ? runs
        : runs.filter((run) => run.year === args.year);
    return filtered
      .sort((a, b) =>
        a.year === b.year ? a.paymentMonth - b.paymentMonth : a.year - b.year
      )
      .map(toRunRow);
  },
});

export const getWorkspace = hrQuery({
  args: {
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: v.object({
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
  }),
  handler: async (ctx, args) => {
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

    const sorted = lines.sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
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
    };
  },
});

export const createRun = hrMutation({
  args: {
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: v.id("payrollRuns"),
  handler: async (ctx, args) => {
    assertYear(args.year);
    assertMonth(args.paymentMonth);
    const existing = await findRun(ctx, args.year, args.paymentMonth);
    if (existing) return existing._id;

    const allRuns = await ctx.db.query("payrollRuns").collect();
    const previous = allRuns
      .filter(
        (run) =>
          run.year < args.year ||
          (run.year === args.year && run.paymentMonth < args.paymentMonth)
      )
      .sort((a, b) =>
        a.year === b.year ? b.paymentMonth - a.paymentMonth : b.year - a.year
      )[0];

    const reference = previousMonth(args.year, args.paymentMonth);
    const now = Date.now();
    const runId = await ctx.db.insert("payrollRuns", {
      year: args.year,
      paymentMonth: args.paymentMonth,
      referenceYear: reference.year,
      referenceMonth: reference.month,
      paymentDay: previous?.paymentDay ?? DEFAULT_PAYMENT_DAY,
      status: "draft",
      mealVoucherPerDayCents:
        previous?.mealVoucherPerDayCents ?? DEFAULT_MEAL_VOUCHER_PER_DAY_CENTS,
      foodBasketCents: previous?.foodBasketCents ?? DEFAULT_FOOD_BASKET_CENTS,
      defaultDailyTransitCents:
        previous?.defaultDailyTransitCents ?? DEFAULT_DAILY_TRANSIT_CENTS,
      defaultTransportFoodDays:
        previous?.defaultTransportFoodDays ?? DEFAULT_TRANSPORT_FOOD_DAYS,
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
    });
    const run = await ctx.db.get("payrollRuns", runId);
    if (!run) throw new Error("Folha não encontrada");

    if (previous) {
      const previousLines = await ctx.db
        .query("payrollLines")
        .withIndex("by_run", (q) => q.eq("runId", previous._id))
        .collect();
      for (const line of previousLines) {
        const employee = await ctx.db.get("employees", line.employeeId);
        if (
          !employee ||
          employee.archivedAt ||
          employee.status === "terminated"
        ) {
          continue;
        }
        await insertLineFromEmployee(ctx, run, employee, line);
      }
    } else {
      const employees = await ctx.db.query("employees").collect();
      for (const employee of employees) {
        if (employee.archivedAt || employee.status === "terminated") continue;
        await insertLineFromEmployee(ctx, run, employee);
      }
    }

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "payrollRuns",
      recordId: runId,
      entityLabel: formatPayrollRunLabel(run),
    });
    return runId;
  },
});

export const updateRunParameters = hrMutation({
  args: {
    runId: v.id("payrollRuns"),
    mealVoucherPerDayCents: v.optional(v.number()),
    foodBasketCents: v.optional(v.number()),
    defaultDailyTransitCents: v.optional(v.number()),
    defaultTransportFoodDays: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    assertDraft(run);
    const updates: Partial<Doc<"payrollRuns">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };
    if (args.mealVoucherPerDayCents !== undefined) {
      updates.mealVoucherPerDayCents = assertNonNegativeCents(
        args.mealVoucherPerDayCents,
        "Vale alimentação"
      );
    }
    if (args.foodBasketCents !== undefined) {
      updates.foodBasketCents = assertNonNegativeCents(
        args.foodBasketCents,
        "Cesta básica"
      );
    }
    if (args.defaultDailyTransitCents !== undefined) {
      updates.defaultDailyTransitCents = assertNonNegativeCents(
        args.defaultDailyTransitCents,
        "Passagem padrão"
      );
    }
    if (args.defaultTransportFoodDays !== undefined) {
      updates.defaultTransportFoodDays = Math.max(
        0,
        Math.round(args.defaultTransportFoodDays)
      );
    }
    await ctx.db.patch("payrollRuns", args.runId, updates);
    const next = await requireRun(ctx, args.runId);
    const lines = await ctx.db
      .query("payrollLines")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    for (const line of lines) {
      await recomputeLine(ctx, next, line);
    }
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollRuns",
      recordId: args.runId,
      entityLabel: formatPayrollRunLabel(next),
      details: "Parâmetros do mês",
    });
    return null;
  },
});

export const addEmployeeToRun = hrMutation({
  args: {
    runId: v.id("payrollRuns"),
    employeeId: v.optional(v.id("employees")),
    name: v.optional(v.string()),
  },
  returns: v.id("payrollLines"),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    assertDraft(run);

    let employee: Doc<"employees"> | null = null;
    if (args.employeeId) {
      employee = await ctx.db.get("employees", args.employeeId);
      if (!employee) throw new Error("Funcionário não encontrado");
    } else {
      const name = args.name?.trim();
      if (!name) throw new Error("Informe o nome do funcionário");
      const nameNormalized = normalizeCustomerName(name);
      const existingName = await ctx.db
        .query("employees")
        .withIndex("by_name_normalized", (q) =>
          q.eq("nameNormalized", nameNormalized)
        )
        .first();
      if (existingName) {
        throw new Error("Já existe um funcionário com este nome");
      }
      const now = Date.now();
      const employeeId = await ctx.db.insert("employees", {
        name,
        nameNormalized: normalizeCustomerName(name),
        status: "active",
        paymentMethod: "pix",
        baseSalaryCents: 0,
        receivesFoodBasket: true,
        dailyTransitCents: run.defaultDailyTransitCents,
        defaultTransportFoodDays: run.defaultTransportFoodDays,
        createdAt: now,
        updatedAt: now,
        createdByUserId: ctx.user._id,
        updatedByUserId: ctx.user._id,
      });
      employee = await ctx.db.get("employees", employeeId);
    }
    if (!employee) throw new Error("Funcionário não encontrado");

    const existing = await ctx.db
      .query("payrollLines")
      .withIndex("by_run_and_employee", (q) =>
        q.eq("runId", args.runId).eq("employeeId", employee!._id)
      )
      .unique();
    if (existing) {
      throw new Error("Funcionário já está nesta folha");
    }

    const lineId = await insertLineFromEmployee(ctx, run, employee);
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "payrollLines",
      recordId: lineId,
      entityLabel: employee.name,
    });
    return lineId;
  },
});

export const removeLine = hrMutation({
  args: { lineId: v.id("payrollLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get("payrollLines", args.lineId);
    if (!line) return null;
    const run = await requireRun(ctx, line.runId);
    assertDraft(run);
    await ctx.db.delete("payrollLines", args.lineId);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "payrollLines",
      recordId: args.lineId,
      entityLabel: line.name,
    });
    return null;
  },
});

export const updateLine = hrMutation({
  args: {
    lineId: v.id("payrollLines"),
    code: v.optional(v.union(v.string(), v.null())),
    name: v.optional(v.string()),
    jobTitle: v.optional(v.union(v.string(), v.null())),
    baseSalaryCents: v.optional(v.number()),
    paymentMethod: v.optional(paymentMethodValidator),
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
    const line = await ctx.db.get("payrollLines", args.lineId);
    if (!line) throw new Error("Linha não encontrada");
    const run = await requireRun(ctx, line.runId);
    assertDraft(run);

    const extra: Partial<Doc<"payrollLines">> = {};
    if (args.code !== undefined) extra.code = args.code?.trim() || undefined;
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Informe o nome");
      extra.name = name;
    }
    if (args.jobTitle !== undefined) {
      extra.jobTitle = args.jobTitle?.trim() || undefined;
    }
    if (args.baseSalaryCents !== undefined) {
      extra.baseSalaryCents = assertNonNegativeCents(
        args.baseSalaryCents,
        "Salário base"
      );
    }
    if (args.paymentMethod !== undefined) extra.paymentMethod = args.paymentMethod;
    if (args.earningsCents !== undefined) {
      extra.earningsCents = assertNonNegativeCents(args.earningsCents, "Proventos");
    }
    if (args.deductionsCents !== undefined) {
      extra.deductionsCents = assertNonNegativeCents(
        args.deductionsCents,
        "Descontos"
      );
    }
    if (args.foodBasketEnabled !== undefined) {
      extra.foodBasketEnabled = args.foodBasketEnabled;
    }
    if (args.transportFoodDays !== undefined) {
      extra.transportFoodDays = Math.max(0, Math.round(args.transportFoodDays));
    }
    if (args.dailyTransitCents !== undefined) {
      extra.dailyTransitCents = assertNonNegativeCents(
        args.dailyTransitCents,
        "Passagem"
      );
    }
    if (args.supplementCents !== undefined) {
      extra.supplementCents = assertNonNegativeCents(
        args.supplementCents,
        "Complemento"
      );
    }
    if (args.thirteenthFirstCents !== undefined) {
      extra.thirteenthFirstCents = assertNonNegativeCents(
        args.thirteenthFirstCents,
        "13º parcela 1"
      );
    }
    if (args.thirteenthSecondCents !== undefined) {
      extra.thirteenthSecondCents = assertNonNegativeCents(
        args.thirteenthSecondCents,
        "13º parcela 2"
      );
    }
    if (args.manualLoanDeductionCents !== undefined) {
      extra.manualLoanDeductionCents = assertNonNegativeCents(
        args.manualLoanDeductionCents,
        "Desconto avulso"
      );
    }
    if (args.awayNotes !== undefined) {
      extra.awayNotes = args.awayNotes?.trim() || undefined;
    }
    if (args.notes !== undefined) extra.notes = args.notes?.trim() || undefined;

    if (args.name !== undefined) {
      const nameNormalized = normalizeCustomerName(extra.name!);
      const existingByName = await ctx.db
        .query("employees")
        .withIndex("by_name_normalized", (q) =>
          q.eq("nameNormalized", nameNormalized)
        )
        .collect();
      if (existingByName.some((row) => row._id !== line.employeeId)) {
        throw new Error("Já existe um funcionário com este nome");
      }
    }

    await recomputeLine(ctx, run, line, extra);

    const identityPatch: Partial<Doc<"employees">> = {};
    if (args.name !== undefined) {
      const name = extra.name!;
      identityPatch.name = name;
      identityPatch.nameNormalized = normalizeCustomerName(name);
    }
    if (args.code !== undefined) identityPatch.code = extra.code;
    if (args.jobTitle !== undefined) identityPatch.jobTitle = extra.jobTitle;
    if (args.baseSalaryCents !== undefined) {
      identityPatch.baseSalaryCents = extra.baseSalaryCents;
    }
    if (args.paymentMethod !== undefined) {
      identityPatch.paymentMethod = extra.paymentMethod;
    }
    if (Object.keys(identityPatch).length > 0) {
      identityPatch.updatedAt = Date.now();
      identityPatch.updatedByUserId = ctx.user._id;
      await ctx.db.patch("employees", line.employeeId, identityPatch);
    }
    return null;
  },
});

export const togglePaid = hrMutation({
  args: {
    lineId: v.id("payrollLines"),
    paid: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get("payrollLines", args.lineId);
    if (!line) throw new Error("Linha não encontrada");
    const run = await requireRun(ctx, line.runId);
    assertDraft(run);
    await ctx.db.patch("payrollLines", args.lineId, {
      paid: args.paid,
      paidAt: args.paid ? Date.now() : undefined,
      paidByUserId: args.paid ? ctx.user._id : undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollLines",
      recordId: args.lineId,
      entityLabel: line.name,
      details: args.paid ? "Pagamento confirmado" : "Pagamento desfeito",
    });
    return null;
  },
});

export const closeRun = hrMutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    if (run.status === "closed") return null;
    const now = Date.now();
    await ctx.db.patch("payrollRuns", args.runId, {
      status: "closed",
      closedAt: now,
      closedByUserId: ctx.user._id,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollRuns",
      recordId: args.runId,
      entityLabel: formatPayrollRunLabel(run),
      details: "Folha fechada",
    });
    return null;
  },
});

export const reopenRun = hrMutation({
  args: { runId: v.id("payrollRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    if (run.status === "draft") return null;
    const now = Date.now();
    await ctx.db.patch("payrollRuns", args.runId, {
      status: "draft",
      closedAt: undefined,
      closedByUserId: undefined,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
    });
    const lines = await ctx.db
      .query("payrollLines")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const next = await requireRun(ctx, args.runId);
    for (const line of lines) {
      await recomputeLine(ctx, next, line);
    }
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollRuns",
      recordId: args.runId,
      entityLabel: formatPayrollRunLabel(next),
      details: "Folha reaberta",
    });
    return null;
  },
});

export const listLoans = hrQuery({
  args: {
    employeeId: v.id("employees"),
    year: v.number(),
    paymentMonth: v.number(),
  },
  returns: v.array(loanValidator),
  handler: async (ctx, args) => {
    assertYear(args.year);
    assertMonth(args.paymentMonth);
    const loans = await ctx.db
      .query("employeeLoans")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    return loans
      .filter((loan) => !loan.archivedAt)
      .map((loan) => toLoanRow(loan, args.year, args.paymentMonth));
  },
});

export const createLoan = hrMutation({
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
    const employee = await ctx.db.get("employees", args.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    assertYear(args.startYear);
    assertMonth(args.startMonth);
    const installmentCount = Math.max(1, Math.round(args.installmentCount));
    const totalCents = assertNonNegativeCents(args.totalCents, "Valor total");
    const installmentCents =
      args.installmentCents !== undefined
        ? assertNonNegativeCents(args.installmentCents, "Parcela")
        : Math.round(totalCents / installmentCount);
    const now = Date.now();
    const loanId = await ctx.db.insert("employeeLoans", {
      employeeId: args.employeeId,
      totalCents,
      installmentCount,
      installmentCents,
      startYear: args.startYear,
      startMonth: args.startMonth,
      description: args.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
    });
    await recomputeEmployeeDraftLines(ctx, args.employeeId);
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "employeeLoans",
      recordId: loanId,
      entityLabel: employee.name,
    });
    return loanId;
  },
});

export const updateLoan = hrMutation({
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
    const loan = await ctx.db.get("employeeLoans", args.loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const updates: Partial<Doc<"employeeLoans">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };
    if (args.totalCents !== undefined) {
      updates.totalCents = assertNonNegativeCents(args.totalCents, "Valor total");
    }
    if (args.installmentCount !== undefined) {
      updates.installmentCount = Math.max(1, Math.round(args.installmentCount));
    }
    if (args.installmentCents !== undefined) {
      updates.installmentCents = assertNonNegativeCents(
        args.installmentCents,
        "Parcela"
      );
    }
    if (args.startYear !== undefined) {
      assertYear(args.startYear);
      updates.startYear = args.startYear;
    }
    if (args.startMonth !== undefined) {
      assertMonth(args.startMonth);
      updates.startMonth = args.startMonth;
    }
    if (args.description !== undefined) {
      updates.description = args.description?.trim() || undefined;
    }
    if (args.totalCents !== undefined && args.installmentCents === undefined) {
      updates.installmentCents = Math.round(
        (updates.totalCents ?? loan.totalCents) /
          (updates.installmentCount ?? loan.installmentCount)
      );
    }
    await ctx.db.patch("employeeLoans", args.loanId, updates);
    await recomputeEmployeeDraftLines(ctx, loan.employeeId);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "employeeLoans",
      recordId: args.loanId,
      details: "Empréstimo atualizado",
      snapshotAfter: {
        totalCents: updates.totalCents ?? loan.totalCents,
        installmentCount: updates.installmentCount ?? loan.installmentCount,
        installmentCents: updates.installmentCents ?? loan.installmentCents,
        startYear: updates.startYear ?? loan.startYear,
        startMonth: updates.startMonth ?? loan.startMonth,
      },
    });
    return null;
  },
});

export const archiveLoan = hrMutation({
  args: { loanId: v.id("employeeLoans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loan = await ctx.db.get("employeeLoans", args.loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    if (loan.archivedAt) return null;
    await ctx.db.patch("employeeLoans", args.loanId, {
      archivedAt: Date.now(),
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    });
    await recomputeEmployeeDraftLines(ctx, loan.employeeId);
    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "employeeLoans",
      recordId: args.loanId,
      details: "Empréstimo excluído",
    });
    return null;
  },
});
