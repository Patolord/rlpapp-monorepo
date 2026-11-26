import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  assertMonth,
  assertNonNegativeCents,
  assertYear,
  loanStatus,
} from "./payroll";
import { recomputeLine } from "./payrollRuns";
import { notFound } from "../../lib/domainErrors";

/**
 * Empréstimos a funcionários, descontados em parcelas mensais na folha. Toda
 * mudança recalcula as linhas do funcionário nas folhas em rascunho.
 */

export type ListEmployeeLoansInput = {
  employeeId: Id<"employees">;
  year: number;
  paymentMonth: number;
};

export type CreateEmployeeLoanInput = {
  employeeId: Id<"employees">;
  totalCents: number;
  installmentCount: number;
  installmentCents?: number;
  startYear: number;
  startMonth: number;
  description?: string;
};

export type UpdateEmployeeLoanInput = {
  loanId: Id<"employeeLoans">;
  totalCents?: number;
  installmentCount?: number;
  installmentCents?: number;
  startYear?: number;
  startMonth?: number;
  description?: string | null;
};

function toLoanRow(loan: Doc<"employeeLoans">, year: number, month: number) {
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

export async function listEmployeeLoans(
  ctx: QueryCtx,
  args: ListEmployeeLoansInput
) {
  assertYear(args.year);
  assertMonth(args.paymentMonth);
  const loans = await ctx.db
    .query("employeeLoans")
    .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
    .collect();
  return loans
    .filter((loan) => !loan.archivedAt)
    .map((loan) => toLoanRow(loan, args.year, args.paymentMonth));
}

export async function createEmployeeLoan(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: CreateEmployeeLoanInput
): Promise<Id<"employeeLoans">> {
  const employee = await ctx.db.get("employees", args.employeeId);
  if (!employee) throw notFound("Funcionário não encontrado");
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
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });
  await recomputeEmployeeDraftLines(ctx, args.employeeId);
  await logAudit(ctx, user, {
    action: "create",
    tableName: "employeeLoans",
    recordId: loanId,
    entityLabel: employee.name,
  });
  return loanId;
}

export async function updateEmployeeLoan(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdateEmployeeLoanInput
): Promise<void> {
  const loan = await ctx.db.get("employeeLoans", args.loanId);
  if (!loan) throw notFound("Empréstimo não encontrado");
  const updates: Partial<Doc<"employeeLoans">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
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
  await logAudit(ctx, user, {
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
}

export async function archiveEmployeeLoan(
  ctx: MutationCtx,
  user: Doc<"users">,
  loanId: Id<"employeeLoans">
): Promise<void> {
  const loan = await ctx.db.get("employeeLoans", loanId);
  if (!loan) throw notFound("Empréstimo não encontrado");
  if (loan.archivedAt) return;
  await ctx.db.patch("employeeLoans", loanId, {
    archivedAt: Date.now(),
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  });
  await recomputeEmployeeDraftLines(ctx, loan.employeeId);
  await logAudit(ctx, user, {
    action: "archive",
    tableName: "employeeLoans",
    recordId: loanId,
    details: "Empréstimo excluído",
  });
}
