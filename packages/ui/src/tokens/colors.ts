/**
 * Shared color tokens for the RLP design system.
 *
 * These are the single source of truth for brand and semantic colors across
 * web (CSS variables / Tailwind) and native (NativeWind / runtime styles).
 *
 * Web consumes these via CSS variables declared in `apps/web/src/index.css`.
 * Native consumes the hex values via `apps/native/tailwind.config.js` and
 * `apps/native/lib/colors.ts`.
 */

/** Brand palette in hex (the canonical RLP identity). */
export const brand = {
  primary: "#3a16d9",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  secondaryForeground: "#1a1a2e",
} as const;

/**
 * Semantic surface/text colors for the app theme (light mode).
 * Native uses these hex values directly; web mirrors them as oklch.
 */
export const semanticLight = {
  background: "#e5e5f2",
  foreground: "#0a0a0f",
  card: "#ffffff",
  cardForeground: "#0a0a0f",
  muted: "#f4f4f5",
  mutedForeground: "#737373",
  border: "#e5e5e5",
  input: "#e5e5e5",
  ring: "#3a16d9",
} as const;

/** Semantic surface/text colors for dark mode. */
export const semanticDark = {
  background: "#121924",
  foreground: "#fafafa",
  card: "#1c1c28",
  cardForeground: "#fafafa",
  muted: "#262633",
  mutedForeground: "#a1a1aa",
  border: "#2a2a3a",
  input: "#2a2a3a",
  ring: "#6b4ee6",
} as const;

/**
 * Status colors used by semantic badges and status indicators.
 * Each status maps to a soft background + readable foreground (light mode).
 */
export const statusColors = {
  neutral: { bg: "#f4f4f5", fg: "#3f3f46", border: "#e4e4e7" },
  info: { bg: "#dbeafe", fg: "#1e40af", border: "#bfdbfe" },
  success: { bg: "#dcfce7", fg: "#166534", border: "#bbf7d0" },
  warning: { bg: "#fef9c3", fg: "#854d0e", border: "#fef08a" },
  danger: { bg: "#fee2e2", fg: "#991b1b", border: "#fecaca" },
  muted: { bg: "#fafafa", fg: "#71717a", border: "#e5e7eb" },
} as const;

export type SemanticColors = typeof semanticLight;
export type StatusColorKey = keyof typeof statusColors;

export const colors = {
  brand,
  light: semanticLight,
  dark: semanticDark,
  status: statusColors,
} as const;
