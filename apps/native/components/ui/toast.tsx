import { AlertCircle, CheckCircle2, CloudOff, Info } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space, type } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Toast: short confirmation at the bottom of the screen. Mount <ToastProvider>
// once (root layout) and call `useToast()` anywhere.
// ---------------------------------------------------------------------------
/** `offline`: ação salva no aparelho, envia quando voltar o sinal (A2 §7). */
type Kind = "success" | "error" | "info" | "offline";
type ToastItem = { id: number; kind: Kind; message: string };

type ToastApi = {
  show: (message: string, kind?: Kind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  offline: (message?: string) => void;
};

const ToastContext = React.createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const show = React.useCallback((message: string, kind: Kind = "info") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { id, kind, message }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3000);
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      offline: (message) => show(message ?? "Salvo no aparelho. Envia quando voltar o sinal.", "offline"),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 72 }]}>
        {items.map((item) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.duration(180)}
            exiting={FadeOutDown.duration(160)}
            style={styles.toast}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {item.kind === "success" ? (
              <CheckCircle2 size={18} color="#FFFFFF" />
            ) : item.kind === "error" ? (
              <AlertCircle size={18} color="#FFFFFF" />
            ) : item.kind === "offline" ? (
              <CloudOff size={18} color="#FFFFFF" />
            ) : (
              <Info size={18} color="#FFFFFF" />
            )}
            <Text style={[type.bodySm, styles.text]} numberOfLines={3}>
              {item.message}
            </Text>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error("useToast deve ser usado dentro de <ToastProvider>");
  return api;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: space.screen,
    right: space.screen,
    gap: space.sm,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.toast,
    borderRadius: radius.menu,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    maxWidth: 520,
    ...(Platform.OS === "ios"
      ? { shadowColor: "#101828", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }
      : { elevation: 6 }),
  },
  text: {
    color: "#FFFFFF",
    flexShrink: 1,
  },
});
