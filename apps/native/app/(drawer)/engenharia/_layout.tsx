import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs, useNavigation } from "expo-router";
import {
  Building2,
  ClipboardList,
  LayoutGrid,
  Menu,
  UserCog,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/lib/colors";

const ACTIVE = "#f59e0b";

export default function EngenhariaTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();

  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin =
    currentUser?.role === "director" || currentUser?.role === "admin";

  const bg = COLORS.background;
  const fg = COLORS.foreground;
  const inactive = "#5b6472";
  const surface = "#ffffff";
  const border = "#d8e3ef";

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
          <Text className="text-xl font-bold" style={{ color: fg }}>
            Engenharia
          </Text>
        </View>
      </View>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE,
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
