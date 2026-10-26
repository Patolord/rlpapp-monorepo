import { ChevronRight } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius, space, tone as toneColors, type Tone } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Primitivas do app de campo. Regra: alvos grandes (≥ 64 px), uma linha de
// texto por item, uma ação principal por tela. Quem usa está de pé, no sol,
// às vezes de luva, e não lê subtítulos.
// ---------------------------------------------------------------------------

/** Botão grande de ação. `hero` é o Escanear da obra. */
export function BigAction({
  label,
  hint,
  icon,
  onPress,
  variant = "primary",
  size = "lg",
  disabled,
  style,
}: {
  label: string;
  /** Uma linha curta abaixo do rótulo (ex.: "Entrada 07:12"). */
  hint?: string | null;
  icon?: React.ReactNode;
  onPress?: () => void;
  variant?: "primary" | "outline" | "secondary" | "danger";
  size?: "hero" | "lg" | "md";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: colors.primary },
    outline: { bg: colors.surface, pressed: colors.surfacePressed, fg: colors.primary, border: colors.primary },
    secondary: { bg: colors.surface, pressed: colors.surfacePressed, fg: colors.text, border: colors.border },
    danger: { bg: colors.dangerSoft, pressed: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  const hero = size === "hero";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => [
        styles.action,
        hero ? styles.actionHero : size === "lg" ? styles.actionLg : styles.actionMd,
        {
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {icon}
      <View style={hero ? styles.actionTextHero : styles.actionText}>
        <Text style={[hero ? styles.labelHero : size === "lg" ? styles.labelLg : styles.labelMd, { color: palette.fg }]}>
          {label}
        </Text>
        {hint ? (
          <Text style={[styles.hint, { color: variant === "primary" ? palette.fg : colors.textSecondary }]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Bloco quadrado da grade da obra: ícone grande + uma palavra. */
export function BigTile({
  label,
  icon,
  badge,
  badgeTone = "danger",
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  /** Número que pede atenção (ex.: materiais zerados). */
  badge?: number;
  badgeTone?: Tone;
  onPress: () => void;
}) {
  const showBadge = badge !== undefined && badge > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `${label}, ${badge} para ver` : label}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: toneColors[badgeTone].fg }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {icon}
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Linha de lista grande: título em destaque, no máximo uma linha de apoio. */
export function BigRow({
  title,
  subtitle,
  trailing,
  onPress,
  highlight,
  style,
}: {
  title: string;
  subtitle?: string | null;
  /** Substitui a seta (ex.: um StatusPill). */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Obra recente: fundo azul. */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = highlight ? colors.onPrimary : colors.text;
  const sub = highlight ? colors.onPrimary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.row,
        highlight && styles.rowHighlight,
        pressed && { backgroundColor: highlight ? colors.primaryPressed : colors.surfacePressed },
        style,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: sub, opacity: highlight ? 0.85 : 1 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={26} color={highlight ? fg : colors.icon} strokeWidth={2.4} /> : null)}
    </Pressable>
  );
}

/** Estado em uma palavra, com cor (Ok / Atenção / Acabou). */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
  },
  actionHero: { height: 176, flexDirection: "column", borderRadius: 26 },
  actionLg: { minHeight: 88 },
  actionMd: { minHeight: 64, borderWidth: 1, borderRadius: radius.md },
  actionText: { flexShrink: 1 },
  actionTextHero: { alignItems: "center" },
  labelHero: { fontSize: 26, lineHeight: 32, fontWeight: "700" },
  labelLg: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  labelMd: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  hint: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  tile: {
    flex: 1,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileLabel: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.text },
  badge: {
    position: "absolute",
    top: space.md,
    right: space.md,
    minWidth: 32,
    height: 32,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 16, fontWeight: "700", color: colors.onPrimary },
  row: {
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowHighlight: { minHeight: 104, backgroundColor: colors.primary, borderColor: colors.primary },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  rowSubtitle: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  pillText: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
});
