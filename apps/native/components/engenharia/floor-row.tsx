import { ScrollView, Text, View } from "react-native";

import { UnitCell } from "@/components/engenharia/unit-cell";
import type { GridFloor, GridUnit } from "@/lib/building";

export function FloorRow({
  floor,
  units,
  now,
  selectedUnitId,
  onSelectUnit,
}: {
  floor: GridFloor;
  units: GridUnit[];
  now: number;
  selectedUnitId?: string | null;
  onSelectUnit?: (unit: GridUnit) => void;
}) {
  const floorUnits = units
    .filter((u) => u.floor === floor.number)
    .sort((a, b) => a.final - b.final);

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-muted-foreground">
        {floor.label}
      </Text>
      {floorUnits.length === 0 ? (
        <View className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
          <Text className="text-xs text-muted-foreground">
            Sem apartamentos neste andar
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {floorUnits.map((unit) => (
            <UnitCell
              key={unit._id}
              unit={unit}
              now={now}
              selected={selectedUnitId === unit._id}
              onSelect={onSelectUnit}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
