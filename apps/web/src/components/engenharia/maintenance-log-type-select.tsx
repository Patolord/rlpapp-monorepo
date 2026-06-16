import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAINTENANCE_LOG_TYPE_OPTIONS,
  getMaintenanceLogTypeLabel,
  type MaintenanceLogType,
} from "@/lib/maintenance-log-type";

interface MaintenanceLogTypeSelectProps {
  value: MaintenanceLogType;
  onValueChange: (value: MaintenanceLogType) => void;
  triggerClassName?: string;
}

export function MaintenanceLogTypeSelect({
  value,
  onValueChange,
  triggerClassName,
}: MaintenanceLogTypeSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as MaintenanceLogType)}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue>{getMaintenanceLogTypeLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MAINTENANCE_LOG_TYPE_OPTIONS.map(({ value: optionValue, label }) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
