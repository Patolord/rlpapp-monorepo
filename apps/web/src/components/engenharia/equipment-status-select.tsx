import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EQUIPMENT_STATUS_OPTIONS,
  getEquipmentStatusLabel,
} from "@/lib/equipment-status";
import type { EquipmentStatus } from "@/lib/offline-queue";

interface EquipmentStatusSelectProps {
  value: EquipmentStatus;
  onValueChange: (value: EquipmentStatus) => void;
  triggerClassName?: string;
}

export function EquipmentStatusSelect({
  value,
  onValueChange,
  triggerClassName,
}: EquipmentStatusSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as EquipmentStatus)}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue>{getEquipmentStatusLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {EQUIPMENT_STATUS_OPTIONS.map(({ value: optionValue, label }) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
