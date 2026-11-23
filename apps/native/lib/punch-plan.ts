/**
 * Ponto no app: o que o próximo toque em "Registrar" vai gravar e se o app
 * precisa perguntar algo antes (marcação esquecida, toque repetido, volta
 * depois da saída...). As regras são as mesmas do servidor
 * (`@rlpapp/shared/rh/pontoDay`); aqui só juntamos o que o aparelho sabe:
 * as marcações de hoje (do servidor ou do cache), a fila offline e a jornada.
 */
import type { api } from "@rlpapp/backend/convex/_generated/api";
import {
  brtMinuteOfDay,
  classifyDay,
  DECLARABLE_ROLES,
  DEFAULT_WORK_SCHEDULE,
  planNextPunch,
  type ClassifiedDay,
  type DayItemInput,
  type DeclarableRole,
  type PunchPlan,
  type WorkSchedule,
} from "@rlpapp/shared/rh/pontoDay";
import type { FunctionReturnType } from "convex/server";

import { toBrtDateKey } from "@/lib/brt-date";
import type { PendingPunch } from "@/lib/punch-queue";

export type PunchContext = FunctionReturnType<typeof api.timeClockPunch.getContext>;

function isDeclarable(role: string | undefined): role is DeclarableRole {
  return (DECLARABLE_ROLES as readonly string[]).includes(role ?? "");
}

/** Jornada do contexto (o cache de uma versão antiga pode não ter). */
export function scheduleOf(context: PunchContext | undefined): WorkSchedule {
  return context?.schedule ?? DEFAULT_WORK_SCHEDULE;
}

/**
 * Itens do dia para a leitura no aparelho. As marcações já lidas pelo
 * servidor mantêm o papel (só a próxima é decidida aqui); as da fila offline
 * entram como chegaram.
 */
export function dayItems(
  context: PunchContext | undefined,
  pending: PendingPunch[],
  today: string
): DayItemInput[] {
  const items: DayItemInput[] = [];
  // Cache de outro dia: as marcações e os horários informados ficam de fora.
  const contextIsToday = context?.date === undefined || context.date === today;
  for (const punch of context?.punches ?? []) {
    if (toBrtDateKey(punch.punchedAt) !== today) continue;
    const minute = brtMinuteOfDay(punch.punchedAt);
    const base = { id: punch._id, minute, source: "punch" as const };
    if (punch.kind === "desconsiderada") items.push({ ...base, role: "desconsiderada", basis: "rh" });
    else if (isDeclarable(punch.kind)) items.push({ ...base, role: punch.kind, basis: punch.basis ?? "auto" });
    else items.push(base);
  }
  for (const request of contextIsToday ? (context?.requests ?? []) : []) {
    if (!isDeclarable(request.role)) continue;
    items.push({
      id: request._id,
      minute: request.minute,
      source: "request",
      role: request.role,
      basis: request.status === "approved" ? "approved" : "pending",
    });
  }
  for (const punch of pending) {
    if (toBrtDateKey(punch.capturedAt) !== today) continue;
    const minute = brtMinuteOfDay(punch.capturedAt);
    items.push(
      isDeclarable(punch.declaredRole)
        ? { id: punch.clientPunchId, minute, source: "punch", role: punch.declaredRole, basis: "employee" }
        : { id: punch.clientPunchId, minute, source: "punch" }
    );
    for (const [index, missed] of (punch.missed ?? []).entries()) {
      items.push({
        id: `${punch.clientPunchId}-missed-${index}`,
        minute: missed.minute,
        source: "request",
        role: missed.role,
        basis: "pending",
      });
    }
  }
  return items;
}

/** O que o toque em "Registrar" faria agora. */
export function planPunch(
  context: PunchContext | undefined,
  pending: PendingPunch[],
  now: number
): PunchPlan {
  return planNextPunch({
    items: dayItems(context, pending, toBrtDateKey(now)),
    schedule: scheduleOf(context),
    nowMinute: brtMinuteOfDay(now),
  });
}

type DayDetail = FunctionReturnType<typeof api.timeClockPunch.myDays>["days"][number];

/** Dia já lido pelo servidor (histórico) no formato da leitura compartilhada. */
export function fromDayDetail(detail: DayDetail): ClassifiedDay {
  const items = detail.items.map((item) => ({
    id: item.id,
    minute: item.minute,
    source: item.source,
    role: item.role,
    basis: item.basis,
  }));
  const slots: ClassifiedDay["slots"] = {
    entrada: null,
    almoco_saida: null,
    almoco_retorno: null,
    saida: null,
  };
  for (const item of items) {
    if (item.role === "entrada" || item.role === "almoco_saida" || item.role === "almoco_retorno" || item.role === "saida") {
      slots[item.role] = item;
    }
  }
  const counted = items.filter((item) => item.role !== "repetida" && item.role !== "desconsiderada");
  return {
    items,
    slots,
    issues: detail.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      slot: issue.slot ?? undefined,
      itemId: issue.itemId ?? undefined,
      message: issue.message,
    })),
    status: detail.status,
    last: counted[counted.length - 1] ?? null,
  };
}

/** O dia de hoje lido no aparelho (inclui a fila offline). */
export function readToday(
  context: PunchContext | undefined,
  pending: PendingPunch[],
  now: number
): ClassifiedDay {
  return classifyDay({
    items: dayItems(context, pending, toBrtDateKey(now)),
    schedule: scheduleOf(context),
    open: true,
  });
}
