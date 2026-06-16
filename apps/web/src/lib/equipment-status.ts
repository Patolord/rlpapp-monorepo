import type { EquipmentStatus } from "@/lib/offline-queue";

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  installing: "Em instalação",

  warning: "Alerta",
  error: "Erro",
  operational: "Operacional",
};

export function getEquipmentStatusLabel(status: EquipmentStatus): string {
  return EQUIPMENT_STATUS_LABELS[status];
}

export const EQUIPMENT_STATUS_OPTIONS = (
  Object.entries(EQUIPMENT_STATUS_LABELS) as [EquipmentStatus, string][]
).map(([value, label]) => ({ value, label }));
