import type { Tone } from "@/lib/theme";

export type EmployeeStatus = "active" | "on_leave" | "terminated";
export type PaymentMethod = "pix" | "tbi" | "other";

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; tone: Tone }> = {
  active: { label: "Ativo", tone: "success" },
  on_leave: { label: "Afastado", tone: "warning" },
  terminated: { label: "Desligado", tone: "neutral" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  pix: "PIX",
  tbi: "TBI",
  other: "Outro",
};

export const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;
export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"] as const;

export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]}/${String(year).slice(-2)}`;
}

export const PUNCH_KIND: Record<string, string> = {
  entrada: "Entrada",
  almoco_saida: "Saída almoço",
  almoco_retorno: "Retorno almoço",
  saida: "Saída",
};

export const LIVE_STATUS: Record<string, { label: string; tone: Tone }> = {
  on_site: { label: "Na obra", tone: "success" },
  lunch: { label: "Almoço", tone: "info" },
  left: { label: "Saiu", tone: "neutral" },
  absent: { label: "Ausente", tone: "warning" },
};
