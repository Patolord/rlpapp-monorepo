import type { StatusColorKey } from "./colors";

/**
 * Semantic variant names exposed by Badge/StatusBadge components.
 * Domain status maps consume these instead of embedding raw color classes.
 */
export type StatusVariant = StatusColorKey;

/**
 * Maps equipment domain statuses to semantic variants.
 * Keep in sync with `lib/equipment-status` in web and native apps.
 */
export const equipmentStatusVariants = {
  installing: "info",
  operational: "success",
  warning: "warning",
  error: "danger",
} as const satisfies Record<string, StatusVariant>;

export type EquipmentStatusKey = keyof typeof equipmentStatusVariants;

/**
 * Maps QR link state to a semantic variant.
 */
export const linkStatusVariants = {
  linked: "info",
  free: "muted",
} as const satisfies Record<string, StatusVariant>;
