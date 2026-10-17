import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, type } from "@/lib/theme";

import { AppButton } from "./app-button";

// ---------------------------------------------------------------------------
// ConfirmDialog: centered confirmation for destructive / irreversible actions.
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Voltar",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
        <View style={styles.card}>
          <Text style={[type.heading, { color: colors.text }]}>{title}</Text>
          {description ? (
            <Text style={[type.bodySm, { color: colors.textSecondary }]}>{description}</Text>
          ) : null}
          <View style={styles.actions}>
            <AppButton label={cancelLabel} variant="secondary" size="sm" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
            <AppButton
              label={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              size="sm"
              trailing={null}
              onPress={onConfirm}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.screen,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xxl,
    gap: space.md,
  },
  actions: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.sm,
  },
});
