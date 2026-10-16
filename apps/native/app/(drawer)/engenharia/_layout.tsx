import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs, useNavigation } from "expo-router";
import {
  Building2,
  ClipboardList,
  LayoutGrid,
  UserCog,
} from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function EngenhariaTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();

  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";

  const bg = colors.bg;
  const inactive = colors.icon;
  const surface = colors.surface;
  const border = colors.border;

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <ScreenHeader title="Engenharia" onMenu={() => navigation.openDrawer()} large />

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
            title: "Painel",
            tabBarIcon: ({ color, size }) => (
              <LayoutGrid size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="registro"
          options={{
            title: "Registro",
            tabBarIcon: ({ color, size }) => (
              <ClipboardList size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="obras"
          options={{
            title: "Obras",
            tabBarIcon: ({ color, size }) => (
              <Building2 size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="usuarios"
          options={{
            title: "Usuários",
            href: isAdmin ? undefined : null,
            tabBarIcon: ({ color, size }) => (
              <UserCog size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="medicoes" options={{ href: null }} />
        <Tabs.Screen name="contratos" options={{ href: null }} />
        <Tabs.Screen name="empreiteiros" options={{ href: null }} />
        <Tabs.Screen name="clientes" options={{ href: null }} />
        <Tabs.Screen name="qr-codes" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
