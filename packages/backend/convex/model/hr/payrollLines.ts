import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { normalizeCustomerName } from "../contracts/customers";
import {
  findAlimonyLine,
  insertAlimonyLine,
  listActiveAlimoniesForEmployee,
} from "./alimonies";
import { assertNonNegativeCents } from "./payroll";
import {
  assertDraft,
  insertLineFromEmployee,
  recomputeLine,
  requireRun,
} from "./payrollRuns";

/**
 * Edição das linhas de funcionário de uma folha em rascunho: incluir
 * funcionário (existente ou novo), remover, editar valores e marcar pagamento.
 * Mudanças de identidade na linha (nome, código, cargo, salário, forma de
 * pagamento) também atualizam o cadastro do funcionário.
 */

type PaymentMethod = Doc<"payrollLines">["paymentMethod"];

export type AddEmployeeToPayrollRunInput = {
  runId: Id<"payrollRuns">;
  employeeId?: Id<"employees">;
  name?: string;
};

export type UpdatePayrollLineInput = {
  lineId: Id<"payrollLines">;
  code?: string | null;
  name?: string;
  jobTitle?: string | null;
  baseSalaryCents?: number;
  paymentMethod?: PaymentMethod;
  earningsCents?: number;
  deductionsCents?: number;
  foodBasketEnabled?: boolean;
  transportFoodDays?: number;
  dailyTransitCents?: number;
  supplementCents?: number;
  thirteenthFirstCents?: number;
  thirteenthSecondCents?: number;
  manualLoanDeductionCents?: number;
  awayNotes?: string | null;
  notes?: string | null;
};

export type SetPayrollLinePaidInput = {
  lineId: Id<"payrollLines">;
  paid: boolean;
};

export async function addEmployeeToPayrollRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: AddEmployeeToPayrollRunInput
): Promise<Id<"payrollLines">> {
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
      createdByUserId: user._id,
      updatedByUserId: user._id,
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
  for (const alimony of await listActiveAlimoniesForEmployee(ctx, employee._id)) {
    if (await findAlimonyLine(ctx, run._id, alimony._id)) continue;
    await insertAlimonyLine(ctx, run, alimony, employee);
  }
  await logAudit(ctx, user, {
    action: "create",
    tableName: "payrollLines",
    recordId: lineId,
    entityLabel: employee.name,
  });
  return lineId;
}

export async function removePayrollLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  lineId: Id<"payrollLines">
): Promise<void> {
  const line = await ctx.db.get("payrollLines", lineId);
  if (!line) return;
  const run = await requireRun(ctx, line.runId);
  assertDraft(run);
  await ctx.db.delete("payrollLines", lineId);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "payrollLines",
    recordId: lineId,
    entityLabel: line.name,
  });
}

export async function updatePayrollLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: UpdatePayrollLineInput
): Promise<void> {
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
    identityPatch.updatedByUserId = user._id;
    await ctx.db.patch("employees", line.employeeId, identityPatch);
  }
}

export async function setPayrollLinePaid(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: SetPayrollLinePaidInput
): Promise<void> {
  const line = await ctx.db.get("payrollLines", args.lineId);
  if (!line) throw new Error("Linha não encontrada");
  const run = await requireRun(ctx, line.runId);
  assertDraft(run);
  await ctx.db.patch("payrollLines", args.lineId, {
    paid: args.paid,
    paidAt: args.paid ? Date.now() : undefined,
    paidByUserId: args.paid ? user._id : undefined,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollLines",
    recordId: args.lineId,
    entityLabel: line.name,
    details: args.paid ? "Pagamento confirmado" : "Pagamento desfeito",
  });
}
