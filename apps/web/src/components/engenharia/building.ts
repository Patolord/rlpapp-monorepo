import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export type EquipmentStatus =
  | "installing"
  | "operational"
  | "warning"
  | "error";

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

export type UnitState = {
  total: number;
  installed: number;
  /** complete = tudo instalado; partial = parte; pending = nada; empty = sem itens. */
  level: "complete" | "partial" | "pending" | "empty";
  overdue: boolean;
};

/** O prazo efetivo de um apto: o do apto ou o item mais cedo. */
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

  let level: UnitState["level"];
  if (total === 0) level = "empty";
  else if (installed === 0) level = "pending";
  else if (installed === total) level = "complete";
  else level = "partial";

  const deadline = unitDeadline(unit);
  const overdue =
    level !== "complete" &&
    deadline !== null &&
    deadline < now;

  return { total, installed, level, overdue };
}

/** Classes de cor por estado da unidade (também usadas na legenda). */
export const UNIT_STATE_STYLES: Record<
  UnitState["level"] | "overdue",
  { cell: string; tag: string; label: string }
> = {
  complete: {
    cell: "border-green-500 bg-green-50 hover:bg-green-100 text-green-900",
    tag: "bg-green-600 text-white",
    label: "Concluído",
  },
  partial: {
    cell: "border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900",
    tag: "bg-amber-500 text-white",
    label: "Parcial",
  },
  pending: {
    cell: "border-red-400 bg-red-50 hover:bg-red-100 text-red-900",
    tag: "bg-red-500 text-white",
    label: "Pendente",
  },
  empty: {
    cell: "border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground hover:bg-muted/50",
    tag: "bg-muted text-muted-foreground",
    label: "Vazio",
  },
  overdue: {
    cell: "border-red-600 bg-red-100 ring-2 ring-red-500/40 hover:bg-red-200 text-red-950",
    tag: "bg-red-700 text-white",
    label: "Em atraso",
  },
};

export const TYPE_LABELS: Record<GridUnit["type"], string> = {
  vrf: "VRF",
  split: "Split",
};
