import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui";
import { colors } from "@/lib/theme";

import { TopTabBar } from "./top-tab-bar";

// ---------------------------------------------------------------------------
// Layout de uma área (Estoque, Compras, RH): título grande e a faixa de abas
// no topo. A barra de abas principal continua embaixo (A3 §6).
// ---------------------------------------------------------------------------
export function AreaTabs({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <ScreenHeader title={title} subtitle={subtitle} right={right} large />
      <Tabs
        tabBar={(props) => <TopTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: "top",
          sceneStyle: { backgroundColor: colors.bg },
          lazy: true,
        }}
      >
        {children}
      </Tabs>
    </View>
  );
}
