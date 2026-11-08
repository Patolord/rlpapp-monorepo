import type { Tone } from "@/lib/theme";

export type ProjectStatus = "planning" | "in_progress" | "completed" | "paused" | "archived";

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planejamento", tone: "neutral" },
  in_progress: { label: "Em andamento", tone: "info" },
  paused: { label: "Pausada", tone: "warning" },
  completed: { label: "Concluída", tone: "success" },
  archived: { label: "Arquivada", tone: "neutral" },
};
