import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, space } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Chips: horizontal, scrollable segmented filter / sub-navigation.
// ---------------------------------------------------------------------------
export type ChipItem<K extends string = string> = { key: K; label: string; icon?: LucideIcon; count?: number };

export function Chips<K extends string>({
  items,
  active,
  onChange,
  style,
}: {
  items: ChipItem<K>[];
  active: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const Icon = item.icon;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: isActive ? colors.primary : pressed ? colors.surfacePressed : colors.surface,
                borderColor: isActive ? colors.primary : colors.border,
              },
            ]}
          >
            {Icon ? <Icon size={15} color={isActive ? colors.onPrimary : colors.icon} strokeWidth={2} /> : null}
            <Text style={[styles.label, { color: isActive ? colors.onPrimary : colors.textSecondary }]}>
              {item.label}
              {item.count !== undefined ? ` · ${item.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.screen,
    gap: space.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
});
