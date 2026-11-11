import type { Tabs } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, space } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Faixa de abas no topo das áreas (Estoque, Compras, RH): abas sublinhadas em
// azul, roláveis na horizontal, com número opcional (tabBarBadge).
// Rotas com href: null não aparecem.
// ---------------------------------------------------------------------------
type HiddenAware = { href?: unknown; tabBarItemStyle?: unknown };

/** Props que o Tabs do expo-router passa para um tabBar próprio. */
export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>["tabBar"]>>[0];

function isHidden(options: HiddenAware): boolean {
  if (options.href === null) return true;
  const style = StyleSheet.flatten(options.tabBarItemStyle as never) as { display?: string } | undefined;
  return style?.display === "none";
}

export function TopTabBar({ state, descriptors, navigation }: TabBarProps) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if (isHidden(options as HiddenAware)) return null;
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const badge = options.tabBarBadge;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge !== undefined ? `${label}, ${badge}` : label}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <Text style={[styles.label, { color: focused ? colors.text : colors.textSecondaryOnBg, fontWeight: focused ? "600" : "500" }]}>
                {label}
              </Text>
              {badge !== undefined && badge !== null && badge !== "" ? (
                <View style={[styles.badge, { backgroundColor: focused ? colors.primary : colors.surfaceMuted }]}>
                  <Text style={[styles.badgeText, { color: focused ? colors.onPrimary : colors.text }]}>{String(badge)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  row: {
    paddingHorizontal: space.screen - 4,
  },
  tab: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  label: {
    fontSize: 15,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
