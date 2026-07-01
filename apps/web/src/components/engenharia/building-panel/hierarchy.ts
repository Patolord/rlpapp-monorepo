import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export type EquipmentStatus =
  | "installing"
  | "operational"
  | "warning"
  | "error";

export type HierarchyItem = {
  _id: Id<"projectEquipment">;
  system: string;
  ambiente: string;
  kind: "condensadora" | "evaporadora";
  modelo: string;
  capacidade: string;
  status: EquipmentStatus;
  serialNumber: string | null;
  deadline: number | null;
  linkedEquipmentId: Id<"equipment"> | null;
  token: string | null;
  installedAt: number | null;
  installationDate: number | null;
  testDate: number | null;
};

export type HierarchyEnvironment = {
  _id: Id<"environments">;
  name: string;
  type: string | null;
  order: number;
  equipment: HierarchyItem[];
};

export type HierarchyFloor = {
  _id: Id<"floors">;
  number: number;
  label: string;
  environments: HierarchyEnvironment[];
  totalItems: number;
  installedItems: number;
};

export type HierarchyTower = {
  _id: Id<"towers">;
  name: string;
  order: number;
  floors: HierarchyFloor[];
};

export type ProjectHierarchy = {
  _id: Id<"projects">;
  name: string;
  towers: HierarchyTower[];
};

/** Estado agregado de um andar (para colorir a grade). */
export type FloorLevel = "complete" | "partial" | "pending" | "empty";

export type FloorState = {
  total: number;
  installed: number;
  level: FloorLevel;
  overdue: boolean;
};

/** O prazo mais cedo entre os equipamentos de um andar. */
function floorDeadline(floor: HierarchyFloor): number | null {
  const deadlines = floor.environments
    .flatMap((env) => env.equipment.map((e) => e.deadline))
    .filter((d): d is number => typeof d === "number");
  if (deadlines.length === 0) return null;
  return Math.min(...deadlines);
}

export function getFloorState(floor: HierarchyFloor, now: number): FloorState {
  const total = floor.totalItems;
  const installed = floor.installedItems;

  let level: FloorLevel;
  if (total === 0) level = "empty";
  else if (installed === 0) level = "pending";
  else if (installed >= total) level = "complete";
  else level = "partial";

  const deadline = floorDeadline(floor);
  const overdue =
    level !== "complete" && deadline !== null && deadline < now;

  return { total, installed, level, overdue };
}

/** O prazo mais cedo entre os equipamentos de um ambiente. */
function environmentDeadline(env: HierarchyEnvironment): number | null {
  const deadlines = env.equipment
    .map((e) => e.deadline)
    .filter((d): d is number => typeof d === "number");
  if (deadlines.length === 0) return null;
  return Math.min(...deadlines);
}

/** Estado agregado de um ambiente (célula da matriz de prédio). */
export function getEnvironmentState(
  env: HierarchyEnvironment,
  now: number
): FloorState {
  const total = env.equipment.length;
  const installed = env.equipment.filter(
    (e) => e.status === "operational"
  ).length;

  let level: FloorLevel;
  if (total === 0) level = "empty";
  else if (installed === 0) level = "pending";
  else if (installed >= total) level = "complete";
  else level = "partial";

  const deadline = environmentDeadline(env);
  const overdue =
    level !== "complete" && deadline !== null && deadline < now;

  return { total, installed, level, overdue };
}

/** Estilos de cor por estado do andar (🟩 🟨 🟥 ⬜). */
export const FLOOR_STATE_STYLES: Record<
  FloorLevel | "overdue",
  { cell: string; dot: string; label: string }
> = {
  complete: {
    cell: "border-green-500 bg-green-50 hover:bg-green-100 text-green-900",
    dot: "bg-green-600",
    label: "Concluído",
  },
  partial: {
    cell: "border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900",
    dot: "bg-amber-500",
    label: "Em andamento",
  },
  pending: {
    cell: "border-muted-foreground/30 bg-muted/40 hover:bg-muted/60 text-foreground",
    dot: "bg-muted-foreground/50",
    label: "Não iniciado",
  },
  empty: {
    cell: "border-dashed border-muted-foreground/30 bg-muted/20 text-muted-foreground hover:bg-muted/40",
    dot: "bg-muted-foreground/30",
    label: "Vazio",
  },
  overdue: {
    cell: "border-red-600 bg-red-100 ring-2 ring-red-500/40 hover:bg-red-200 text-red-950",
    dot: "bg-red-600",
    label: "Atrasado",
  },
};

/**
 * Estado visual de um equipamento individual:
 * ○ Não iniciado · 🟨 Instalação · 🟦 Teste · 🟩 Finalizado · 🟥 Atrasado.
 */
export type EquipmentVisualState =
  | "not_started"
  | "installing"
  | "testing"
  | "completed"
  | "overdue";

export function getEquipmentVisualState(
  item: HierarchyItem,
  now: number
): EquipmentVisualState {
  if (item.status === "operational") return "completed";
  if (item.status === "error") return "overdue";
  if (item.deadline !== null && item.deadline < now) return "overdue";
  if (item.status === "warning" || item.testDate !== null) return "testing";
  if (item.installationDate !== null || item.installedAt !== null)
    return "installing";
  return "not_started";
}

export const EQUIPMENT_VISUAL_STYLES: Record<
  EquipmentVisualState,
  { dot: string; label: string; text: string }
> = {
  not_started: {
    dot: "border-2 border-muted-foreground/40 bg-transparent",
    label: "Não iniciado",
    text: "text-muted-foreground",
  },
  installing: {
    dot: "bg-amber-500",
    label: "Instalação",
    text: "text-amber-700",
  },
  testing: {
    dot: "bg-blue-500",
    label: "Teste",
    text: "text-blue-700",
  },
  completed: {
    dot: "bg-green-600",
    label: "Finalizado",
    text: "text-green-700",
  },
  overdue: {
    dot: "bg-red-600",
    label: "Atrasado",
    text: "text-red-700",
  },
};
