import { useNavigation } from "expo-router";
import { Building2, Menu } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Slot } from "expo-router";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

export default function PortalLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const { isDark } = useAppTheme();

  const bg = isDark ? COLORS.dark.background : COLORS.light.background;
  const fg = isDark ? COLORS.dark.foreground : COLORS.light.foreground;
  const surface = isDark ? "#1b2433" : "#ffffff";
  const border = isDark ? "#2a3446" : "#d8e3ef";

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <View
        className="flex-row items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: border }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => navigation.openDrawer()}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: surface }}
          >
            <Menu size={20} color={fg} />
          </Pressable>
          <Building2 size={20} color={fg} />
          <Text className="text-xl font-bold" style={{ color: fg }}>
            Portal do Cliente
          </Text>
        </View>
        <ThemeToggle />
      </View>
      <Slot />
    </View>
  );
}
