import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, space, tone as toneColors, type, type Tone } from "@/lib/theme";

import { AppButton } from "./app-button";
import { Surface } from "./surface";

// ---------------------------------------------------------------------------
// EmptyState: icon in a soft circle, title, description, optional action.
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  tone: t = "info",
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const tc = toneColors[t];
  return (
    <Surface style={[styles.empty, style]}>
      {icon ? <View style={[styles.emptyIcon, { backgroundColor: tc.bg }]}>{icon}</View> : null}
      <Text style={[type.heading, styles.center, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[type.bodySm, styles.center, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} size="sm" style={{ marginTop: space.sm }} />
      ) : null}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// LoadingState: centered spinner with optional message.
// ---------------------------------------------------------------------------
export function LoadingState({ message, style }: { message?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loading, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? <Text style={[type.bodySm, { color: colors.textSecondary }]}>{message}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ErrorState: compact inline error with retry.
// ---------------------------------------------------------------------------
export function ErrorState({
  message = "Não foi possível carregar.",
  onRetry,
  style,
}: {
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Surface style={[styles.empty, style]}>
      <Text style={[type.bodyStrong, styles.center, { color: colors.danger }]}>{message}</Text>
      {onRetry ? <AppButton label="Tentar novamente" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: space.md,
    paddingVertical: 36,
    paddingHorizontal: space.xxl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  center: {
    textAlign: "center",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.xxl,
  },
});
