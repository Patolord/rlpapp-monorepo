import type { Tone } from "@/lib/theme";

/**
 * Como o cliente vê o equipamento (decisão 32): só Pendente, Instalando e
 * Operacional. Atenção e Erro aparecem como Instalando; "Pendente" é o item
 * planejado que ainda não tem equipamento instalado.
 */
export type ClientStatus = "pending" | "installing" | "operational";

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "neutral" },
  installing: { label: "Instalando", tone: "info" },
  operational: { label: "Operacional", tone: "success" },
};

export function clientStatusOf(item: { status: string; linkedEquipmentId: string | null; installedAt: number | null }): ClientStatus {
  if (item.status === "operational") return "operational";
  if (item.linkedEquipmentId === null && item.installedAt === null && item.status === "installing") return "pending";
  return "installing";
}

export const PROJECT_STATUS_CLIENT: Record<string, { label: string; tone: Tone }> = {
  planning: { label: "Planejamento", tone: "neutral" },
  in_progress: { label: "Em andamento", tone: "info" },
  completed: { label: "Concluída", tone: "success" },
  paused: { label: "Pausada", tone: "warning" },
};
