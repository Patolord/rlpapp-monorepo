import { ArrowLeft, Menu } from "lucide-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space, type } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Screen: the canvas every screen sits on. Handles background + safe-area.
// Pass `edges` to opt out of a safe-area edge when a parent layout already
// handles it (e.g. tab layouts pad the top themselves).
// ---------------------------------------------------------------------------
type Edge = "top" | "bottom";

export function Screen({
  children,
  edges = ["top"],
  style,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// IconButton: round, white, thin border — the back/menu/action affordance.
// ---------------------------------------------------------------------------
export function IconButton({
  icon,
  onPress,
  label,
  tone = "surface",
  size = 40,
  disabled,
  style,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  label: string;
  tone?: "surface" | "primary" | "ghost";
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === "primary" ? colors.primary : tone === "ghost" ? "transparent" : colors.surface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed && tone === "surface" ? colors.surfacePressed : bg,
          borderWidth: tone === "surface" ? 1 : 0,
          opacity: disabled ? 0.5 : pressed && tone !== "surface" ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// ScreenHeader: title + subtitle with an optional leading back/menu button and
// a trailing action slot. `large` renders the display title used on hubs.
// ---------------------------------------------------------------------------
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  onMenu,
  right,
  large,
  style,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onMenu?: () => void;
  right?: React.ReactNode;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const leading = onBack ? (
    <IconButton
      label="Voltar"
      onPress={onBack}
      icon={<ArrowLeft size={20} color={colors.text} strokeWidth={2} />}
    />
  ) : onMenu ? (
    <IconButton
      label="Abrir menu"
      onPress={onMenu}
      icon={<Menu size={20} color={colors.text} strokeWidth={2} />}
    />
  ) : null;

  return (
    <View style={[styles.header, style]}>
      {leading ? <View style={styles.headerLeading}>{leading}</View> : null}
      <View style={styles.headerText}>
        <Text style={[large ? type.title : type.heading, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SectionTitle: uppercase eyebrow that labels a group of content, with an
// optional trailing action ("Ver todos").
// ---------------------------------------------------------------------------
export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <Text style={[type.eyebrow, { color: colors.textSecondary }]}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[type.label, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.screen,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  headerLeading: {
    marginLeft: -4,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  section: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
});

export const screenStyles = {
  /** Default content gutter — use on FlatList/ScrollView contentContainerStyle. */
  content: {
    paddingHorizontal: space.screen,
    paddingBottom: space.xxl,
    gap: space.md,
  } satisfies ViewStyle,
  radius,
};
