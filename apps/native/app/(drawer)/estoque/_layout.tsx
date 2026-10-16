import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs, useNavigation } from "expo-router";
import {
  History,
  ShieldAlert,
  Warehouse,
} from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function EstoqueTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();

  const currentUser = useQuery(api.users.getCurrentUser);
  const isEngineer =
    currentUser?.role === "director" ||
    currentUser?.role === "engenheiro" ||
    currentUser?.role === "admin";

  const bg = colors.bg;
  const inactive = colors.icon;
  const surface = colors.surface;
  const border = colors.border;

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <ScreenHeader title="Estoque" onMenu={() => navigation.openDrawer()} large />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: inactive,
          tabBarStyle: {
            backgroundColor: surface,
            borderTopColor: border,
            borderTopWidth: 1,
            height: 58 + insets.bottom,
            paddingBottom: insets.bottom > 0 ? insets.bottom - 4 : 6,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          sceneStyle: { backgroundColor: bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Central",
            tabBarIcon: ({ color, size }) => (
              <Warehouse size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="movimentacoes"
          options={{
            title: "Movimentações",
            tabBarIcon: ({ color, size }) => (
              <History size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="aprovacoes"
          options={{
            title: "Aprovações",
            href: isEngineer ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <ShieldAlert size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
