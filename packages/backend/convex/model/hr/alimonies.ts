import { v } from "convex/values";
import { employeePaymentMethod } from "../../schema/hr";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

/**
 * Pensão alimentícia: cadastro por funcionário e linhas mensais da folha.
 *
 * Helpers compartilhados entre `alimonies.ts` (cadastro e linhas) e
 * `payroll.ts` (abertura da competência e workspace). Nada aqui recalcula a
 * linha do funcionário: a pensão é paga ao beneficiário em linha própria.
 */

export const alimonyValidator = v.object({
  _id: v.id("employeeAlimonies"),
  employeeId: v.id("employees"),
  beneficiaryName: v.string(),
  amountCents: v.number(),
  paymentMethod: employeePaymentMethod,
  pixKey: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

export const alimonyLineValidator = v.object({
  _id: v.id("payrollAlimonyLines"),
  runId: v.id("payrollRuns"),
  alimonyId: v.id("employeeAlimonies"),
  employeeId: v.id("employees"),
  employeeName: v.string(),
  beneficiaryName: v.string(),
  amountCents: v.number(),
  paymentMethod: employeePaymentMethod,
  pixKey: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  paid: v.boolean(),
  paidAt: v.union(v.number(), v.null()),
});

export const alimonyTotalsValidator = v.object({
  count: v.number(),
  totalCents: v.number(),
  paidCount: v.number(),
  paidTotalCents: v.number(),
  pixTotalCents: v.number(),
});

export function toAlimonyRow(alimony: Doc<"employeeAlimonies">) {
  return {
    _id: alimony._id,
    employeeId: alimony.employeeId,
    beneficiaryName: alimony.beneficiaryName,
    amountCents: alimony.amountCents,
    paymentMethod: alimony.paymentMethod,
    pixKey: alimony.pixKey ?? null,
    notes: alimony.notes ?? null,
    archivedAt: alimony.archivedAt ?? null,
    createdAt: alimony.createdAt,
  };
}

export function toAlimonyLineRow(line: Doc<"payrollAlimonyLines">) {
  return {
    _id: line._id,
    runId: line.runId,
    alimonyId: line.alimonyId,
    employeeId: line.employeeId,
    employeeName: line.employeeName,
    beneficiaryName: line.beneficiaryName,
    amountCents: line.amountCents,
    paymentMethod: line.paymentMethod,
    pixKey: line.pixKey ?? null,
    notes: line.notes ?? null,
    paid: line.paid,
    paidAt: line.paidAt ?? null,
  };
}

export function alimonyTotals(lines: Doc<"payrollAlimonyLines">[]) {
  const paid = lines.filter((line) => line.paid);
  return {
    count: lines.length,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    paidCount: paid.length,
    paidTotalCents: paid.reduce((sum, line) => sum + line.amountCents, 0),
    pixTotalCents: lines
      .filter((line) => line.paymentMethod === "pix")
      .reduce((sum, line) => sum + line.amountCents, 0),
  };
}

export async function listActiveAlimoniesForEmployee(
  ctx: QueryCtx | MutationCtx,
  employeeId: Id<"employees">
) {
  const rows = await ctx.db
    .query("employeeAlimonies")
    .withIndex("by_employee", (q) => q.eq("employeeId", employeeId))
    .collect();
  return rows.filter((row) => !row.archivedAt);
}

export async function listAlimonyLinesForRun(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"payrollRuns">
) {
  return await ctx.db
    .query("payrollAlimonyLines")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
}

export async function findAlimonyLine(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"payrollRuns">,
  alimonyId: Id<"employeeAlimonies">
) {
  return await ctx.db
    .query("payrollAlimonyLines")
    .withIndex("by_run_and_alimony", (q) =>
      q.eq("runId", runId).eq("alimonyId", alimonyId)
    )
    .unique();
}

/**
 * Insere a linha de pensão de um mês. Valor e observações vêm da linha do mês
 * anterior quando existe (`source`), senão do cadastro.
 */
export async function insertAlimonyLine(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  alimony: Doc<"employeeAlimonies">,
  employee: Doc<"employees">,
  source?: Pick<Doc<"payrollAlimonyLines">, "amountCents" | "notes">
) {
  const now = Date.now();
  return await ctx.db.insert("payrollAlimonyLines", {
    runId: run._id,
    alimonyId: alimony._id,
    employeeId: employee._id,
    employeeName: employee.name,
    beneficiaryName: alimony.beneficiaryName,
    amountCents: source?.amountCents ?? alimony.amountCents,
    paymentMethod: alimony.paymentMethod,
    pixKey: alimony.pixKey,
    notes: source ? source.notes : alimony.notes,
    paid: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function alimonyLabel(
  alimony: Pick<Doc<"employeeAlimonies">, "beneficiaryName">,
  employee: Pick<Doc<"employees">, "name"> | null | undefined
) {
  return employee
    ? `${alimony.beneficiaryName} (pensão de ${employee.name})`
    : alimony.beneficiaryName;
}
