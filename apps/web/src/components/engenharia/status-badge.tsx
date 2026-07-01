import { StatusBadge as UiStatusBadge } from "@rlpapp/ui/web";
import {
  equipmentStatusVariants,
  type EquipmentStatusKey,
} from "@rlpapp/ui/tokens";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/equipment-status";

export function StatusBadge({ status }: { status: EquipmentStatusKey }) {
  return (
    <UiStatusBadge variant={equipmentStatusVariants[status]}>
      {EQUIPMENT_STATUS_LABELS[status]}
    </UiStatusBadge>
  );
}
