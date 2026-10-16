/** Helpers de apresentação do módulo de ponto (RHID). Horários sempre em Brasília. */

export const BRT_TIME_ZONE = "America/Sao_Paulo";

export type PunchKind = "entrada" | "almoco_saida" | "almoco_retorno" | "saida";

export const PUNCH_KIND_LABEL: Record<PunchKind, string> = {
  entrada: "Entrada",
  almoco_saida: "Saída almoço",
  almoco_retorno: "Retorno almoço",
  saida: "Saída",
};

export const PUNCH_KIND_ORDER: PunchKind[] = [
  "entrada",
  "almoco_saida",
  "almoco_retorno",
  "saida",
];

/** Cores por tipo (badge + mapa). */
export const PUNCH_KIND_COLOR: Record<PunchKind, string> = {
  entrada: "#16a34a",
  almoco_saida: "#f59e0b",
  almoco_retorno: "#2563eb",
  saida: "#dc2626",
};

export type LiveStatus = "on_site" | "lunch" | "left" | "absent";

export const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  on_site: "Na obra",
  lunch: "Em almoço",
  left: "Encerrou o dia",
  absent: "Sem marcação",
};

export const LIVE_STATUS_COLOR: Record<LiveStatus, string> = {
  on_site: "#16a34a",
  lunch: "#f59e0b",
  left: "#64748b",
  absent: "#cbd5e1",
};

export const LIVE_STATUS_BADGE_CLASS: Record<LiveStatus, string> = {
  on_site: "border-transparent bg-emerald-100 text-emerald-800",
  lunch: "border-transparent bg-amber-100 text-amber-800",
  left: "border-transparent bg-slate-200 text-slate-700",
  absent: "text-muted-foreground",
};

/** Duração curta ("5 min", "3 h 20"). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRT_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** "AAAA-MM-DD" de hoje em Brasília. */
export function todayDateKey(now: Date = new Date()): string {
  return dateKeyFormatter.format(now);
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Soma dias a uma chave de data (sem fuso: aritmética em UTC). */
export function shiftDateKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return timeFormatter.format(new Date(ms));
}

export function formatDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return dateTimeFormatter.format(new Date(ms));
}

export function formatDateKeyLong(dateKey: string): string {
  const label = longDateFormatter.format(new Date(`${dateKey}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDateKeyShort(dateKey: string): string {
  return shortDateFormatter.format(new Date(`${dateKey}T00:00:00Z`)).replace(".", "");
}

/** Tempo relativo curto ("há 5 min", "há 3 h", "há 2 d"). */
export function formatRelative(ms: number | null | undefined, now = Date.now()): string {
  if (ms === null || ms === undefined) return "nunca";
  const diff = Math.max(0, now - ms);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Monta e baixa um CSV (separador ";" para abrir direto no Excel pt-BR). */
export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = rows.map((row) => row.map(escape).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
