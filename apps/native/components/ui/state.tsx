import { AlertCircle } from "lucide-react-native";
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
      <Text style={[type.bodyStrong, styles.center, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {description ? (
        <Text style={[type.bodySm, styles.center, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} variant="secondary" size="sm" style={{ marginTop: space.xs }} />
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
  message = "Não deu para carregar. Confira a internet e tente de novo.",
  onRetry,
  style,
}: {
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Surface style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <AlertCircle size={24} color={colors.danger} strokeWidth={2} />
      </View>
      <Text style={[type.bodyStrong, styles.center, { color: colors.text }]}>Não deu para carregar</Text>
      <Text style={[type.bodySm, styles.center, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry ? <AppButton label="Tentar de novo" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
