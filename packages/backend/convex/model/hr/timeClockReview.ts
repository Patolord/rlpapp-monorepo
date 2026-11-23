/**
 * Ponto: horários esquecidos e tratamento do RH.
 *
 * - A pessoa informa no app o horário que esqueceu de marcar (junto com a
 *   marcação, quando o app pergunta, ou depois, em "Minhas marcações"). O
 *   pedido fica pendente até o RH aprovar ou recusar.
 * - O RH inclui um horário, muda o papel de uma marcação ou a desconsidera,
 *   sempre com motivo. A marcação registrada nunca muda nem some (Portaria
 *   MTP 671/2021): o tratamento fica ao lado dela, com histórico e auditoria.
 */

import {
  brtMinuteOfDay,
  formatMinute,
  PUNCH_ROLE_LABEL,
  type DeclarableRole,
} from "@rlpapp/shared/rh/pontoDay";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { logAudit } from "../../lib/audit";
import { assertDateKey, toBrtDateKey } from "./timeClock";
import { listUserDayPunches, recomputeDaySummary } from "./timeClockDb";
import {
  isOpenDate,
  listDayRequests,
  loadUserDay,
  toDayDetail,
} from "./timeClockDay";
import { notFound, ruleViolation } from "../../lib/domainErrors";

/** Até quantos dias para trás a pessoa pode informar um horário esquecido. */
export const MISSED_REQUEST_MAX_AGE_DAYS = 45;
const MAX_TEXT = 500;

function cleanText(value: string | undefined, label: string, required: boolean): string | undefined {
  const text = value?.trim() ?? "";
  if (required && !text) throw ruleViolation(`Informe o ${label}`);
  if (text.length > MAX_TEXT) throw ruleViolation(`${label} muito longo`);
  return text || undefined;
}

function assertMinute(minute: number): void {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 24 * 60) {
    throw ruleViolation("Horário inválido");
  }
}

function shiftDate(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Horário esquecido (pessoa)
// ---------------------------------------------------------------------------

/**
 * Grava (ou atualiza) o horário esquecido de uma posição do dia. Um pedido
 * pendente para a mesma posição é atualizado (nova revisão); um já aprovado
 * fica como está. A resposta a uma pergunta do app que chega atrasada (fila
 * offline) nunca substitui o que a pessoa corrigiu à mão.
 */
export async function upsertMissedRequest(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    date: string;
    role: DeclarableRole;
    minute: number;
    origin: "app_prompt" | "app_manual";
    clientPunchId?: string;
    note?: string;
  }
): Promise<Id<"clockPunchRequests">> {
  assertMinute(input.minute);
  const requests = await listDayRequests(ctx, user._id, input.date);
  const approved = requests.find((r) => r.role === input.role && r.status === "approved");
  if (approved) return approved._id;
  const pending = requests.find((r) => r.role === input.role && r.status === "pending");
  if (pending) {
    if (input.origin === "app_prompt" && pending.origin === "app_manual") return pending._id;
    await ctx.db.patch("clockPunchRequests", pending._id, {
      minute: input.minute,
      note: input.note ?? pending.note,
      origin: input.origin,
      revision: (pending.revision ?? 0) + 1,
    });
    return pending._id;
  }
  return await ctx.db.insert("clockPunchRequests", {
    userId: user._id,
    personName: user.name,
    date: input.date,
    role: input.role,
    minute: input.minute,
    origin: input.origin,
    status: "pending",
    note: input.note,
    clientPunchId: input.clientPunchId,
  });
}

/** A pessoa informa, pelo app, um horário que esqueceu de marcar. */
export async function requestMissedPunch(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: { date: string; role: DeclarableRole; minute: number; note?: string }
): Promise<Id<"clockPunchRequests">> {
  assertDateKey(input.date);
  assertMinute(input.minute);
  const now = Date.now();
  const today = toBrtDateKey(now);
  if (input.date > today || (input.date === today && input.minute > brtMinuteOfDay(now))) {
    throw ruleViolation("O horário informado ainda não aconteceu");
  }
  if (input.date < shiftDate(today, -MISSED_REQUEST_MAX_AGE_DAYS)) {
    throw ruleViolation(`Só dá para informar até ${MISSED_REQUEST_MAX_AGE_DAYS} dias atrás. Fale com o RH.`);
  }
  const id = await upsertMissedRequest(ctx, user, {
    date: input.date,
    role: input.role,
    minute: input.minute,
    origin: "app_manual",
    note: cleanText(input.note, "comentário", false),
  });
  await recomputeDaySummary(ctx, user._id, input.date);
  return id;
}

/** A pessoa desiste de um horário informado que o RH ainda não viu. */
export async function cancelMyRequest(
  ctx: MutationCtx,
  user: Doc<"users">,
  requestId: Id<"clockPunchRequests">
): Promise<void> {
  const request = await ctx.db.get("clockPunchRequests", requestId);
  if (!request || request.userId !== user._id) throw notFound("Pedido não encontrado");
  if (request.status !== "pending") throw ruleViolation("O RH já analisou este pedido");
  await ctx.db.patch("clockPunchRequests", request._id, { status: "canceled" });
  await recomputeDaySummary(ctx, user._id, request.date);
}

// ---------------------------------------------------------------------------
// Tratamento (RH)
// ---------------------------------------------------------------------------

function describeRequest(request: { role: DeclarableRole; minute: number; date: string }): string {
  return `${PUNCH_ROLE_LABEL[request.role]} às ${formatMinute(request.minute)} em ${request.date}`;
}

/**
 * RH aprova ou recusa um horário informado pela pessoa. `revision` é a que o
 * RH viu: se a pessoa mudou o horário depois, a decisão não vale.
 */
export async function reviewMissedRequest(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: { requestId: Id<"clockPunchRequests">; revision: number; approve: boolean; note?: string }
): Promise<void> {
  const request = await ctx.db.get("clockPunchRequests", input.requestId);
  if (!request) throw notFound("Pedido não encontrado");
  if (request.status !== "pending") throw ruleViolation("Este pedido já foi analisado");
  if ((request.revision ?? 0) !== input.revision) {
    throw ruleViolation("A pessoa mudou este horário. Confira de novo antes de decidir.");
  }
  const reviewNote = cleanText(input.note, "motivo", !input.approve);
  const status = input.approve ? ("approved" as const) : ("rejected" as const);
  await ctx.db.patch("clockPunchRequests", request._id, {
    status,
    reviewNote,
    reviewedByUserId: actor._id,
    reviewedAt: Date.now(),
  });
  await logAudit(ctx, actor, {
    action: "update",
    tableName: "clockPunchRequests",
    recordId: request._id,
    entityLabel: request.personName,
    details: `${input.approve ? "Horário aprovado" : "Horário recusado"}: ${describeRequest(request)}${reviewNote ? ` (${reviewNote})` : ""}`,
    snapshotBefore: { status: request.status },
    snapshotAfter: { status, reviewNote },
  });
  await recomputeDaySummary(ctx, request.userId, request.date);
}

/** RH inclui um horário que faltou (a pessoa não marcou nem informou). */
export async function includeMissedPunch(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: { userId: Id<"users">; date: string; role: DeclarableRole; minute: number; reason: string }
): Promise<Id<"clockPunchRequests">> {
  assertDateKey(input.date);
  assertMinute(input.minute);
  const reason = cleanText(input.reason, "motivo", true)!;
  const person = await ctx.db.get("users", input.userId);
  if (!person) throw notFound("Pessoa não encontrada");
  // Entrada e saída extras podem acontecer mais de uma vez no dia: cada
  // inclusão é um intervalo próprio. As quatro posições têm um horário só.
  const isExtraRole = input.role === "entrada_extra" || input.role === "saida_extra";
  const requests = isExtraRole ? [] : await listDayRequests(ctx, person._id, input.date);
  const same = requests.find(
    (r) => r.role === input.role && (r.status === "pending" || r.status === "approved")
  );
  const review = { status: "approved" as const, reviewedByUserId: actor._id, reviewedAt: Date.now() };
  let id: Id<"clockPunchRequests">;
  if (same) {
    await ctx.db.patch("clockPunchRequests", same._id, {
      ...review,
      minute: input.minute,
      reviewNote: reason,
      revision: (same.revision ?? 0) + 1,
    });
    id = same._id;
  } else {
    id = await ctx.db.insert("clockPunchRequests", {
      userId: person._id,
      personName: person.name,
      date: input.date,
      role: input.role,
      minute: input.minute,
      origin: "rh",
      note: reason,
      reviewNote: reason,
      ...review,
    });
  }
  await logAudit(ctx, actor, {
    action: same ? "update" : "create",
    tableName: "clockPunchRequests",
    recordId: id,
    entityLabel: person.name,
    details: `Horário incluído pelo RH: ${describeRequest(input)} (${reason})`,
    snapshotBefore: same ? { status: same.status, minute: same.minute } : undefined,
    snapshotAfter: { status: "approved", minute: input.minute },
  });
  await recomputeDaySummary(ctx, person._id, input.date);
  return id;
}

/**
 * RH trata uma marcação: muda o papel, desconsidera ou volta à leitura
 * automática. A marcação em si não muda.
 */
export async function adjustPunch(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: {
    punchId: Id<"clockPunches">;
    action: "set_role" | "set_aside" | "clear";
    role?: DeclarableRole;
    reason: string;
  }
): Promise<void> {
  const punch = await ctx.db.get("clockPunches", input.punchId);
  if (!punch) throw notFound("Marcação não encontrada");
  if (input.action === "set_role" && !input.role) throw ruleViolation("Escolha o tipo da marcação");
  const reason = cleanText(input.reason, "motivo", true)!;
  const adjustmentId = await ctx.db.insert("clockPunchAdjustments", {
    punchId: punch._id,
    userId: punch.userId,
    date: punch.date,
    action: input.action,
    role: input.action === "set_role" ? input.role : undefined,
    reason,
    byUserId: actor._id,
    byName: actor.name,
  });
  const what =
    input.action === "set_aside"
      ? "desconsiderada"
      : input.action === "clear"
        ? "voltou à leitura automática"
        : `tratada como ${PUNCH_ROLE_LABEL[input.role!].toLowerCase()}`;
  await logAudit(ctx, actor, {
    action: "create",
    tableName: "clockPunchAdjustments",
    recordId: adjustmentId,
    entityLabel: punch.personName,
    details: `Marcação de ${punch.date} às ${punch.timeLabel} (NSR ${punch.nsr}) ${what}: ${reason}`,
  });
  await recomputeDaySummary(ctx, punch.userId, punch.date);
}

// ---------------------------------------------------------------------------
// Painel do RH
// ---------------------------------------------------------------------------

/** Horários informados esperando o RH, mais recentes primeiro. */
export async function listPendingRequests(ctx: QueryCtx) {
  const requests = await ctx.db
    .query("clockPunchRequests")
    .withIndex("by_status_and_date", (q) => q.eq("status", "pending"))
    .order("desc")
    .take(200);
  return requests.map((request) => ({
    _id: request._id,
    userId: request.userId,
    personName: request.personName,
    date: request.date,
    role: request.role,
    minute: request.minute,
    timeLabel: formatMinute(request.minute),
    origin: request.origin,
    note: request.note ?? null,
    revision: request.revision ?? 0,
    createdAt: request._creationTime,
  }));
}

/** O dia de uma pessoa lido, com o histórico de tratamento, para o RH. */
export async function getPersonDay(
  ctx: QueryCtx,
  input: { userId: Id<"users">; date: string; today?: string }
) {
  assertDateKey(input.date);
  const person = await ctx.db.get("users", input.userId);
  const punches = await listUserDayPunches(ctx, input.userId, input.date);
  const open = isOpenDate(input.date, input.today);
  const loaded = await loadUserDay(ctx, { userId: input.userId, date: input.date, open, punches });
  const punchById = new Map(punches.map((punch) => [punch._id, punch]));
  return {
    personName: person?.name ?? punches[0]?.personName ?? "Pessoa removida",
    schedule: loaded.schedule,
    day: toDayDetail(loaded, input.date, open),
    adjustments: loaded.adjustments
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((adjustment) => ({
        _id: adjustment._id,
        punchId: adjustment.punchId,
        punchTimeLabel: punchById.get(adjustment.punchId)?.timeLabel ?? "--:--",
        action: adjustment.action,
        role: adjustment.role ?? null,
        reason: adjustment.reason,
        byName: adjustment.byName,
        at: adjustment._creationTime,
      })),
    requests: loaded.requests
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((request) => ({
        _id: request._id,
        role: request.role,
        minute: request.minute,
        timeLabel: formatMinute(request.minute),
        status: request.status,
        origin: request.origin,
        note: request.note ?? null,
        reviewNote: request.reviewNote ?? null,
        revision: request.revision ?? 0,
        createdAt: request._creationTime,
      })),
  };
}
