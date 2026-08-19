import { ChevronRight, HardHat } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ContractorCardProps {
  name: string;
  specialty?: string | null;
  phone: string | null;
  active: boolean;
  onPress?: () => void;
}

export function ContractorCard({
  name,
  specialty,
  phone,
  active,
  onPress,
}: ContractorCardProps) {
  return (
    <Pressable onPress={onPress}>
      <Card className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <HardHat size={20} color="#f59e0b" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {name}
          </Text>
          <View className="flex-row items-center gap-2">
            {specialty && (
              <Text
                className="text-sm text-muted-foreground"
                numberOfLines={1}
              >
                {specialty}
              </Text>
            )}
            {specialty && phone && (
              <Text className="text-muted-foreground">·</Text>
            )}
            {phone && (
              <Text className="text-sm text-muted-foreground">{phone}</Text>
            )}
          </View>
        </View>
        <View
          className={cn(
            "rounded-full border px-2.5 py-0.5",
            active
              ? "bg-green-100 border-green-300"
              : "bg-gray-100 border-gray-300"
          )}
        >
          <Text
            className={cn(
              "text-xs font-medium",
              active ? "text-green-800" : "text-gray-600"
            )}
          >
            {active ? "Ativo" : "Inativo"}
          </Text>
        </View>
        <ChevronRight size={20} color="#9ca3af" />
      </Card>
    </Pressable>
  );
}
