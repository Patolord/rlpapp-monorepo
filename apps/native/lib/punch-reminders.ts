/**
 * Lembretes do ponto no próprio aparelho (notificações locais): depois de
 * cada marcação, o app agenda o próximo lembrete pelo que falta no dia
 * (volta do almoço, almoço, saída) e cancela os anteriores. Funcionam sem
 * internet. Não pede permissão: usa a que o app já tem para os avisos.
 */
import {
  brtMinuteOfDay,
  type ClassifiedDay,
  type WorkSchedule,
} from "@rlpapp/shared/rh/pontoDay";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const PREFIX = "ponto-lembrete-";
/** Folga depois do horário previsto antes de lembrar. */
const GRACE_MINUTES = 20;

/** Marca a notificação como lembrete do ponto (abre a tela de marcação). */
export const PUNCH_REMINDER_DATA = { localPunchReminder: "1" } as const;

export function isPunchReminder(data: Record<string, unknown> | undefined | null): boolean {
  return data?.localPunchReminder === "1";
}

type Reminder = { id: string; minute: number; title: string; body: string };

/** Lembretes que fazem sentido agora, pelo dia lido e pela jornada. */
export function remindersFor(day: ClassifiedDay, schedule: WorkSchedule, nowMinute: number): Reminder[] {
  const { slots, status } = day;
  if (status === "absent" || status === "left") return [];
  const reminders: Reminder[] = [];
  if (status === "lunch" && slots.almoco_saida) {
    reminders.push({
      id: "volta",
      minute: slots.almoco_saida.minute + schedule.lunchMinutes + GRACE_MINUTES,
      title: "Voltou do almoço?",
      body: "Toque para registrar a volta.",
    });
  }
  if (!slots.almoco_saida && !slots.almoco_retorno) {
    reminders.push({
      id: "almoco",
      minute: schedule.lunchWindowEndMinute,
      title: "Registrou o almoço?",
      body: "Se já almoçou, toque e informe o horário.",
    });
  }
  if (!slots.saida) {
    reminders.push({
      id: "saida",
      minute: schedule.endMinute + GRACE_MINUTES,
      title: "Não esqueça a saída",
      body: "Toque para registrar a saída.",
    });
  }
  return reminders.filter((reminder) => reminder.minute > nowMinute && reminder.minute < 24 * 60);
}

/** Troca os lembretes agendados pelos do dia atual. Falhas são ignoradas. */
export async function syncPunchReminders(
  day: ClassifiedDay,
  schedule: WorkSchedule,
  now: number = Date.now()
): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => item.identifier.startsWith(PREFIX))
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
    );
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    const nowMinute = brtMinuteOfDay(now);
    for (const reminder of remindersFor(day, schedule, nowMinute)) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${reminder.id}`,
        content: { title: reminder.title, body: reminder.body, data: { ...PUNCH_REMINDER_DATA } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(now + (reminder.minute - nowMinute) * 60_000),
          channelId: "ponto",
        },
      });
    }
  } catch (error) {
    console.warn("Não foi possível agendar os lembretes do ponto", error);
  }
}
