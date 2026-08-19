import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs, useNavigation } from "expo-router";
import {
  LayoutGrid,
  Menu,
  Package,
  Receipt,
  ClipboardList,
  Truck,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

const ACTIVE = "#3b82f6";

export default function ComprasTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();
  const { isDark } = useAppTheme();

  const bg = isDark ? COLORS.dark.background : COLORS.light.background;
  const fg = isDark ? COLORS.dark.foreground : COLORS.light.foreground;
  const inactive = isDark ? "#8a94a6" : "#5b6472";
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
          <Text className="text-xl font-bold" style={{ color: fg }}>
            Compras
          </Text>
        </View>
        <ThemeToggle />
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
          tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
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
          name="materiais"
          options={{
            title: "Materiais",
            tabBarIcon: ({ color, size }) => (
              <Package size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="fornecedores"
          options={{
            title: "Fornecedores",
            tabBarIcon: ({ color, size }) => (
              <Truck size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="fila-revisao"
          options={{
            title: "Revisão",
            tabBarIcon: ({ color, size }) => (
              <ClipboardList size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="eventos-preco"
          options={{
            title: "Preços",
            tabBarIcon: ({ color, size }) => (
              <Receipt size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
