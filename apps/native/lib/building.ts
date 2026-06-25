import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";
import type { EquipmentStatus } from "@/lib/equipment-status";

export type GridItem = {
  _id: Id<"projectEquipment">;
  system: string;
  ambiente: string;
  kind: "condensadora" | "evaporadora";
  modelo: string;
  capacidade: string;
  status: EquipmentStatus;
  obs: string | null;
  deadline: number | null;
  linkedEquipmentId: Id<"equipment"> | null;
  token: string | null;
  installedAt: number | null;
};

export type GridUnit = {
  _id: Id<"projectUnits">;
  floor: number;
  final: number;
  label: string;
  type: "vrf" | "split";
  floorSpan: number;
  deadline: number | null;
  equipment: GridItem[];
};

export type GridFloor = { number: number; label: string };

export type UnitLevel = "complete" | "partial" | "pending" | "empty";

export type UnitState = {
  total: number;
  installed: number;
  level: UnitLevel;
  overdue: boolean;
};

export function unitDeadline(unit: GridUnit): number | null {
  const deadlines = [
    unit.deadline,
    ...unit.equipment.map((e) => e.deadline),
  ].filter((d): d is number => typeof d === "number");
  if (deadlines.length === 0) return null;
  return Math.min(...deadlines);
}

export function getUnitState(unit: GridUnit, now: number): UnitState {
  const total = unit.equipment.length;
  const installed = unit.equipment.filter(
    (e) => e.status === "operational"
  ).length;

  let level: UnitLevel;
  if (total === 0) level = "empty";
  else if (installed === 0) level = "pending";
  else if (installed === total) level = "complete";
  else level = "partial";

  const deadline = unitDeadline(unit);
  const overdue = level !== "complete" && deadline !== null && deadline < now;

  return { total, installed, level, overdue };
}

/** Cores por estado da unidade (mobile). */
export const UNIT_STATE_STYLES: Record<
  UnitLevel | "overdue",
  { cell: string; tagBg: string; tagText: string; label: string }
> = {
  complete: {
    cell: "border-green-500 bg-green-50",
    tagBg: "bg-green-600",
    tagText: "text-white",
    label: "Concluído",
  },
  partial: {
    cell: "border-amber-400 bg-amber-50",
    tagBg: "bg-amber-500",
    tagText: "text-white",
    label: "Parcial",
  },
  pending: {
    cell: "border-red-400 bg-red-50",
    tagBg: "bg-red-500",
    tagText: "text-white",
    label: "Pendente",
  },
  empty: {
    cell: "border-border bg-muted/40",
    tagBg: "bg-muted",
    tagText: "text-muted-foreground",
    label: "Vazio",
  },
  overdue: {
    cell: "border-red-600 bg-red-100",
    tagBg: "bg-red-700",
    tagText: "text-white",
    label: "Em atraso",
  },
};

export const TYPE_LABELS: Record<GridUnit["type"], string> = {
  vrf: "VRF",
  split: "Split",
};
