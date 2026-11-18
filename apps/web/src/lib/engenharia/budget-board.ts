/**
 * Regras de tela do quadro de orçamentos (Engenharia → Orçamentos): etapas,
 * estado da pasta na TRELLO, prazo e a posição de um card movido (a mesma
 * conta do backend, para o arrastar responder na hora).
 */

export type BudgetStage = "para_fazer" | "em_andamento" | "concluido" | "obsoleto";

export interface StageInfo {
  stage: BudgetStage;
  label: string;
  /** Etapa de histórico: coluna estreita e recolhida. */
  quiet: boolean;
}

export const BUDGET_STAGES: readonly StageInfo[] = [
  { stage: "para_fazer", label: "Para Fazer", quiet: false },
  { stage: "em_andamento", label: "Em Andamento", quiet: false },
  { stage: "concluido", label: "Concluído", quiet: true },
  { stage: "obsoleto", label: "Obsoletos", quiet: true },
];

export function stageLabel(stage: BudgetStage | "missing"): string {
  if (stage === "missing") return "fora da TRELLO";
  return BUDGET_STAGES.find((info) => info.stage === stage)!.label;
}

export interface CardFolder {
  itemId: string;
  name: string | null;
  webUrl: string | null;
  stage: BudgetStage | "missing" | null;
  checkedAt: number | null;
}

/**
 * - ok: a pasta está na etapa do card;
 * - mismatch: a pasta está em outra etapa (mover a pasta);
 * - missing: a pasta não foi achada na última conferência;
 * - unchecked: tem pasta, mas ainda não foi conferida;
 * - none: o card não tem pasta.
 */
export type FolderStatus = "ok" | "mismatch" | "missing" | "unchecked" | "none";

export function folderStatus(card: { stage: BudgetStage; folder: CardFolder | null }): FolderStatus {
  const folder = card.folder;
  if (!folder) return "none";
  if (folder.stage === null) return "unchecked";
  if (folder.stage === "missing") return "missing";
  return folder.stage === card.stage ? "ok" : "mismatch";
}

/** Data local de hoje, "AAAA-MM-DD". */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** late: prazo vencido; soon: vence em até 3 dias; ok: mais longe. */
export function dueState(dueDate: string, today: string): "late" | "soon" | "ok" {
  if (dueDate < today) return "late";
  const days = (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= 3 ? "soon" : "ok";
}

/** "2026-12-01" → "01/12". */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** Iniciais para o avatar do responsável ("Fernanda Lima" → "FL"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase();
}

interface Positioned {
  _id: string;
  stage: BudgetStage;
  position: number;
}

/**
 * Aplica um "mover card para `stage` na posição `index`" a uma lista de cards,
 * com a mesma conta de posição do backend (entre os vizinhos).
 */
export function applyMove<T extends Positioned>(
  cards: readonly T[],
  cardId: string,
  stage: BudgetStage,
  index: number
): T[] {
  const card = cards.find((candidate) => candidate._id === cardId);
  if (!card) return [...cards];
  const column = cards
    .filter((other) => other.stage === stage && other._id !== cardId)
    .sort((a, b) => a.position - b.position);
  const at = Math.min(Math.max(index, 0), column.length);
  const before = column[at - 1];
  const after = column[at];
  const position =
    before && after
      ? (before.position + after.position) / 2
      : before
        ? before.position + 1
        : after
          ? after.position - 1
          : 0;
  return cards.map((other) => (other._id === cardId ? { ...other, stage, position } : other));
}
