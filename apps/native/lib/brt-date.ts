/**
 * Datas do ponto no relógio de Brasília (UTC-3, sem horário de verão),
 * iguais às do backend (`convex/lib/rh/rhid.ts`).
 */
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" do dia civil em Brasília para um instante. */
export function toBrtDateKey(ms: number): string {
  const wall = new Date(ms + BRT_OFFSET_MS);
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
}

/** "HH:MM" em Brasília. */
export function toBrtTimeLabel(ms: number): string {
  const wall = new Date(ms + BRT_OFFSET_MS);
  return `${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}`;
}

/** "HH:MM:SS" em Brasília (relógio da tela de marcação). */
export function toBrtClockLabel(ms: number): string {
  const wall = new Date(ms + BRT_OFFSET_MS);
  return `${pad2(wall.getUTCHours())}:${pad2(wall.getUTCMinutes())}:${pad2(wall.getUTCSeconds())}`;
}

/** "DD/MM/YYYY" a partir de "YYYY-MM-DD". */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}
