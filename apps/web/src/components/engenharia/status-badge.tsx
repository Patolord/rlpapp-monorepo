import { Badge } from "@/components/ui/badge";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/equipment-status";

const statusConfig = {
  installing: {
    label: EQUIPMENT_STATUS_LABELS.installing,
    className: "bg-blue-100 text-blue-800 border-blue-300",
  },
  operational: {
    label: EQUIPMENT_STATUS_LABELS.operational,
    className: "bg-green-100 text-green-800 border-green-300",
  },
  warning: {
    label: EQUIPMENT_STATUS_LABELS.warning,
    className: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
  error: {
    label: EQUIPMENT_STATUS_LABELS.error,
    className: "bg-red-100 text-red-800 border-red-300",
  },
} as const;

type Status = keyof typeof statusConfig;

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
