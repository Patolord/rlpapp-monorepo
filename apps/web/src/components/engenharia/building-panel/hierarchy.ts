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

/**
 * Retângulo extra de um ambiente não-retangular (ex: forma em "L").
 * Posições relativas ao retângulo principal: `colOffset` em colunas (0 =
 * mesma coluna, pode ser negativo) e `rowOffset` em andares acima do
 * andar-base (0 = mesmo andar).
 */
export type EnvironmentSegment = {
  colOffset: number;
  colSpan: number | null;
  rowOffset: number | null;
  rowSpan: number | null;
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
  /** Retângulos extras de regiões não-retangulares (null = retângulo único). */
  segments: EnvironmentSegment[] | null;
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
  /** Rótulo do andar mais alto ocupado pela forma (null quando ocupa 1 andar). */
  topFloorLabel: string | null;
  /** Linha do grid onde a célula começa (a mais alta que ela ocupa). */
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** Índice do retângulo na forma do ambiente (0 = principal, com conteúdo). */
  segmentIndex: number;
  /** Total de andares que a forma inteira ocupa (badge duplex/triplex). */
  shapeRowSpan: number;
  /** Lados encostados em outro retângulo do mesmo ambiente (render unido). */
  flushTop: boolean;
  flushRight: boolean;
  flushBottom: boolean;
  flushLeft: boolean;
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

/** Retângulo da forma de um ambiente, em linhas absolutas do grid. */
type ShapeRect = {
  colOffset: number;
  colSpan: number;
  /** Linha do topo do retângulo (1 = andar mais alto da torre). */
  top: number;
  /** Linha da base do retângulo. */
  bottom: number;
};

/**
 * Retângulos que compõem a forma do ambiente (principal + segmentos extras),
 * com linhas resolvidas a partir do andar-base e limitadas à torre.
 */
function resolveShapeRects(
  env: HierarchyEnvironment,
  baseRow: number
): ShapeRect[] {
  const raw = [
    {
      colOffset: 0,
      colSpan: Math.max(env.colSpan ?? 1, 1),
      rowOffset: 0,
      rowSpan: Math.max(env.rowSpan ?? 1, 1),
    },
    ...(env.segments ?? []).map((seg) => ({
      colOffset: seg.colOffset,
      colSpan: Math.max(seg.colSpan ?? 1, 1),
      rowOffset: Math.max(seg.rowOffset ?? 0, 0),
      rowSpan: Math.max(seg.rowSpan ?? 1, 1),
    })),
  ];

  const rects: ShapeRect[] = [];
  for (const r of raw) {
    const bottom = baseRow - r.rowOffset;
    // Segmento inteiro acima do topo da torre: descartado.
    if (bottom < 1) continue;
    rects.push({
      colOffset: r.colOffset,
      colSpan: r.colSpan,
      top: Math.max(1, bottom - r.rowSpan + 1),
      bottom,
    });
  }
  return rects;
}

/**
 * Resolve o layout esquemático de uma torre: honra `col` explícito quando o
 * espaço está livre (senão desloca para a próxima coluna livre), auto-empacota
 * ambientes sem coluna e limita `rowSpan` aos andares que existem acima do
 * andar-base. Formas não-retangulares (segmentos extras) são posicionadas como
 * um bloco único. Dados conflitantes degradam de forma previsível, sem sobrepor.
 */
export function resolveMatrixLayout(tower: HierarchyTower): MatrixLayout {
  const floors = tower.floors.slice().sort((a, b) => b.number - a.number);
  const rowByFloorId = new Map<string, number>();
  floors.forEach((floor, idx) => rowByFloorId.set(floor._id, idx + 1));

  const occupied = new Set<string>();
  const cells: MatrixCell[] = [];

  const place = (
    env: HierarchyEnvironment,
    floor: HierarchyFloor,
    startCol: number
  ) => {
    const baseRow = rowByFloorId.get(floor._id)!;
    const rects = resolveShapeRects(env, baseRow);
    if (rects.length === 0) return;

    const shapeKeys = (anchor: number): Set<string> => {
      const keys = new Set<string>();
      for (const r of rects) {
        for (let row = r.top; row <= r.bottom; row++) {
          const left = anchor + r.colOffset;
          for (let c = left; c < left + r.colSpan; c++) {
            keys.add(`${row}:${c}`);
          }
        }
      }
      return keys;
    };

    // Segmentos podem estender a forma para a esquerda; a âncora precisa
    // garantir que toda a forma fique em colunas >= 1.
    const minColOffset = Math.min(...rects.map((r) => r.colOffset));
    let col = Math.max(startCol, 1, 1 - minColOffset);
    while ([...shapeKeys(col)].some((k) => occupied.has(k))) {
      col++;
    }
    const keys = shapeKeys(col);
    for (const key of keys) occupied.add(key);

    const shapeTopRow = Math.min(...rects.map((r) => r.top));
    const shapeRowSpan = baseRow - shapeTopRow + 1;

    rects.forEach((r, idx) => {
      const left = col + r.colOffset;
      const right = left + r.colSpan - 1;
      const inShape = (row: number, c: number) => keys.has(`${row}:${c}`);

      let flushTop = false;
      let flushBottom = false;
      for (let c = left; c <= right; c++) {
        if (inShape(r.top - 1, c)) flushTop = true;
        if (inShape(r.bottom + 1, c)) flushBottom = true;
      }
      let flushLeft = false;
      let flushRight = false;
      for (let row = r.top; row <= r.bottom; row++) {
        if (inShape(row, left - 1)) flushLeft = true;
        if (inShape(row, right + 1)) flushRight = true;
      }

      cells.push({
        env,
        floor,
        topFloorLabel:
          idx === 0 && shapeTopRow < baseRow
            ? floors[shapeTopRow - 1].label
            : null,
        row: r.top,
        col: left,
        rowSpan: r.bottom - r.top + 1,
        colSpan: r.colSpan,
        segmentIndex: idx,
        shapeRowSpan,
        flushTop,
        flushRight,
        flushBottom,
        flushLeft,
      });
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

/**
 * Quantos andares a forma do ambiente ocupa a partir do andar-base
 * (considerando o retângulo principal e os segmentos extras).
 */
export function environmentShapeRowSpan(env: HierarchyEnvironment): number {
  return Math.max(
    env.rowSpan ?? 1,
    1,
    ...(env.segments ?? []).map(
      (seg) => (seg.rowOffset ?? 0) + Math.max(seg.rowSpan ?? 1, 1)
    )
  );
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
