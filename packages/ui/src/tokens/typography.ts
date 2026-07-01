/**
 * Shared typography roles. Font families differ per app (web uses EB Garamond,
 * landing uses Playfair) so only the role scale and weights are centralized.
 */

export const fontSize = {
  caption: 12,
  label: 13,
  body: 14,
  subtitle: 16,
  title: 18,
  heading: 20,
  display: 24,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const typography = {
  fontSize,
  fontWeight,
} as const;

export type FontSizeKey = keyof typeof fontSize;
export type FontWeightKey = keyof typeof fontWeight;
