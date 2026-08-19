import { Text, View } from "react-native";
import { MapPin } from "lucide-react-native";

import { Badge } from "@rlpapp/ui/native";

interface BalanceCardProps {
  name: string;
  quantity: number;
  unit: string;
  location?: string;
}

export function BalanceCard({ name, quantity, unit, location }: BalanceCardProps) {
  return (
    <View className="rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground font-medium text-sm flex-1" numberOfLines={1}>
          {name}
        </Text>
        <Text className="text-foreground font-semibold text-sm">
          {quantity} {unit}
        </Text>
      </View>
      {location && (
        <View className="flex-row items-center gap-1 mt-1.5">
          <MapPin size={12} color="#6b7280" />
          <Badge variant="outline">{location}</Badge>
        </View>
      )}
    </View>
  );
}
