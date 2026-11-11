import { ChevronRight } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, control, radius, shadow, space, tone as toneColors, type, type Tone } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Surface: o cartão do design system (branco, borda, raio 12, shadow-xs).
// Vira botão quando recebe `onPress`.
// ---------------------------------------------------------------------------
export function Surface({
  children,
  onPress,
  padded = true,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.surface,
          padded && styles.padded,
          pressed && { backgroundColor: colors.surfacePressed },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.surface, padded && styles.padded, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// ListRow: ícone num círculo suave, título, subtítulo, meta e final opcional.
// Altura mínima de 56. É a unidade de toda lista.
// ---------------------------------------------------------------------------
export function ListRow({
  icon,
  iconTone = "info",
  title,
  subtitle,
  meta,
  trailing,
  onPress,
  chevron = true,
  style,
}: {
  icon?: React.ReactNode;
  iconTone?: Tone;
  title: string;
  subtitle?: string | null;
  /** Small right-aligned text above the chevron (date, amount...). */
  meta?: string | null;
  /** Replaces the chevron (e.g. a Pill). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = toneColors[iconTone];
  return (
    <Surface onPress={onPress} style={[styles.row, style]} padded={false}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>{icon}</View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        trailing
      ) : (
        <View style={styles.rowEnd}>
          {meta ? (
            <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {chevron && onPress ? <ChevronRight size={20} color={colors.icon} /> : null}
        </View>
      )}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// StatTile: número grande com rótulo pequeno (resumos do Início e do hub).
// ---------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone: t = "info",
  onPress,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tc = toneColors[t];
  return (
    <Surface onPress={onPress} style={[styles.stat, style]}>
      <View style={styles.statTop}>
        <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <View style={[styles.statIcon, { backgroundColor: tc.bg }]}>{icon}</View> : null}
      </View>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Pill (StatusBadge do design system): pílula branca com contorno, ponto de
// 6px na cor do status e rótulo em preto. Sem `tone` (ou `dot={false}`), só o
// contorno. O sentido vem do rótulo, não da cor.
// ---------------------------------------------------------------------------
export function Pill({
  label,
  tone: t = "neutral",
  icon,
  dot = true,
  style,
}: {
  label: string;
  tone?: Tone;
  icon?: React.ReactNode;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tc = toneColors[t];
  return (
    <View style={[styles.pill, style]} accessibilityLabel={label}>
      {icon ? icon : dot ? <View style={[styles.pillDot, { backgroundColor: tc.dot }]} /> : null}
      <Text style={[type.caption, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Mesmo componente com o nome do design system. */
export const StatusBadge = Pill;

// ---------------------------------------------------------------------------
// Divider: hairline between stacked rows inside one Surface.
// ---------------------------------------------------------------------------
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.xs,
  },
  padded: {
    padding: space.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: control.row,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  stat: {
    flex: 1,
    gap: 6,
    minWidth: 140,
  },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 3,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
