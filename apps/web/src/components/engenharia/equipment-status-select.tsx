import { cn } from "@/lib/utils";
import {
  EQUIPMENT_STATUS_OPTIONS,
} from "@/lib/equipment-status";
import type { EquipmentStatus } from "@/lib/offline-queue";

const STATUS_STYLES: Record<EquipmentStatus, { active: string; inactive: string }> = {
  installing: {
    active: "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500",
    inactive: "border-border text-muted-foreground hover:bg-blue-50/50 hover:border-blue-300",
  },
  operational: {
    active: "border-green-500 bg-green-50 text-green-700 ring-1 ring-green-500",
    inactive: "border-border text-muted-foreground hover:bg-green-50/50 hover:border-green-300",
  },
  warning: {
    active: "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500",
    inactive: "border-border text-muted-foreground hover:bg-amber-50/50 hover:border-amber-300",
  },
  error: {
    active: "border-red-500 bg-red-50 text-red-700 ring-1 ring-red-500",
    inactive: "border-border text-muted-foreground hover:bg-red-50/50 hover:border-red-300",
  },
};

interface EquipmentStatusSelectProps {
  value: EquipmentStatus;
  onValueChange: (value: EquipmentStatus) => void;
  triggerClassName?: string;
}

export function EquipmentStatusSelect({
  value,
  onValueChange,
}: EquipmentStatusSelectProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {EQUIPMENT_STATUS_OPTIONS.map(({ value: optionValue, label }) => {
        const isActive = value === optionValue;
        const styles = STATUS_STYLES[optionValue];
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onValueChange(optionValue)}
            className={cn(
              "rounded-lg border px-3 py-3 text-sm font-medium transition-all",
              isActive ? styles.active : styles.inactive,
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
