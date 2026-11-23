/**
 * Ponto: lembretes por push para quem bate ponto (avisos N18 e N19). O RH
 * define os horários em Configurações; o cron de 5 min (`convex/crons.ts`)
 * chama `sendDueTimeClockReminders`, que dispara cada lembrete uma vez por dia:
 *
 * - N18, entrada: quem bate ponto e ainda não marcou nada no dia.
 * - N19, saída: quem marcou alguma coisa e a última marcação não é a saída.
 *
 * Quando a pessoa marca o ponto, os lembretes ainda não lidos saem do sino
 * (`clearTimeClockReminders`), para não ficar um "marque a entrada" velho.
 */

import { parseTimeOfDay } from "@rlpapp/shared/rh/timeClockReminders";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { hasPermission } from "../../lib/rbac";
import { notify } from "../notifications/notify";
import { BRT_OFFSET_MS, toBrtDateKey, toBrtTimeLabel, type PunchKind } from "./timeClock";
import {
  getReminderSentOn,
  getSettings,
  listClockUsers,
  markReminderSent,
  type ReminderKind,
  type TimeClockSettings,
} from "./timeClockDb";

/** Passado o horário, o lembrete ainda sai por até 1 h (cron atrasado, deploy). */
export const REMINDER_GRACE_MINUTES = 60;
export const REMINDER_KINDS = { entrada: "N18", saida: "N19" } as const;
const MAX_DAYS_PER_DATE = 4000;

const LAST_KIND_LABEL: Record<PunchKind, string> = {
  entrada: "a entrada",
  almoco_saida: "a saída para o almoço",
  almoco_retorno: "a volta do almoço",
  saida: "a saída",
};

/** Data, minuto do dia e dia da semana em Brasília. */
export function brtClock(now: number): { date: string; minutes: number; weekday: number } {
  const wall = new Date(now + BRT_OFFSET_MS);
  return {
    date: toBrtDateKey(now),
    minutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
    weekday: wall.getUTCDay(),
  };
}

/** Lembretes que devem sair agora (regra pura, sem `ctx`). */
export function dueReminderKinds(
  settings: Pick<TimeClockSettings, "entryReminderTime" | "exitReminderTime" | "reminderWeekdays">,
  sentOn: Record<ReminderKind, string | null>,
  now: number
): ReminderKind[] {
  const clock = brtClock(now);
  if (!settings.reminderWeekdays.includes(clock.weekday)) return [];
  const due: ReminderKind[] = [];
  const times: [ReminderKind, string | null][] = [
    ["entrada", settings.entryReminderTime],
    ["saida", settings.exitReminderTime],
  ];
  for (const [kind, time] of times) {
    if (time === null || sentOn[kind] === clock.date) continue;
    const at = parseTimeOfDay(time);
    if (at === null) continue;
    if (clock.minutes >= at && clock.minutes < at + REMINDER_GRACE_MINUTES) due.push(kind);
  }
  return due;
}

/** Dispara os lembretes vencidos. Devolve quantas pessoas cada um avisou. */
export async function sendDueTimeClockReminders(
  ctx: MutationCtx,
  now: number
): Promise<Record<ReminderKind, number>> {
  const sent = { entrada: 0, saida: 0 };
  const settings = await getSettings(ctx);
  if (settings.entryReminderTime === null && settings.exitReminderTime === null) return sent;
  const due = dueReminderKinds(settings, await getReminderSentOn(ctx), now);
  if (due.length === 0) return sent;

  const { date } = brtClock(now);
  const days = await ctx.db
    .query("clockDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .take(MAX_DAYS_PER_DATE);

  for (const kind of due) {
    // Marca antes de avisar: se algo falhar, a mutation inteira volta atrás.
    await markReminderSent(ctx, kind, date);
    if (kind === "entrada") {
      const present = new Set(days.map((day) => day.userId));
      const missing = (await listClockUsers(ctx))
        .map((user) => user._id)
        .filter((userId) => !present.has(userId));
      sent.entrada = await notify(ctx, missing, {
        kind: REMINDER_KINDS.entrada,
        category: "ponto",
        title: "Marque a entrada",
        body: "Você ainda não marcou a entrada hoje. Toque para abrir o ponto.",
        target: "ponto",
      });
    } else {
      for (const day of days) {
        if (day.lastKind === "saida") continue;
        const user = await ctx.db.get("users", day.userId);
        if (!user || !hasPermission(user, "ponto.registrar")) continue;
        const time = toBrtTimeLabel(day.lastPunchAt);
        sent.saida += await notify(ctx, [day.userId], {
          kind: REMINDER_KINDS.saida,
          category: "ponto",
          title: "Marque a saída",
          body: `Sua última marcação hoje foi ${LAST_KIND_LABEL[day.lastKind]}, às ${time}. Não esqueça de marcar a saída.`,
          target: "ponto",
        });
      }
    }
  }
  return sent;
}

/** Tira do sino os lembretes do ponto ainda não lidos (a pessoa já marcou). */
export async function clearTimeClockReminders(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const kinds: string[] = Object.values(REMINDER_KINDS);
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_user_read", (q) => q.eq("userId", userId).eq("readAt", undefined))
    .take(100);
  const now = Date.now();
  for (const notification of unread) {
    if (kinds.includes(notification.kind)) {
      await ctx.db.patch("notifications", notification._id, { readAt: now });
    }
  }
}
