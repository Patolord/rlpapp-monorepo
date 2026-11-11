import type { EquipmentStatus } from "@rlpapp/shared/engenharia/equipment";

import type { Tone } from "@/lib/theme";

export type { EquipmentStatus };

// Nomes do design system do app (Instalando · Operacional · Atenção · Erro);
// o dashboard usa os rótulos de `@rlpapp/shared/engenharia/equipment`.
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  installing: "Instalando",
  operational: "Operacional",
  warning: "Atenção",
  error: "Erro",
};

export const EQUIPMENT_STATUS_TONE: Record<EquipmentStatus, Tone> = {
  installing: "info",
  operational: "success",
  warning: "warning",
  error: "danger",
};

/** Item planejado sem equipamento instalado. */
export const PENDING_LABEL = "Pendente";

export function getEquipmentStatusLabel(status: EquipmentStatus): string {
  return EQUIPMENT_STATUS_LABELS[status];
}

export const EQUIPMENT_STATUS_OPTIONS = (
  Object.entries(EQUIPMENT_STATUS_LABELS) as [EquipmentStatus, string][]
).map(([value, label]) => ({ value, label }));
