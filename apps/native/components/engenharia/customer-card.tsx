import { ChevronRight, User } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui/card";

interface CustomerCardProps {
  name: string;
  email: string | null;
  phone: string | null;
  projectCount?: number;
  onPress?: () => void;
}

export function CustomerCard({
  name,
  email,
  phone,
  projectCount,
  onPress,
}: CustomerCardProps) {
  return (
    <Pressable onPress={onPress}>
      <Card className="flex-row items-center gap-3 p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <User size={20} color="#f59e0b" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            className="text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {name}
          </Text>
          <View className="flex-row items-center gap-2">
            {email && (
              <Text
                className="text-sm text-muted-foreground"
                numberOfLines={1}
              >
                {email}
              </Text>
            )}
            {email && phone && (
              <Text className="text-muted-foreground">·</Text>
            )}
            {phone && (
              <Text className="text-sm text-muted-foreground">{phone}</Text>
            )}
          </View>
        </View>
        {projectCount !== undefined && (
          <View className="items-center justify-center rounded-full bg-primary/10 px-2.5 py-1">
            <Text className="text-xs font-semibold text-foreground">
              {projectCount} {projectCount === 1 ? "obra" : "obras"}
            </Text>
          </View>
        )}
        <ChevronRight size={20} color="#9ca3af" />
      </Card>
    </Pressable>
  );
}
