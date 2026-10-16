import { X } from "lucide-react-native";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space, type } from "@/lib/theme";

import { IconButton } from "./screen";

// ---------------------------------------------------------------------------
// Sheet: bottom sheet for forms and details (the native counterpart of the
// web Dialog/Sheet). Scrolls its content and keeps inputs above the keyboard.
// ---------------------------------------------------------------------------
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  /** Fraction of the screen height the sheet may grow to (default 0.92). */
  maxHeight = 0.92,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: number;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdropWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
        <View style={[styles.sheet, { maxHeight: height * maxHeight, paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.heading, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[type.bodySm, { color: colors.textSecondary }]} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton
              label="Fechar"
              onPress={onClose}
              size={36}
              icon={<X size={18} color={colors.text} strokeWidth={2} />}
            />
          </View>
          <KeyboardAwareScrollView
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {children}
          </KeyboardAwareScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
    marginBottom: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.screen,
    paddingBottom: space.lg,
  },
  content: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.xl,
  },
  footer: {
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    gap: space.md,
  },
});
