import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Home, Package, ArrowDownCircle, ArrowUpCircle } from "lucide-react-native";

export default function TabLayout() {
  const themeColorForeground = useThemeColor("foreground");
  const themeColorBackground = useThemeColor("background");

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: themeColorBackground,
        },
        headerTintColor: themeColorForeground,
        headerTitleStyle: {
          color: themeColorForeground,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: themeColorBackground,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="estoque"
        options={{
          title: "Estoque",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Package size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="entrada"
        options={{
          title: "Entrada",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <ArrowDownCircle size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saida"
        options={{
          title: "Saída",
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <ArrowUpCircle size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
