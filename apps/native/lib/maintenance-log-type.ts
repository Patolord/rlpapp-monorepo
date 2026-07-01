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
