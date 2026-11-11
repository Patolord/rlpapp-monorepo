import { useAuth } from "@clerk/expo";
import { Redirect, Tabs } from "expo-router";
import { Building2, ClipboardList, Clock, MoreHorizontal, ScanLine } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, type } from "@/lib/theme";
import { usePendingCount } from "@/lib/use-pending-records";

/**
 * App do técnico (qr_operator): Obras · Escanear · Pendentes · Ponto · Mais
 * (claude/rlpapp-native-navegacao.md §3.1). O número em Pendentes é a fila
 * deste aparelho.
 */
export default function CampoLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const pending = usePendingCount();

  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  const header = {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.bg },
    headerTitleStyle: { color: colors.text, fontSize: type.heading.fontSize, fontWeight: "600" as const },
    headerTitleAlign: "left" as const,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="(obras)" options={{ title: "Obras", tabBarIcon: ({ color }) => <Building2 size={24} color={color} /> }} />
      <Tabs.Screen
        name="escanear"
        options={{ title: "Escanear", tabBarIcon: ({ color }) => <ScanLine size={24} color={color} />, tabBarStyle: { display: "none" } }}
      />
      <Tabs.Screen
        name="pendentes"
        options={{
          ...header,
          title: "Pendentes",
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: "#FFFFFF", fontSize: 11 },
          tabBarIcon: ({ color }) => <ClipboardList size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="ponto" options={{ ...header, title: "Ponto", tabBarIcon: ({ color }) => <Clock size={24} color={color} /> }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: ({ color }) => <MoreHorizontal size={24} color={color} /> }} />
    </Tabs>
  );
}
