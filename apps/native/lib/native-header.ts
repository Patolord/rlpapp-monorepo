import { colors, type } from "@/lib/theme";

/** Opções de header nativo no visual do design system. */
export function useNativeHeaderOptions() {
  return {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerTitleStyle: { color: colors.text, fontSize: type.heading.fontSize, fontWeight: "600" as const },
    headerBackButtonDisplayMode: "minimal" as const,
    contentStyle: { backgroundColor: colors.bg },
  };
}
