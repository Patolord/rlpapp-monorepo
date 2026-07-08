import type { Id } from "@rlpapp/backend/convex/_generated/dataModel";

export type EquipmentStatus =
  | "installing"
  | "operational"
  | "warning"
  | "error";

export type HierarchyItem = {
  _id: Id<"projectEquipment">;
  system: string;
  systemId: Id<"systems"> | null;
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
  /** Coluna explícita (1-based) na matriz; null = auto-posiciona pela ordem. */
  col: number | null;
  /** Largura em colunas (null = 1). */
  colSpan: number | null;
  /** Altura em andares a partir do andar-base, para cima (null = 1). */
  rowSpan: number | null;
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

/** Sistema da obra (ex: "VRF 1"), com contagens agregadas de equipamentos. */
export type HierarchySystem = {
  _id: Id<"systems">;
  name: string;
  type: string | null;
  totalItems: number;
  installedItems: number;
};

export type ProjectHierarchy = {
  _id: Id<"projects">;
  name: string;
  systems: HierarchySystem[];
  towers: HierarchyTower[];
};

// --- Layout esquemático da matriz do prédio ---

/** Célula posicionada na matriz (coordenadas 1-based; linha 1 = andar do topo). */
export type MatrixCell = {
  env: HierarchyEnvironment;
  /** Andar-base (o mais baixo que a célula ocupa). */
  floor: HierarchyFloor;
  /** Rótulo do andar mais alto ocupado (null quando rowSpan = 1). */
  topFloorLabel: string | null;
  /** Linha do grid onde a célula começa (a mais alta que ela ocupa). */
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
};

export type MatrixLayout = {
  /** Andares ordenados do topo para a base; o andar i ocupa a linha i+1. */
  floors: HierarchyFloor[];
  /** Total de colunas da matriz. */
  cols: number;
  cells: MatrixCell[];
  /** Posições não cobertas por nenhuma célula (buracos do recorte do prédio). */
  emptySlots: { row: number; col: number }[];
};

/**
 * Resolve o layout esquemático de uma torre: honra `col` explícito quando o
 * espaço está livre (senão desloca para a próxima coluna livre), auto-empacota
 * ambientes sem coluna e limita `rowSpan` aos andares que existem acima do
 * andar-base. Dados conflitantes degradam de forma previsível, sem sobrepor.
 */
export function resolveMatrixLayout(tower: HierarchyTower): MatrixLayout {
  const floors = tower.floors.slice().sort((a, b) => b.number - a.number);
  const rowByFloorId = new Map<string, number>();
  floors.forEach((floor, idx) => rowByFloorId.set(floor._id, idx + 1));

  const occupied = new Set<string>();
  const cells: MatrixCell[] = [];

  const rectCells = (
    baseRow: number,
    col: number,
    rowSpan: number,
    colSpan: number
  ): string[] => {
    const keys: string[] = [];
    for (let r = baseRow - rowSpan + 1; r <= baseRow; r++) {
      for (let c = col; c < col + colSpan; c++) {
        keys.push(`${r}:${c}`);
      }
    }
    return keys;
  };

  const place = (
    env: HierarchyEnvironment,
    floor: HierarchyFloor,
    startCol: number
  ) => {
    const baseRow = rowByFloorId.get(floor._id)!;
    // O span sobe a partir do andar-base; não pode passar do topo da torre.
    const rowSpan = Math.min(Math.max(env.rowSpan ?? 1, 1), baseRow);
    const colSpan = Math.max(env.colSpan ?? 1, 1);

    let col = Math.max(startCol, 1);
    while (rectCells(baseRow, col, rowSpan, colSpan).some((k) => occupied.has(k))) {
      col++;
    }
    for (const key of rectCells(baseRow, col, rowSpan, colSpan)) {
      occupied.add(key);
    }
    const topRow = baseRow - rowSpan + 1;
    cells.push({
      env,
      floor,
      topFloorLabel: rowSpan > 1 ? floors[topRow - 1].label : null,
      row: topRow,
      col,
      rowSpan,
      colSpan,
    });
  };

  // Andares processados de baixo para cima: spans sobem a partir do
  // andar-base e precisam reservar as células dos andares acima antes que
  // esses andares se auto-empacotem.
  const bottomUp = floors.slice().reverse();

  // Passo 1: colunas explícitas primeiro, para os automáticos fluírem ao redor.
  for (const floor of bottomUp) {
    const explicit = floor.environments
      .filter((e) => e.col !== null)
      .sort((a, b) => a.order - b.order);
    for (const env of explicit) place(env, floor, env.col!);
  }

  // Passo 2: auto-empacota os demais na primeira coluna livre do andar.
  for (const floor of bottomUp) {
    const auto = floor.environments
      .filter((e) => e.col === null)
      .sort((a, b) => a.order - b.order);
    for (const env of auto) place(env, floor, 1);
  }

  const cols = Math.max(
    1,
    ...cells.map((cell) => cell.col + cell.colSpan - 1)
  );

  const emptySlots: { row: number; col: number }[] = [];
  for (let r = 1; r <= floors.length; r++) {
    for (let c = 1; c <= cols; c++) {
      if (!occupied.has(`${r}:${c}`)) emptySlots.push({ row: r, col: c });
    }
  }

  return { floors, cols, cells, emptySlots };
}

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
