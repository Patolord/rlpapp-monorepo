import { v } from "convex/values";
import { hrMutation, hrQuery } from "./lib/rbac";
import { logAudit } from "./lib/audit";
import { assertNonNegativeCents } from "./lib/rh/payroll";
import {
  alimonyLabel,
  alimonyLineValidator,
  alimonyValidator,
  findAlimonyLine,
  insertAlimonyLine,
  toAlimonyLineRow,
  toAlimonyRow,
} from "./model/rh/alimonies";
import { employeePaymentMethod } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Pensão alimentícia: cadastro por funcionário (beneficiário, valor padrão,
 * forma de pagamento) e as linhas mensais na folha. A pensão é paga direto ao
 * beneficiário, em linha própria, e nunca altera a linha do funcionário.
 */

async function requireAlimony(
  ctx: MutationCtx,
  alimonyId: Id<"employeeAlimonies">
) {
  const alimony = await ctx.db.get("employeeAlimonies", alimonyId);
  if (!alimony) throw new Error("Pensão não encontrada");
  return alimony;
}

async function requireDraftRunForLine(
  ctx: MutationCtx,
  line: Doc<"payrollAlimonyLines">
) {
  const run = await ctx.db.get("payrollRuns", line.runId);
  if (!run) throw new Error("Folha não encontrada");
  if (run.status === "closed") {
    throw new Error("Folha fechada — reabra para editar");
  }
  return run;
}

async function listDraftRuns(ctx: MutationCtx) {
  const runs = await ctx.db.query("payrollRuns").collect();
  return runs.filter((run) => run.status === "draft");
}

export const listForEmployee = hrQuery({
  args: {
    employeeId: v.id("employees"),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(alimonyValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("employeeAlimonies")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();
    return rows
      .filter((row) => args.includeArchived || !row.archivedAt)
      .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, "pt-BR"))
      .map(toAlimonyRow);
  },
});

/**
 * Cadastra a pensão e já a inclui nas folhas em rascunho em que o funcionário
 * está, para o mês corrente não ficar sem a linha.
 */
export const create = hrMutation({
  args: {
    employeeId: v.id("employees"),
    beneficiaryName: v.string(),
    amountCents: v.number(),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id("employeeAlimonies"),
  handler: async (ctx, args) => {
    const employee = await ctx.db.get("employees", args.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    const beneficiaryName = args.beneficiaryName.trim();
    if (!beneficiaryName) throw new Error("Informe o nome do beneficiário");
    const amountCents = assertNonNegativeCents(args.amountCents, "Valor da pensão");

    const now = Date.now();
    const alimonyId = await ctx.db.insert("employeeAlimonies", {
      employeeId: employee._id,
      beneficiaryName,
      amountCents,
      paymentMethod: args.paymentMethod ?? "pix",
      pixKey: args.pixKey?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByUserId: ctx.user._id,
      updatedByUserId: ctx.user._id,
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

    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "employeeAlimonies",
      recordId: alimonyId,
      entityLabel: alimonyLabel(alimony, employee),
      snapshotAfter: { beneficiaryName, amountCents },
    });
    return alimonyId;
  },
});

/**
 * Atualiza o cadastro. Beneficiário, forma de pagamento e chave PIX também
 * vão para as linhas de folhas em rascunho ainda não pagas; o valor padrão só
 * vale para meses novos (cada mês tem o seu valor).
 */
export const update = hrMutation({
  args: {
    alimonyId: v.id("employeeAlimonies"),
    beneficiaryName: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    paymentMethod: v.optional(employeePaymentMethod),
    pixKey: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const alimony = await requireAlimony(ctx, args.alimonyId);
    if (alimony.archivedAt) {
      throw new Error("Pensão encerrada — não pode ser editada");
    }
    const updates: Partial<Doc<"employeeAlimonies">> = {
      updatedAt: Date.now(),
      updatedByUserId: ctx.user._id,
    };
    if (args.beneficiaryName !== undefined) {
      const name = args.beneficiaryName.trim();
      if (!name) throw new Error("Informe o nome do beneficiário");
      updates.beneficiaryName = name;
    }
    if (args.amountCents !== undefined) {
      updates.amountCents = assertNonNegativeCents(
        args.amountCents,
        "Valor da pensão"
      );
    }
    if (args.paymentMethod !== undefined) {
      updates.paymentMethod = args.paymentMethod;
    }
    if (args.pixKey !== undefined) {
      updates.pixKey = args.pixKey?.trim() || undefined;
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes?.trim() || undefined;
    }
    await ctx.db.patch("employeeAlimonies", alimony._id, updates);

    const linePatch: Partial<Doc<"payrollAlimonyLines">> = {};
    if (updates.beneficiaryName !== undefined) {
      linePatch.beneficiaryName = updates.beneficiaryName;
    }
    if (updates.paymentMethod !== undefined) {
      linePatch.paymentMethod = updates.paymentMethod;
    }
    if (args.pixKey !== undefined) linePatch.pixKey = updates.pixKey;
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
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "employeeAlimonies",
      recordId: alimony._id,
      entityLabel: alimonyLabel(alimony, employee),
      snapshotBefore: toAlimonyRow(alimony),
      snapshotAfter: { ...toAlimonyRow(alimony), ...updates },
    });
    return null;
  },
});

/**
 * Encerra a pensão: sai das folhas em rascunho onde ainda não foi paga e
 * deixa de entrar nos meses seguintes. Meses fechados ficam como estão.
 */
export const archive = hrMutation({
  args: { alimonyId: v.id("employeeAlimonies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const alimony = await requireAlimony(ctx, args.alimonyId);
    if (alimony.archivedAt) return null;
    const now = Date.now();
    await ctx.db.patch("employeeAlimonies", alimony._id, {
      archivedAt: now,
      archivedByUserId: ctx.user._id,
      updatedAt: now,
      updatedByUserId: ctx.user._id,
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
    await logAudit(ctx, ctx.user, {
      action: "archive",
      tableName: "employeeAlimonies",
      recordId: alimony._id,
      entityLabel: alimonyLabel(alimony, employee),
      details: "Pensão encerrada",
    });
    return null;
  },
});

// --- Linhas mensais na folha ---

export const listLinesForRun = hrQuery({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(alimonyLineValidator),
  handler: async (ctx, args) => {
    const lines = await ctx.db
      .query("payrollAlimonyLines")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    return lines
      .sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName, "pt-BR"))
      .map(toAlimonyLineRow);
  },
});

/** Inclui na folha uma pensão ativa que ficou de fora (ex.: funcionário adicionado depois). */
export const addToRun = hrMutation({
  args: {
    runId: v.id("payrollRuns"),
    alimonyId: v.id("employeeAlimonies"),
  },
  returns: v.id("payrollAlimonyLines"),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("payrollRuns", args.runId);
    if (!run) throw new Error("Folha não encontrada");
    if (run.status === "closed") {
      throw new Error("Folha fechada — reabra para editar");
    }
    const alimony = await requireAlimony(ctx, args.alimonyId);
    if (alimony.archivedAt) throw new Error("Pensão encerrada");
    const employee = await ctx.db.get("employees", alimony.employeeId);
    if (!employee) throw new Error("Funcionário não encontrado");
    if (await findAlimonyLine(ctx, run._id, alimony._id)) {
      throw new Error("Esta pensão já está nesta folha");
    }
    const lineId = await insertAlimonyLine(ctx, run, alimony, employee);
    await logAudit(ctx, ctx.user, {
      action: "create",
      tableName: "payrollAlimonyLines",
      recordId: lineId,
      entityLabel: alimonyLabel(alimony, employee),
    });
    return lineId;
  },
});

export const updateLine = hrMutation({
  args: {
    lineId: v.id("payrollAlimonyLines"),
    amountCents: v.optional(v.number()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get("payrollAlimonyLines", args.lineId);
    if (!line) throw new Error("Linha não encontrada");
    await requireDraftRunForLine(ctx, line);
    const updates: Partial<Doc<"payrollAlimonyLines">> = {
      updatedAt: Date.now(),
    };
    if (args.amountCents !== undefined) {
      updates.amountCents = assertNonNegativeCents(
        args.amountCents,
        "Valor da pensão"
      );
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes?.trim() || undefined;
    }
    await ctx.db.patch("payrollAlimonyLines", line._id, updates);
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollAlimonyLines",
      recordId: line._id,
      entityLabel: alimonyLabel(line, { name: line.employeeName }),
      snapshotBefore: { amountCents: line.amountCents, notes: line.notes },
      snapshotAfter: {
        amountCents: updates.amountCents ?? line.amountCents,
        notes: args.notes === undefined ? line.notes : updates.notes,
      },
    });
    return null;
  },
});

export const toggleLinePaid = hrMutation({
  args: {
    lineId: v.id("payrollAlimonyLines"),
    paid: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get("payrollAlimonyLines", args.lineId);
    if (!line) throw new Error("Linha não encontrada");
    await requireDraftRunForLine(ctx, line);
    await ctx.db.patch("payrollAlimonyLines", line._id, {
      paid: args.paid,
      paidAt: args.paid ? Date.now() : undefined,
      paidByUserId: args.paid ? ctx.user._id : undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, ctx.user, {
      action: "update",
      tableName: "payrollAlimonyLines",
      recordId: line._id,
      entityLabel: alimonyLabel(line, { name: line.employeeName }),
      details: args.paid ? "Pagamento confirmado" : "Pagamento desfeito",
    });
    return null;
  },
});

/** Tira a pensão só deste mês; o cadastro continua para os próximos. */
export const removeLine = hrMutation({
  args: { lineId: v.id("payrollAlimonyLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const line = await ctx.db.get("payrollAlimonyLines", args.lineId);
    if (!line) return null;
    await requireDraftRunForLine(ctx, line);
    await ctx.db.delete("payrollAlimonyLines", line._id);
    await logAudit(ctx, ctx.user, {
      action: "delete",
      tableName: "payrollAlimonyLines",
      recordId: line._id,
      entityLabel: alimonyLabel(line, { name: line.employeeName }),
    });
    return null;
  },
});
