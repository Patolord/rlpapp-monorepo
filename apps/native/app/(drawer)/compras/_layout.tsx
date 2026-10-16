import { api } from "@rlpapp/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Tabs, useNavigation } from "expo-router";
import {
  LayoutGrid,
  Package,
  Receipt,
  ClipboardList,
  Truck,
} from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function ComprasTabsLayout() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ openDrawer: () => void }>();

  const bg = colors.bg;
  const inactive = colors.icon;
  const surface = colors.surface;
  const border = colors.border;

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <ScreenHeader title="Compras" onMenu={() => navigation.openDrawer()} large />

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
