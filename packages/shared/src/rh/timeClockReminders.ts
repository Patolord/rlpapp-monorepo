/**
 * Lembretes do ponto: o RH define em Configurações um horário para lembrar
 * quem ainda não marcou a entrada e outro para quem deixou o dia aberto (sem
 * saída), e em quais dias da semana eles saem. Regras de validação usadas
 * pelo backend, pelo dashboard e pelo app.
 */

/** Dias da semana como `Date#getDay()`: 0 = domingo … 6 = sábado. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_SHORT_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

/** Segunda a sexta. */
export const DEFAULT_REMINDER_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * Faixa aceita para o horário do lembrete. O horário silencioso do push
 * (21h–6h) seguraria o aviso até a manhã seguinte, quando já não serve.
 */
export const REMINDER_EARLIEST = "06:00";
export const REMINDER_LATEST = "20:59";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" → minutos desde a meia-noite; `null` se o texto não for um horário. */
export function parseTimeOfDay(text: string): number | null {
  const match = TIME_RE.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Mensagem de erro do horário do lembrete, ou `null` se for válido. */
export function reminderTimeError(text: string): string | null {
  const minutes = parseTimeOfDay(text);
  if (minutes === null) return "Use o formato HH:MM";
  const earliest = parseTimeOfDay(REMINDER_EARLIEST)!;
  const latest = parseTimeOfDay(REMINDER_LATEST)!;
  if (minutes < earliest || minutes > latest) {
    return `Escolha um horário entre ${REMINDER_EARLIEST} e ${REMINDER_LATEST}`;
  }
  return null;
}

/** Dias válidos, sem repetição e em ordem (domingo primeiro). */
export function normalizeWeekdays(days: readonly number[]): number[] {
  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

/** "Seg a Sex", "Seg, Qua e Sex", "Todos os dias", "Nenhum dia". */
export function weekdaysLabel(days: readonly number[]): string {
  const list = normalizeWeekdays(days);
  if (list.length === 0) return "Nenhum dia";
  if (list.length === 7) return "Todos os dias";
  const consecutive = list.every((day, index) => index === 0 || day === list[index - 1]! + 1);
  if (consecutive && list.length >= 3) {
    return `${WEEKDAY_SHORT_LABELS[list[0]!]} a ${WEEKDAY_SHORT_LABELS[list[list.length - 1]!]}`;
  }
  const labels = list.map((day) => WEEKDAY_SHORT_LABELS[day]!);
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}
