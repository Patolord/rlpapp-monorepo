/** Status de um equipamento instalado em obra (igual a `equipmentStatusValidator` do backend). */
export type EquipmentStatus = "installing" | "operational" | "warning" | "error";

/** Rótulos únicos para web e app (CONTEXT.md, "Installed equipment"). */
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  installing: "Instalando",
  operational: "Operacional",
  warning: "Atenção",
  error: "Erro",
};

export function getEquipmentStatusLabel(status: EquipmentStatus): string {
  return EQUIPMENT_STATUS_LABELS[status];
}

export const EQUIPMENT_STATUS_OPTIONS = (
  Object.entries(EQUIPMENT_STATUS_LABELS) as [EquipmentStatus, string][]
).map(([value, label]) => ({ value, label }));

/** Tipo de um registro de manutenção do equipamento. */
export type MaintenanceLogType = "installation" | "maintenance";

export const MAINTENANCE_LOG_TYPE_LABELS: Record<MaintenanceLogType, string> = {
  installation: "Instalação",
  maintenance: "Manutenção",
};

export function getMaintenanceLogTypeLabel(type: MaintenanceLogType): string {
  return MAINTENANCE_LOG_TYPE_LABELS[type];
}

export const MAINTENANCE_LOG_TYPE_OPTIONS = (
  Object.entries(MAINTENANCE_LOG_TYPE_LABELS) as [MaintenanceLogType, string][]
).map(([value, label]) => ({ value, label }));
