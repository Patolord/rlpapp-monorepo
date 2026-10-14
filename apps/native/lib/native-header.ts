import { useAppTheme } from "@/contexts/app-theme-context";
import { COLORS } from "@/lib/colors";

/** Opções de header nativo alinhadas ao tema do app (claro/escuro). */
export function useNativeHeaderOptions() {
  const { isDark } = useAppTheme();
  const colors = isDark ? COLORS.dark : COLORS.light;
  return {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.foreground,
    headerTitleStyle: { color: colors.foreground },
    contentStyle: { backgroundColor: colors.background },
  };
}
