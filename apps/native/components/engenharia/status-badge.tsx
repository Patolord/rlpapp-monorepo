import { StatusBadge as Badge } from "@/components/ui";
import {
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_TONE,
  type EquipmentStatus,
} from "@/lib/equipment-status";

/** Status do equipamento no padrão do design system (pílula branca + ponto). */
export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <Badge label={EQUIPMENT_STATUS_LABELS[status]} tone={EQUIPMENT_STATUS_TONE[status]} />;
}
