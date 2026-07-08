/**
 * Espelho no frontend dos intents da IA (backend: convex/aiIntents.ts).
 * Usado para preview e para enviar a `aiIntents.applyIntents`.
 */
export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "completed"
  | "paused";

export type EquipmentStatus =
  | "installing"
  | "operational"
  | "warning"
  | "error";

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
      col?: number;
      colSpan?: number;
      rowSpan?: number;
    }
  | {
      type: "resize_environment";
      towerName: string;
      floorNumber: number;
      name: string;
      col?: number;
      colSpan?: number;
      rowSpan?: number;
    }
  | {
      type: "create_system";
      name: string;
      systemType?: string;
      obs?: string;
    }
  | {
      type: "assign_qr";
      token: string;
      towerName: string;
      floorNumber: number;
      environmentName: string;
      system?: string;
      kind?: "condensadora" | "evaporadora";
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
    }
  | {
      type: "set_floor_deadline";
      towerName: string;
      floorNumber: number;
      deadline: number;
    }
  | {
      type: "update_equipment";
      towerName: string;
      floorNumber: number;
      environmentName: string;
      kind?: "condensadora" | "evaporadora";
      system?: string;
      deadline?: number;
      modelo?: string;
      capacidade?: string;
      status?: EquipmentStatus;
    }
  | {
      type: "rename_environment";
      towerName: string;
      floorNumber: number;
      oldName: string;
      newName: string;
    };

/** Descrição legível dos campos de posição/tamanho na matriz. */
function describeGridSize(intent: {
  col?: number;
  colSpan?: number;
  rowSpan?: number;
}): string {
  const parts: string[] = [];
  if (intent.col !== undefined) parts.push(`col. ${intent.col}`);
  if (intent.colSpan !== undefined) parts.push(`${intent.colSpan} colunas`);
  if (intent.rowSpan !== undefined) parts.push(`${intent.rowSpan} andares`);
  return parts.join(", ");
}

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
    case "create_environment": {
      const size = describeGridSize(intent);
      return {
        title: "Criar ambiente",
        detail: `${intent.towerName} · ${intent.floorNumber}º · ${intent.name}${
          size ? ` (${size})` : ""
        }`,
      };
    }
    case "resize_environment": {
      const size = describeGridSize(intent);
      return {
        title: "Redimensionar ambiente",
        detail: `${intent.towerName} · ${intent.floorNumber}º · ${intent.name}${
          size ? ` → ${size}` : ""
        }`,
      };
    }
    case "create_system":
      return {
        title: "Criar sistema",
        detail: `${intent.name}${
          intent.systemType ? ` (${intent.systemType})` : ""
        }`,
      };
    case "assign_qr":
      return {
        title: "Vincular QR code",
        detail: `${intent.token} → ${intent.towerName} · ${intent.floorNumber}º · ${
          intent.environmentName
        }${intent.system ? ` · ${intent.system}` : ""}${
          intent.kind
            ? ` (${intent.kind === "condensadora" ? "Cond." : "Evap."})`
            : ""
        }`,
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
    case "set_floor_deadline":
      return {
        title: "Alterar prazo do andar",
        detail: `${intent.towerName} · ${intent.floorNumber}º andar → ${new Date(intent.deadline).toLocaleDateString("pt-BR")}`,
      };
    case "update_equipment": {
      const parts: string[] = [
        `${intent.towerName} · ${intent.floorNumber}º · ${intent.environmentName}`,
      ];
      if (intent.deadline)
        parts.push(
          `Prazo: ${new Date(intent.deadline).toLocaleDateString("pt-BR")}`
        );
      if (intent.modelo) parts.push(`Modelo: ${intent.modelo}`);
      if (intent.capacidade) parts.push(`Cap.: ${intent.capacidade}`);
      if (intent.status) parts.push(`Status: ${intent.status}`);
      return { title: "Atualizar equipamento", detail: parts.join(" · ") };
    }
    case "rename_environment":
      return {
        title: "Renomear ambiente",
        detail: `${intent.towerName} · ${intent.floorNumber}º · "${intent.oldName}" → "${intent.newName}"`,
      };
  }
}
