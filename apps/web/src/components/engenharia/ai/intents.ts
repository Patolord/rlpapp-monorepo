/**
 * Espelho no frontend dos intents da IA (backend: convex/aiIntents.ts).
 * Usado para preview e para enviar a `aiIntents.applyIntents`.
 */
export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "paused";

export type AiIntent =
  | {
      type: "update_project";
      client?: string;
      address?: string;
      status?: ProjectStatus;
      startDate?: number;
      endDate?: number;
    }
  | { type: "create_tower"; name: string }
  | { type: "duplicate_tower"; towerName: string; newName?: string }
  | { type: "create_floors"; towerName: string; from: number; to: number }
  | {
      type: "create_environment";
      towerName: string;
      floorNumber: number;
      name: string;
      envType?: string;
    }
  | {
      type: "add_equipment";
      towerName: string;
      floorNumber: number;
      environmentName: string;
      system: string;
      kind: "condensadora" | "evaporadora";
      modelo?: string;
      capacidade?: string;
      serialNumber?: string;
      deadline?: number;
    }
  | {
      type: "create_checklist_template";
      name: string;
      items: { label: string; required: boolean }[];
    };

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  completed: "Concluída",
  paused: "Pausada",
};

/** Descrição curta e legível de um intent para o preview. */
export function describeIntent(intent: AiIntent): {
  title: string;
  detail: string;
} {
  switch (intent.type) {
    case "update_project": {
      const parts: string[] = [];
      if (intent.client) parts.push(`Cliente: ${intent.client}`);
      if (intent.address) parts.push(`Endereço: ${intent.address}`);
      if (intent.status) parts.push(`Status: ${STATUS_LABELS[intent.status]}`);
      if (intent.startDate)
        parts.push(`Início: ${new Date(intent.startDate).toLocaleDateString("pt-BR")}`);
      if (intent.endDate)
        parts.push(`Término: ${new Date(intent.endDate).toLocaleDateString("pt-BR")}`);
      return { title: "Atualizar obra", detail: parts.join(" · ") || "—" };
    }
    case "create_tower":
      return { title: "Criar torre", detail: intent.name };
    case "duplicate_tower":
      return {
        title: "Duplicar torre",
        detail: `${intent.towerName}${intent.newName ? ` → ${intent.newName}` : ""}`,
      };
    case "create_floors":
      return {
        title: "Criar andares",
        detail: `${intent.towerName}: ${intent.from}º ao ${intent.to}º`,
      };
    case "create_environment":
      return {
        title: "Criar ambiente",
        detail: `${intent.towerName} · ${intent.floorNumber}º · ${intent.name}`,
      };
    case "add_equipment":
      return {
        title: "Adicionar equipamento",
        detail: `${intent.system} (${
          intent.kind === "condensadora" ? "Cond." : "Evap."
        }) em ${intent.environmentName}${
          intent.modelo ? ` · ${intent.modelo}` : ""
        }`,
      };
    case "create_checklist_template":
      return {
        title: "Criar checklist",
        detail: `${intent.name} · ${intent.items.length} item(ns)`,
      };
  }
}
