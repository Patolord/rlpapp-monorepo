import { v } from "convex/values";
import { folhaMutation, folhaQuery } from "./lib/rbac";
import {
  alimonyLineValidator,
  alimonyValidator,
  listEmployeeAlimonies,
  listRunAlimonyLines,
} from "./model/hr/alimonies";
import {
  addAlimonyToRun,
  archiveAlimony,
  createAlimony,
  removeAlimonyLine,
  setAlimonyLinePaid,
  updateAlimony,
  updateAlimonyLine,
} from "./model/hr/alimonyMutations";
import { employeePaymentMethod } from "./schema/hr";

/**
 * Pensão alimentícia: cadastro por funcionário (beneficiário, valor padrão,
 * forma de pagamento) e as linhas mensais na folha. A pensão é paga direto ao
 * beneficiário, em linha própria, e nunca altera a linha do funcionário.
 */

export const listForEmployee = folhaQuery({
  args: {
    employeeId: v.id("employees"),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(alimonyValidator),
  handler: async (ctx, args) => {
    return await listEmployeeAlimonies(ctx, args);
  },
});

/**
 * Cadastra a pensão e já a inclui nas folhas em rascunho em que o funcionário
 * está, para o mês corrente não ficar sem a linha.
 */
export const create = folhaMutation({
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
    return await createAlimony(ctx, ctx.user, args);
  },
});

/**
 * Atualiza o cadastro. Beneficiário, forma de pagamento e chave PIX também
 * vão para as linhas de folhas em rascunho ainda não pagas; o valor padrão só
 * vale para meses novos (cada mês tem o seu valor).
 */
export const update = folhaMutation({
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
    await updateAlimony(ctx, ctx.user, args);
    return null;
  },
});

/**
 * Encerra a pensão: sai das folhas em rascunho onde ainda não foi paga e
 * deixa de entrar nos meses seguintes. Meses fechados ficam como estão.
 */
export const archive = folhaMutation({
  args: { alimonyId: v.id("employeeAlimonies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await archiveAlimony(ctx, ctx.user, args.alimonyId);
    return null;
  },
});

// --- Linhas mensais na folha ---

export const listLinesForRun = folhaQuery({
  args: { runId: v.id("payrollRuns") },
  returns: v.array(alimonyLineValidator),
  handler: async (ctx, args) => {
    return await listRunAlimonyLines(ctx, args.runId);
  },
});

/** Inclui na folha uma pensão ativa que ficou de fora (ex.: funcionário adicionado depois). */
export const addToRun = folhaMutation({
  args: {
    runId: v.id("payrollRuns"),
    alimonyId: v.id("employeeAlimonies"),
  },
  returns: v.id("payrollAlimonyLines"),
  handler: async (ctx, args) => {
    return await addAlimonyToRun(ctx, ctx.user, args);
  },
});

export const updateLine = folhaMutation({
  args: {
    lineId: v.id("payrollAlimonyLines"),
    amountCents: v.optional(v.number()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateAlimonyLine(ctx, ctx.user, args);
    return null;
  },
});

export const toggleLinePaid = folhaMutation({
  args: {
    lineId: v.id("payrollAlimonyLines"),
    paid: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setAlimonyLinePaid(ctx, ctx.user, args);
    return null;
  },
});

/** Tira a pensão só deste mês; o cadastro continua para os próximos. */
export const removeLine = folhaMutation({
  args: { lineId: v.id("payrollAlimonyLines") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeAlimonyLine(ctx, ctx.user, args.lineId);
    return null;
  },
});
