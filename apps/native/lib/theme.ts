import type { TextStyle } from "react-native";

import { BRAND } from "@/components/auth/brand";

// ---------------------------------------------------------------------------
// Design tokens for the native app.
//
// The palette is derived from the auth/launch screens (`components/auth/brand`)
// so every screen reads as one product: soft blue-white background, navy text,
// white surfaces with a thin cool border, and a single electric-blue accent.
// Use these tokens (not literal hex) in screens and components.
// ---------------------------------------------------------------------------

export const colors = {
  // Canvas
  bg: BRAND.bg,
  bgTint: BRAND.bgTint,
  // Surfaces
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3FA",
  surfacePressed: "#F3F7FC",
  border: BRAND.inputBorder,
  borderStrong: BRAND.line,
  divider: "#E6EDF7",
  // Text
  text: BRAND.title,
  textSecondary: BRAND.subtitle,
  textMuted: BRAND.placeholder,
  label: BRAND.label,
  icon: BRAND.icon,
  // Accent
  primary: BRAND.button,
  primaryPressed: "#1A469D",
  primarySoft: "#F0F5FF",
  onPrimary: BRAND.buttonText,
  navy: BRAND.logo,
  // Semantic tones
  success: "#1E8E5A",
  successSoft: "#DDF4E8",
  warning: "#B7791F",
  warningSoft: "#FBF0D6",
  danger: "#C8402E",
  dangerSoft: "#FBE3DF",
  info: BRAND.button,
  infoSoft: "#F0F5FF",
  // Misc
  track: BRAND.track,
  overlay: "rgba(27, 42, 94, 0.45)",
  focus: BRAND.inputBorderFocus,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** Horizontal screen gutter (matches the login form). */
  screen: 24,
} as const;

export const control = {
  /** Tall controls used on forms (login inputs/button). */
  heightLg: 58,
  /** Default control height on dense screens. */
  height: 52,
  heightSm: 44,
} as const;

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "500", letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "600", letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 24, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  bodySm: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.2 },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
} as const satisfies Record<string, TextStyle>;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const tone: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  info: { bg: colors.infoSoft, fg: colors.info },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export const theme = { colors, radius, space, control, type, tone } as const;
export type Theme = typeof theme;
