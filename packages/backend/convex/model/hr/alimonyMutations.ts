import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import {
  alimonyLabel,
  findAlimonyLine,
  insertAlimonyLine,
  toAlimonyRow,
} from "./alimonies";
import { assertNonNegativeCents } from "./payroll";
import { assertDraft, requireRun } from "./payrollRuns";

// Escritas da pensão alimentícia: cadastro e linhas mensais da folha. A pensão
// é paga direto ao beneficiário, em linha própria, e nunca altera a linha do
// funcionário.

type PaymentMethod = Doc<"employeeAlimonies">["paymentMethod"];

async function requireAlimony(
  ctx: MutationCtx,
  alimonyId: Id<"employeeAlimonies">
) {
  const alimony = await ctx.db.get("employeeAlimonies", alimonyId);
  if (!alimony) throw new Error("Pensão não encontrada");
  return alimony;
}

async function requireAlimonyLine(
  ctx: MutationCtx,
  lineId: Id<"payrollAlimonyLines">
) {
  const line = await ctx.db.get("payrollAlimonyLines", lineId);
  if (!line) throw new Error("Linha não encontrada");
  return line;
}

/** Folha da linha, que precisa estar em rascunho. */
async function requireDraftRunForLine(
  ctx: MutationCtx,
  line: Doc<"payrollAlimonyLines">
) {
  const run = await requireRun(ctx, line.runId);
  assertDraft(run);
  return run;
}

async function listDraftRuns(ctx: MutationCtx) {
  const runs = await ctx.db.query("payrollRuns").collect();
  return runs.filter((run) => run.status === "draft");
}

/**
 * Cadastra a pensão e já a inclui nas folhas em rascunho em que o funcionário
 * está, para o mês corrente não ficar sem a linha.
 */
export async function createAlimony(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    employeeId: Id<"employees">;
    beneficiaryName: string;
    amountCents: number;
    paymentMethod?: PaymentMethod;
    pixKey?: string;
    notes?: string;
  }
): Promise<Id<"employeeAlimonies">> {
  const employee = await ctx.db.get("employees", input.employeeId);
  if (!employee) throw new Error("Funcionário não encontrado");
  const beneficiaryName = input.beneficiaryName.trim();
  if (!beneficiaryName) throw new Error("Informe o nome do beneficiário");
  const amountCents = assertNonNegativeCents(input.amountCents, "Valor da pensão");

  const now = Date.now();
  const alimonyId = await ctx.db.insert("employeeAlimonies", {
    employeeId: employee._id,
    beneficiaryName,
    amountCents,
    paymentMethod: input.paymentMethod ?? "pix",
    pixKey: input.pixKey?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    createdByUserId: user._id,
    updatedByUserId: user._id,
  });
  const alimony = await ctx.db.get("employeeAlimonies", alimonyId);
  if (!alimony) throw new Error("Pensão não encontrada");

  for (const run of await listDraftRuns(ctx)) {
    const employeeLine = await ctx.db
      .query("payrollLines")
      .withIndex("by_run_and_employee", (q) =>
        q.eq("runId", run._id).eq("employeeId", employee._id)
      )
      .unique();
    if (!employeeLine) continue;
    await insertAlimonyLine(ctx, run, alimony, employee);
  }

  await logAudit(ctx, user, {
    action: "create",
    tableName: "employeeAlimonies",
    recordId: alimonyId,
    entityLabel: alimonyLabel(alimony, employee),
    snapshotAfter: { beneficiaryName, amountCents },
  });
  return alimonyId;
}

/**
 * Atualiza o cadastro. Beneficiário, forma de pagamento e chave PIX também
 * vão para as linhas de folhas em rascunho ainda não pagas; o valor padrão só
 * vale para meses novos (cada mês tem o seu valor).
 */
export async function updateAlimony(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    alimonyId: Id<"employeeAlimonies">;
    beneficiaryName?: string;
    amountCents?: number;
    paymentMethod?: PaymentMethod;
    pixKey?: string | null;
    notes?: string | null;
  }
) {
  const alimony = await requireAlimony(ctx, input.alimonyId);
  if (alimony.archivedAt) {
    throw new Error("Pensão encerrada — não pode ser editada");
  }
  const updates: Partial<Doc<"employeeAlimonies">> = {
    updatedAt: Date.now(),
    updatedByUserId: user._id,
  };
  if (input.beneficiaryName !== undefined) {
    const name = input.beneficiaryName.trim();
    if (!name) throw new Error("Informe o nome do beneficiário");
    updates.beneficiaryName = name;
  }
  if (input.amountCents !== undefined) {
    updates.amountCents = assertNonNegativeCents(
      input.amountCents,
      "Valor da pensão"
    );
  }
  if (input.paymentMethod !== undefined) {
    updates.paymentMethod = input.paymentMethod;
  }
  if (input.pixKey !== undefined) {
    updates.pixKey = input.pixKey?.trim() || undefined;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes?.trim() || undefined;
  }
  await ctx.db.patch("employeeAlimonies", alimony._id, updates);

  const linePatch: Partial<Doc<"payrollAlimonyLines">> = {};
  if (updates.beneficiaryName !== undefined) {
    linePatch.beneficiaryName = updates.beneficiaryName;
  }
  if (updates.paymentMethod !== undefined) {
    linePatch.paymentMethod = updates.paymentMethod;
  }
  if (input.pixKey !== undefined) linePatch.pixKey = updates.pixKey;
  if (Object.keys(linePatch).length > 0) {
    const lines = await ctx.db
      .query("payrollAlimonyLines")
      .withIndex("by_alimony", (q) => q.eq("alimonyId", alimony._id))
      .collect();
    for (const line of lines) {
      if (line.paid) continue;
      const run = await ctx.db.get("payrollRuns", line.runId);
      if (!run || run.status !== "draft") continue;
      await ctx.db.patch("payrollAlimonyLines", line._id, {
        ...linePatch,
        updatedAt: Date.now(),
      });
    }
  }

  const employee = await ctx.db.get("employees", alimony.employeeId);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "employeeAlimonies",
    recordId: alimony._id,
    entityLabel: alimonyLabel(alimony, employee),
    snapshotBefore: toAlimonyRow(alimony),
    snapshotAfter: { ...toAlimonyRow(alimony), ...updates },
  });
}

/**
 * Encerra a pensão: sai das folhas em rascunho onde ainda não foi paga e
 * deixa de entrar nos meses seguintes. Meses fechados ficam como estão.
 */
export async function archiveAlimony(
  ctx: MutationCtx,
  user: Doc<"users">,
  alimonyId: Id<"employeeAlimonies">
) {
  const alimony = await requireAlimony(ctx, alimonyId);
  if (alimony.archivedAt) return;
  const now = Date.now();
  await ctx.db.patch("employeeAlimonies", alimony._id, {
    archivedAt: now,
    archivedByUserId: user._id,
    updatedAt: now,
    updatedByUserId: user._id,
  });
  const lines = await ctx.db
    .query("payrollAlimonyLines")
    .withIndex("by_alimony", (q) => q.eq("alimonyId", alimony._id))
    .collect();
  for (const line of lines) {
    if (line.paid) continue;
    const run = await ctx.db.get("payrollRuns", line.runId);
    if (!run || run.status !== "draft") continue;
    await ctx.db.delete("payrollAlimonyLines", line._id);
  }
  const employee = await ctx.db.get("employees", alimony.employeeId);
  await logAudit(ctx, user, {
    action: "archive",
    tableName: "employeeAlimonies",
    recordId: alimony._id,
    entityLabel: alimonyLabel(alimony, employee),
    details: "Pensão encerrada",
  });
}

// --- Linhas mensais na folha ---

/** Inclui na folha uma pensão ativa que ficou de fora (ex.: funcionário adicionado depois). */
export async function addAlimonyToRun(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { runId: Id<"payrollRuns">; alimonyId: Id<"employeeAlimonies"> }
): Promise<Id<"payrollAlimonyLines">> {
  const run = await requireRun(ctx, input.runId);
  assertDraft(run);
  const alimony = await requireAlimony(ctx, input.alimonyId);
  if (alimony.archivedAt) throw new Error("Pensão encerrada");
  const employee = await ctx.db.get("employees", alimony.employeeId);
  if (!employee) throw new Error("Funcionário não encontrado");
  if (await findAlimonyLine(ctx, run._id, alimony._id)) {
    throw new Error("Esta pensão já está nesta folha");
  }
  const lineId = await insertAlimonyLine(ctx, run, alimony, employee);
  await logAudit(ctx, user, {
    action: "create",
    tableName: "payrollAlimonyLines",
    recordId: lineId,
    entityLabel: alimonyLabel(alimony, employee),
  });
  return lineId;
}

export async function updateAlimonyLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    lineId: Id<"payrollAlimonyLines">;
    amountCents?: number;
    notes?: string | null;
  }
) {
  const line = await requireAlimonyLine(ctx, input.lineId);
  await requireDraftRunForLine(ctx, line);
  const updates: Partial<Doc<"payrollAlimonyLines">> = {
    updatedAt: Date.now(),
  };
  if (input.amountCents !== undefined) {
    updates.amountCents = assertNonNegativeCents(
      input.amountCents,
      "Valor da pensão"
    );
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes?.trim() || undefined;
  }
  await ctx.db.patch("payrollAlimonyLines", line._id, updates);
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollAlimonyLines",
    recordId: line._id,
    entityLabel: alimonyLabel(line, { name: line.employeeName }),
    snapshotBefore: { amountCents: line.amountCents, notes: line.notes },
    snapshotAfter: {
      amountCents: updates.amountCents ?? line.amountCents,
      notes: input.notes === undefined ? line.notes : updates.notes,
    },
  });
}

export async function setAlimonyLinePaid(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { lineId: Id<"payrollAlimonyLines">; paid: boolean }
) {
  const line = await requireAlimonyLine(ctx, input.lineId);
  await requireDraftRunForLine(ctx, line);
  await ctx.db.patch("payrollAlimonyLines", line._id, {
    paid: input.paid,
    paidAt: input.paid ? Date.now() : undefined,
    paidByUserId: input.paid ? user._id : undefined,
    updatedAt: Date.now(),
  });
  await logAudit(ctx, user, {
    action: "update",
    tableName: "payrollAlimonyLines",
    recordId: line._id,
    entityLabel: alimonyLabel(line, { name: line.employeeName }),
    details: input.paid ? "Pagamento confirmado" : "Pagamento desfeito",
  });
}

/** Tira a pensão só deste mês; o cadastro continua para os próximos. */
export async function removeAlimonyLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  lineId: Id<"payrollAlimonyLines">
) {
  const line = await ctx.db.get("payrollAlimonyLines", lineId);
  if (!line) return;
  await requireDraftRunForLine(ctx, line);
  await ctx.db.delete("payrollAlimonyLines", line._id);
  await logAudit(ctx, user, {
    action: "delete",
    tableName: "payrollAlimonyLines",
    recordId: line._id,
    entityLabel: alimonyLabel(line, { name: line.employeeName }),
  });
}
