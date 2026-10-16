import { ArrowRight } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, control, radius, space } from "@/lib/theme";

// ---------------------------------------------------------------------------
// AppButton: the product's button. `primary` is the wide blue bar with the
// label on the left and an arrow on the right (as on the login screen).
// `secondary` is white with a border, `ghost` is text-only, `danger` is red.
// ---------------------------------------------------------------------------
export type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** lg = 58 (forms / login); md = 52 (default); sm = 44 (inline actions). */
  size?: "lg" | "md" | "sm";
  /** Leading icon. */
  icon?: React.ReactNode;
  /** Trailing slot; defaults to an arrow on primary. Pass `null` to hide. */
  trailing?: React.ReactNode | null;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  trailing,
  loading,
  disabled,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const height = size === "lg" ? control.heightLg : size === "md" ? control.height : control.heightSm;
  const fontSize = size === "lg" ? 22 : size === "md" ? 17 : 15;
  const iconSize = size === "lg" ? 26 : size === "md" ? 22 : 18;

  const palette = {
    primary: { bg: colors.primary, bgPressed: colors.primaryPressed, fg: colors.onPrimary, border: "transparent" },
    secondary: { bg: colors.surface, bgPressed: colors.surfacePressed, fg: colors.text, border: colors.border },
    ghost: { bg: "transparent", bgPressed: colors.surfaceMuted, fg: colors.primary, border: "transparent" },
    danger: { bg: colors.danger, bgPressed: "#B0362A", fg: colors.onPrimary, border: "transparent" },
  }[variant];

  const trailingNode =
    trailing === undefined && variant === "primary" ? (
      <ArrowRight size={iconSize} color={palette.fg} strokeWidth={2.2} />
    ) : (
      trailing
    );

  const spread = variant === "primary" && size !== "sm";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === "sm" ? space.lg : spread ? 28 : space.xl,
          backgroundColor: pressed ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === "secondary" ? 1 : 0,
          opacity: isDisabled ? 0.6 : 1,
          justifyContent: spread ? "space-between" : "center",
        },
        style,
      ]}
    >
      <View style={styles.leading}>
        {loading ? <ActivityIndicator color={palette.fg} /> : icon}
        <Text style={[styles.label, { color: palette.fg, fontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {trailingNode ? <View style={!spread && { marginLeft: space.sm }}>{trailingNode}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    flexShrink: 1,
  },
  label: {
    fontWeight: "500",
  },
});
