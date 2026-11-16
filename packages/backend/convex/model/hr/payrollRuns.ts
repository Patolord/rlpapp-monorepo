import { formatPayrollRunLabel } from "@rlpapp/shared/rh/payrollLabels";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  findAlimonyLine,
  insertAlimonyLine,
  listActiveAlimoniesForEmployee,
} from "./alimonies";
import {
  DEFAULT_DAILY_TRANSIT_CENTS,
  DEFAULT_FOOD_BASKET_CENTS,
  DEFAULT_MEAL_VOUCHER_PER_DAY_CENTS,
  DEFAULT_PAYMENT_DAY,
  DEFAULT_TRANSPORT_FOOD_DAYS,
  assertMonth,
  assertNonNegativeCents,
  assertYear,
  computePayrollLine,
  loanStatus,
  previousMonth,
} from "./payroll";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/**
 * Folha mensal (competência): busca da folha, criação e recálculo das linhas
 * dos funcionários e ciclo de vida da folha (abrir, parâmetros, fechar,
 * reabrir). A edição de linhas individuais fica em `payrollLines.ts`.
 */

export type CreatePayrollRunInput = {
  year: number;
  paymentMonth: number;
};

export type UpdatePayrollRunParametersInput = {
  runId: Id<"payrollRuns">;
  mealVoucherPerDayCents?: number;
  foodBasketCents?: number;
  defaultDailyTransitCents?: number;
  defaultTransportFoodDays?: number;
};

export async function requireRun(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"payrollRuns">
) {
  const run = await ctx.db.get("payrollRuns", runId);
  if (!run) throw notFound("Folha não encontrada");
  return run;
}

export function assertDraft(run: Doc<"payrollRuns">) {
  if (run.status === "closed") {
    throw ruleViolation("Folha fechada — reabra para editar");
  }
}

export async function findRun(
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

/** Soma das parcelas de empréstimo devidas pelo funcionário no mês. */
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

export async function recomputeLine(
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

export async function insertLineFromEmployee(
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

/**
 * Pensões alimentícias do mês: uma linha por pensão ativa de cada funcionário
 * que entrou na folha, com o valor do mês anterior quando houver (senão o
 * padrão do cadastro). Pagas ao beneficiário, fora da linha do funcionário.
 */
async function insertAlimonyLinesForRun(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  previous: Doc<"payrollRuns"> | undefined
) {
  const lines = await ctx.db
    .query("payrollLines")
    .withIndex("by_run", (q) => q.eq("runId", run._id))
    .collect();
  for (const line of lines) {
    const employee = await ctx.db.get("employees", line.employeeId);
    if (!employee) continue;
    for (const alimony of await listActiveAlimoniesForEmployee(ctx, employee._id)) {
      if (await findAlimonyLine(ctx, run._id, alimony._id)) continue;
      const source = previous
        ? await findAlimonyLine(ctx, previous._id, alimony._id)
        : null;
      await insertAlimonyLine(ctx, run, alimony, employee, source ?? undefined);
    }
  }
}

export async function createPayrollRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreatePayrollRunInput
): Promise<Id<"payrollRuns">> {
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
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });
  const run = await ctx.db.get("payrollRuns", runId);
  if (!run) throw notFound("Folha não encontrada");

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
  await insertAlimonyLinesForRun(ctx, run, previous);

  await logAudit(ctx, user, {
    action: "create",
    tableName: "payrollRuns",
    recordId: runId,
    entityLabel: formatPayrollRunLabel(run),
  });
  return runId;
}

export async function updatePayrollRunParameters(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdatePayrollRunParametersInput
): Promise<void> {
  const run = await requireRun(ctx, args.runId);
  assertDraft(run);
  const updates: Partial<Doc<"payrollRuns">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
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
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollRuns",
    recordId: args.runId,
    entityLabel: formatPayrollRunLabel(next),
    details: "Parâmetros do mês",
  });
}

export async function closePayrollRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  runId: Id<"payrollRuns">
): Promise<void> {
  const run = await requireRun(ctx, runId);
  if (run.status === "closed") return;
  const now = Date.now();
  await ctx.db.patch("payrollRuns", runId, {
    status: "closed",
    closedAt: now,
    closedByUserId: user._id,
    updatedAt: now,
    updatedByUserId: user._id,
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollRuns",
    recordId: runId,
    entityLabel: formatPayrollRunLabel(run),
    details: "Folha fechada",
  });
}

export async function reopenPayrollRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  runId: Id<"payrollRuns">
): Promise<void> {
  const run = await requireRun(ctx, runId);
  if (run.status === "draft") return;
  const now = Date.now();
  await ctx.db.patch("payrollRuns", runId, {
    status: "draft",
    closedAt: undefined,
    closedByUserId: undefined,
    updatedAt: now,
    updatedByUserId: user._id,
  });
  const lines = await ctx.db
    .query("payrollLines")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  const next = await requireRun(ctx, runId);
  for (const line of lines) {
    await recomputeLine(ctx, next, line);
  }
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollRuns",
    recordId: runId,
    entityLabel: formatPayrollRunLabel(next),
    details: "Folha reaberta",
  });
}
