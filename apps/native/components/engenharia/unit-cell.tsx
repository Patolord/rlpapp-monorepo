import { Clock, Wind } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { cn } from "@/lib/utils";
import {
  getUnitState,
  TYPE_LABELS,
  UNIT_STATE_STYLES,
  type GridUnit,
} from "@/lib/building";

export function UnitCell({
  unit,
  now,
  selected = false,
  onSelect,
}: {
  unit: GridUnit;
  now: number;
  selected?: boolean;
  onSelect?: (unit: GridUnit) => void;
}) {
  const state = getUnitState(unit, now);
  const style = state.overdue
    ? UNIT_STATE_STYLES.overdue
    : UNIT_STATE_STYLES[state.level];

  return (
    <Pressable
      onPress={() => onSelect?.(unit)}
      className={cn(
        "w-32 gap-2 rounded-xl border-2 p-3",
        style.cell,
        selected && "border-primary"
      )}
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text className="flex-1 text-base font-bold text-foreground" numberOfLines={1}>
          {unit.label}
        </Text>
        <View className={cn("rounded px-1.5 py-0.5", style.tagBg)}>
          <Text className={cn("text-[10px] font-bold uppercase", style.tagText)}>
            {TYPE_LABELS[unit.type]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          <Wind size={14} color="#52525b" />
          <Text className="text-xs font-semibold text-foreground">
            {state.installed}/{state.total}
          </Text>
        </View>
        {state.overdue && <Clock size={14} color="#dc2626" />}
      </View>
    </Pressable>
  );
}
