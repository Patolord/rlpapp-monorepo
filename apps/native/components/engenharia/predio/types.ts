import type { api } from "@rlpapp/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

import type { EquipmentStatus } from "@/lib/equipment-status";
import type { Tone } from "@/lib/theme";

export type Hierarchy = NonNullable<FunctionReturnType<typeof api.projects.getHierarchy>>;
export type HierarchyTower = Hierarchy["towers"][number];
export type HierarchyFloor = HierarchyTower["floors"][number];
export type HierarchyEnvironment = HierarchyFloor["environments"][number];
export type HierarchyItem = HierarchyEnvironment["equipment"][number];
export type HierarchySystem = Hierarchy["systems"][number];

export type EquipKind = "condensadora" | "evaporadora";

export const KIND_LABELS: Record<EquipKind, string> = {
  condensadora: "Condensadora",
  evaporadora: "Evaporadora",
};

export const STATUS_TONE: Record<EquipmentStatus, Tone> = {
  installing: "info",
  operational: "success",
  warning: "warning",
  error: "danger",
};

/** Estado agregado de um conjunto de equipamentos. */
export function progressTone(installed: number, total: number): Tone {
  if (total === 0) return "neutral";
  if (installed >= total) return "success";
  if (installed > 0) return "info";
  return "warning";
}

export function progressLabel(installed: number, total: number): string {
  if (total === 0) return "Sem equipamentos";
  return `${installed}/${total} instalados`;
}

export function equipmentTitle(item: { modelo: string; capacidade: string; kind: EquipKind }): string {
  const parts = [item.modelo.trim(), item.capacidade.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : KIND_LABELS[item.kind];
}
