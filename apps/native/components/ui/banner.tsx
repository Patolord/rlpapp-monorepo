import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, shadow, space, tone as toneColors, type, type Tone } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Banner: situação da tela que continua (sem conexão, sincronização com erro,
// avisos desligados). Cartão branco com borda; o ícone leva a cor do status e o
// texto fica em preto e cinza (A2 §7). Ação opcional à direita.
// ---------------------------------------------------------------------------
export function Banner({
  icon,
  title,
  detail,
  tone: t = "warning",
  actionLabel,
  onAction,
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tc = toneColors[t];
  return (
    <View style={[styles.banner, style]} accessibilityRole="summary">
      {icon ? <View style={styles.icon}>{icon}</View> : <View style={[styles.dot, { backgroundColor: tc.dot }]} />}
      <View style={styles.text}>
        <Text style={[type.label, styles.title]}>{title}</Text>
        {detail ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text style={[type.label, { color: colors.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...shadow.xs,
  },
  icon: { paddingTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: colors.text, fontWeight: "600" },
});
