import { colors } from "@/lib/theme";

// Legacy accessor kept for screens that have not been migrated to `@/lib/theme`
// yet. Values mirror the theme so old and new screens share one canvas.
export const COLORS = {
  background: colors.bg,
  foreground: colors.text,
} as const;
