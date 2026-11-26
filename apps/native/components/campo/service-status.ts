import type { Tone } from "@/lib/theme";

/** Situação de um serviço (disciplina + local): a da última etapa registrada. */
export type ServiceStatus = "todo" | "waiting" | "concluded";

export const SERVICE_STATUS: Record<ServiceStatus, { label: string; tone: Tone }> = {
  todo: { label: "A fazer", tone: "neutral" },
  waiting: { label: "Em andamento", tone: "info" },
  concluded: { label: "Concluído", tone: "success" },
};

/** Disciplina na lista da obra: sem etapa ainda ou já com trabalho registrado. */
export function disciplineStatus(stageCount: number): { label: string; tone: Tone } {
  return stageCount === 0 ? SERVICE_STATUS.todo : SERVICE_STATUS.waiting;
}

/** Nome do local na tela; a etapa sem local vale para a disciplina inteira. */
export function serviceLocationLabel(location: string | null): string {
  return location ?? "Geral";
}
