import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, shadow, space, type } from "@/lib/theme";

// ---------------------------------------------------------------------------
// MetricStrip: faixa única de números (MetricCard do design system).
// ---------------------------------------------------------------------------
export type Metric = { label: string; value: string | number; hint?: string | null };

export function MetricStrip({
  items,
  onPress,
  style,
}: {
  items: Metric[];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = items.map((m, i) => (
    <View key={m.label} style={[styles.cell, i > 0 && styles.cellBorder]}>
      <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
        {m.label}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {m.value}
      </Text>
      {m.hint ? (
        <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {m.hint}
        </Text>
      ) : null}
    </View>
  ));
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.strip, pressed && { backgroundColor: colors.surfacePressed }, style]}>
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.strip, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.xs,
  },
  cell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: space.md,
    gap: 2,
    minWidth: 0,
  },
  cellBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  value: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: colors.text,
  },
});
