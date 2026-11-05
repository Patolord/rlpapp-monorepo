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

/**
 * RLP brand blue scale: a calm cobalt (hue 262, chroma ≤ 0.15 in oklch), chosen
 * in the 2026-11 design review over Tailwind's saturated blue-600. 600 is the
 * brand colour (= web `--primary`, oklch(0.47 0.15 262)), 700 its hover/pressed
 * state, 950 dark text/headings, 50/100 light surfaces and tints.
 */
export const brandBlue = {
  50: "#f0f5ff",
  100: "#e0ecff",
  200: "#c4daff",
  300: "#9bbeff",
  400: "#6f9df2",
  500: "#4777d2",
  600: "#2855ad",
  700: "#1a469d",
  800: "#153a83",
  900: "#102e6a",
  950: "#0a1f47",
} as const;

/**
 * Brand palette in hex (the canonical RLP identity).
 * White on `primary` has a 7.0:1 contrast ratio (WCAG AA for normal text).
 */
export const brand = {
  primary: brandBlue[600],
  primaryForeground: "#ffffff",
  /** Hover / pressed state of `primary`. */
  primaryHover: brandBlue[700],
  /** Light brand surface / tint (`primary` on it: 6.4:1). */
  primarySoft: brandBlue[50],
  secondary: "#f4f4f5",
  secondaryForeground: brandBlue[950],
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
  ring: brandBlue[600],
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
  /** Lighter blue in dark mode so the focus ring reads on dark surfaces. */
  ring: brandBlue[400],
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

/**
 * Status dot colors (design review 2026-11-01): status badges are a neutral
 * outline pill and the status color appears only on a 6px dot.
 * Web mirrors these as `--status-<key>` CSS variables (oklch).
 */
export const statusDotColors = {
  light: {
    neutral: "#6e7279",
    info: "#3e6dc8",
    success: "#0e9254",
    warning: "#d98b09",
    danger: "#cc2827",
    muted: "#acaeb1",
  },
} as const;

export type SemanticColors = typeof semanticLight;
export type StatusColorKey = keyof typeof statusColors;

export const colors = {
  brand,
  brandBlue,
  light: semanticLight,
  dark: semanticDark,
  status: statusColors,
  statusDot: statusDotColors,
} as const;
