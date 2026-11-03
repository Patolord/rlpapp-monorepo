import { Tabs, useNavigation } from "expo-router";
import { Clock, Users, Wallet } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function RhTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <ScreenHeader title="Recursos Humanos" onMenu={() => navigation.openDrawer()} large />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.icon,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 58 + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom - 4 : 6,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Funcionários", tabBarIcon: ({ color, size }) => <Users size={size} color={color} /> }} />
        <Tabs.Screen name="folha" options={{ title: "Folha", tabBarIcon: ({ color, size }) => <Wallet size={size} color={color} /> }} />
        <Tabs.Screen name="ponto" options={{ title: "Ponto", tabBarIcon: ({ color, size }) => <Clock size={size} color={color} /> }} />
      </Tabs>
    </View>
  );
}
