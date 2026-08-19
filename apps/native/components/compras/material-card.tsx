import { ChevronRight, Package } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface MaterialCardProps {
  name: string;
  unit: string | null;
  category: string | null;
  sku: string | null;
  variantLabel?: string | null;
  onPress?: () => void;
}

export function MaterialCard({
  name,
  unit,
  category,
  sku,
  variantLabel,
  onPress,
}: MaterialCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Package size={20} color="#3b82f6" />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {name}
            {variantLabel ? ` (${variantLabel})` : ""}
          </Text>

          <View className="flex-row flex-wrap items-center gap-1.5">
            {sku && (
              <Text className="text-xs text-muted-foreground">{sku}</Text>
            )}
            {unit && (
              <Badge variant="outline" className="px-1.5 py-0">
                {unit}
              </Badge>
            )}
            {category && (
              <Badge variant="secondary" className="px-1.5 py-0">
                {category}
              </Badge>
            )}
          </View>
        </View>

        {onPress && <ChevronRight size={18} color="#9ca3af" />}
      </Card>
    </Pressable>
  );
}
