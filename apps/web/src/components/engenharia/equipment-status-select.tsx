import { cn } from "@/lib/utils";
import {
  EQUIPMENT_STATUS_OPTIONS,
} from "@/lib/equipment-status";
import type { EquipmentStatus } from "@/lib/offline-queue";

interface EquipmentStatusSelectProps {
  value: EquipmentStatus | null;
  onValueChange: (value: EquipmentStatus) => void;
  triggerClassName?: string;
}

export function EquipmentStatusSelect({
  value,
  onValueChange,
}: EquipmentStatusSelectProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {EQUIPMENT_STATUS_OPTIONS.map(({ value: optionValue, label }) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onValueChange(optionValue)}
            className={cn(
              "rounded-full border px-4 py-2.5 text-base transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
