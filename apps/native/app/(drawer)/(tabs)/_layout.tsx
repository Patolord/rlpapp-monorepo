import { Tabs } from "expo-router";
import { Platform, useWindowDimensions } from "react-native";
import { Package, ArrowDownCircle, ArrowUpCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

const TAB_MARGIN = 20;

export default function TabLayout() {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const fg = isDark ? COLORS.dark.foreground : COLORS.light.foreground;
  const bg = isDark ? COLORS.dark.background : COLORS.light.background;

  const bottomOffset = Platform.OS === "ios" ? Math.max(insets.bottom, 12) : 16;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: bg },
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          position: "absolute",
          bottom: bottomOffset,
          alignSelf: "center",
          marginHorizontal: TAB_MARGIN,
          left: 0,
          right: 0,
          height: 64,
          backgroundColor: "#ffffff",
          borderRadius: 24,
          borderTopWidth: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 8,
          paddingBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      {/* Rota default do grupo: apenas redireciona para o estoque */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="estoque"
        options={{
          title: "Estoque",
          tabBarIcon: ({ color, size }) => <Package size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="entrada"
        options={{
          title: "Entrada",
          tabBarIcon: ({ color, size }) => <ArrowDownCircle size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="saida"
        options={{
          title: "Saída",
          tabBarIcon: ({ color, size }) => <ArrowUpCircle size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
