import { ChevronRight, Truck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface SupplierCardProps {
  name: string;
  categories: string[] | null;
  notes: string | null;
  active: boolean;
  onPress?: () => void;
}

export function SupplierCard({
  name,
  categories,
  notes,
  active,
  onPress,
}: SupplierCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
          <Truck size={20} color="#10b981" />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {name}
            </Text>
            {!active && (
              <Badge variant="destructive" className="px-1.5 py-0">
                Inativo
              </Badge>
            )}
          </View>

          <View className="flex-row flex-wrap items-center gap-1.5">
            {categories?.map((cat) => (
              <Badge key={cat} variant="outline" className="px-1.5 py-0">
                {cat}
              </Badge>
            ))}
            {notes && (
              <Text
                className="text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {notes}
              </Text>
            )}
          </View>
        </View>

        {onPress && <ChevronRight size={18} color="#9ca3af" />}
      </Card>
    </Pressable>
  );
}
