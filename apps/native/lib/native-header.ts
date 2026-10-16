import { COLORS } from "@/lib/colors";

/** Opções de header nativo alinhadas à paleta clara do app. */
export function useNativeHeaderOptions() {
  return {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: COLORS.background },
    headerTintColor: COLORS.foreground,
    headerTitleStyle: { color: COLORS.foreground },
    contentStyle: { backgroundColor: COLORS.background },
  };
}
