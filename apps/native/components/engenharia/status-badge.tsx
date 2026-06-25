import { View, Text } from "react-native";
import {
  EQUIPMENT_STATUS_LABELS,
  type EquipmentStatus,
} from "@/lib/equipment-status";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  EquipmentStatus,
  { label: string; className: string; textClassName: string }
> = {
  installing: {
    label: EQUIPMENT_STATUS_LABELS.installing,
    className: "bg-blue-100 border-blue-300",
    textClassName: "text-blue-800",
  },
  operational: {
    label: EQUIPMENT_STATUS_LABELS.operational,
    className: "bg-green-100 border-green-300",
    textClassName: "text-green-800",
  },
  warning: {
    label: EQUIPMENT_STATUS_LABELS.warning,
    className: "bg-yellow-100 border-yellow-300",
    textClassName: "text-yellow-800",
  },
  error: {
    label: EQUIPMENT_STATUS_LABELS.error,
    className: "bg-red-100 border-red-300",
    textClassName: "text-red-800",
  },
};

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  const config = statusConfig[status];
  return (
    <View
      className={cn(
        "flex-row items-center self-start rounded-full border px-2.5 py-0.5",
        config.className
      )}
    >
      <Text className={cn("text-xs font-medium", config.textClassName)}>
        {config.label}
      </Text>
    </View>
  );
}
