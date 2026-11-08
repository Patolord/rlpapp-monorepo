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

import { colors, control, radius, shadow, space } from "@/lib/theme";

// ---------------------------------------------------------------------------
// AppButton: o botão do design system.
// - primary: azul cheio. Um por tela.
// - secondary: contorno branco (o "outline" do design system).
// - ghost: só texto azul (o "link").
// - danger: ação destrutiva em contorno, texto vermelho (nunca vermelho cheio).
// Tamanhos: lg e md = 48 (padrão do celular), sm = 40 (dentro de cartão).
// ---------------------------------------------------------------------------
export type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "lg" | "md" | "sm";
  /** Ícone antes do texto. */
  icon?: React.ReactNode;
  /** Ícone depois do texto. */
  trailing?: React.ReactNode | null;
  loading?: boolean;
  /** Texto enquanto carrega (padrão: o próprio rótulo). Ex.: "Enviando…". */
  loadingLabel?: string;
  disabled?: boolean;
  /** Ocupa a largura toda. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  trailing,
  loading,
  loadingLabel,
  disabled,
  block,
  style,
  accessibilityLabel,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const height = size === "sm" ? control.heightSm : control.height;
  const fontSize = size === "sm" ? 14 : 16;

  const palette = {
    primary: { bg: colors.primary, bgPressed: colors.primaryPressed, fg: colors.onPrimary, border: "transparent" },
    secondary: { bg: colors.surface, bgPressed: colors.surfacePressed, fg: colors.text, border: colors.controlBorder },
    ghost: { bg: "transparent", bgPressed: colors.surfaceMuted, fg: colors.primary, border: "transparent" },
    danger: { bg: colors.surface, bgPressed: colors.dangerSoft, fg: colors.destructive, border: colors.controlBorder },
  }[variant];

  const disabledLook = disabled && !loading;
  const fg = disabledLook ? colors.controlDisabledText : palette.fg;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        variant !== "ghost" && !disabledLook ? shadow.xs : null,
        {
          height,
          paddingHorizontal: size === "sm" ? 14 : 18,
          backgroundColor: disabledLook ? colors.controlDisabled : pressed ? palette.bgPressed : palette.bg,
          borderColor: disabledLook ? "transparent" : palette.border,
          borderWidth: palette.border === "transparent" ? 0 : 1,
          alignSelf: block ? "stretch" : undefined,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
        <Text style={[styles.label, { color: fg, fontSize }]} numberOfLines={1}>
          {loading && loadingLabel ? loadingLabel : label}
        </Text>
        {!loading && trailing ? trailing : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    flexShrink: 1,
  },
  label: {
    fontWeight: "500",
    letterSpacing: -0.1,
  },
});
