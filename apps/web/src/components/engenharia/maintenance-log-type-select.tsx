import { cn } from "@/lib/utils";
import {
  MAINTENANCE_LOG_TYPE_OPTIONS,
  type MaintenanceLogType,
} from "@/lib/maintenance-log-type";

interface MaintenanceLogTypeSelectProps {
  value: MaintenanceLogType | null;
  onValueChange: (value: MaintenanceLogType) => void;
  triggerClassName?: string;
}

export function MaintenanceLogTypeSelect({
  value,
  onValueChange,
}: MaintenanceLogTypeSelectProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {MAINTENANCE_LOG_TYPE_OPTIONS.map(({ value: optionValue, label }) => {
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
