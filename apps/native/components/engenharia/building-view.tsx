import { View } from "react-native";

import { FloorRow } from "@/components/engenharia/floor-row";
import { UNIT_STATE_STYLES, type GridFloor, type GridUnit } from "@/lib/building";
import { Text } from "react-native";
import { cn } from "@/lib/utils";

const legendItems: { key: keyof typeof UNIT_STATE_STYLES; label: string }[] = [
  { key: "complete", label: "Concluído" },
  { key: "partial", label: "Parcial" },
  { key: "pending", label: "Pendente" },
  { key: "overdue", label: "Em atraso" },
  { key: "empty", label: "Vazio" },
];

export function BuildingView({
  floors,
  units,
  now,
  selectedUnitId,
  onSelectUnit,
}: {
  floors: GridFloor[];
  units: GridUnit[];
  now: number;
  selectedUnitId?: string | null;
  onSelectUnit?: (unit: GridUnit) => void;
}) {
  const sortedFloors = floors.slice().sort((a, b) => b.number - a.number);

  return (
    <View className="gap-4">
      <View className="gap-4">
        {sortedFloors.map((floor) => (
          <FloorRow
            key={floor.number}
            floor={floor}
            units={units}
            now={now}
            selectedUnitId={selectedUnitId}
            onSelectUnit={onSelectUnit}
          />
        ))}
      </View>

      <View className="flex-row flex-wrap gap-x-4 gap-y-2 pt-2">
        {legendItems.map((item) => (
          <View key={item.key} className="flex-row items-center gap-1.5">
            <View
              className={cn(
                "h-3.5 w-3.5 rounded border-2",
                UNIT_STATE_STYLES[item.key].cell
              )}
            />
            <Text className="text-xs text-muted-foreground">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
