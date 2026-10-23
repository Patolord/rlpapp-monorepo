import type { DuctSettings, DuctSpec } from "./ducts";
import type { Pt } from "./geom";
import type { Kind, PageScale, Unit } from "./units";

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  color: string;
  /** Section of the budget sheet (e.g. "Equipamentos", "Rede de Dutos", "Bocas de Ar"). */
  group: string;
  /** Unit price of material, project currency. */
  materialPrice: number;
  /** Unit price of labour (mão de obra), project currency. */
  laborPrice: number;
  /** Extra quantity percentage added to the measured quantity. */
  wastePct: number;
  /** Budget system (worksheet) the item belongs to; empty = the project system. */
  system?: string;
  /** Count-mark symbol id (see lib/symbols); undefined = plain dot. */
  symbol?: string;
  /** Multiplier on the measured quantity (2 for a cable that runs both ways); undefined = 1. */
  factor?: number;
  /** Quantity entered directly (not measured), added to the item's total. */
  manualQty?: number;
  /** Linear items: extra length (project units) added to the total for vertical runs. */
  vertical?: number;
  /** Unit label overriding the kind's (kg, gl, bd, l). */
  unit?: string;
  /** Id of the material in the company catalog this line was created from (or linked to). */
  catalogId?: string;
  /**
   * When the material price is from: the catalog quote's date, or the moment the user typed it.
   * The budget keeps this with the price so a proposal can be re-priced later and compared.
   */
  priceDate?: number;
  /** Where the material price came from; undefined for lines older than this field. */
  priceSource?: "catalog" | "manual" | "weight";
  /**
   * Priced by weight: key of the base material (see lib/weights) and kg per budget unit.
   * The material price is then derived from the project's price per kg and kept in sync.
   */
  baseMaterial?: string;
  kgPerUnit?: number;
  /** Manual position inside its group in the budget (see lib/budgetOrder); undefined = by name. */
  order?: number;
  /**
   * Item kept by the app: "duct" is a duct network ("Rede de dutos"), 1 cj whose material and
   * labour are recomputed from the duct runs drawn on it.
   */
  derived?: "duct";
}

export interface PageMeta {
  scale: PageScale | null;
}

/** One PDF of the project. Markings and locations belong to a drawing; items are shared. */
export interface Drawing {
  id: string;
  path: string | null;
  name: string;
  pages: PageMeta[];
}

export interface Measurement {
  id: string;
  itemId: string;
  drawingId: string;
  page: number;
  /** Page-space points (PDF points, origin top-left of the displayed page). */
  points: Pt[];
  /** Measurements created together by a kit share a link and are selected, moved and deleted as one. */
  linkId?: string;
  /** Linear runs: extra length in project units for the vertical part the plan does not show. */
  vertical?: number;
  /** Times this measurement counts (10 identical floors measured once); undefined = 1. */
  repeat?: number;
  /** Rectangular duct run: section and finishes, feeding the duct take-off. */
  duct?: DuctSpec;
}

/** A named location (ambiente, pavimento, zona) drawn on a page; measurements inside it are grouped by it. */
export interface Zone {
  id: string;
  name: string;
  drawingId: string;
  page: number;
  points: Pt[];
  color: string;
  /** Hidden on the drawing (still groups measurements). */
  hidden?: boolean;
  /** Times this local repeats (20 identical apartments): multiplies the quantities inside it. */
  repeat?: number;
}

export interface Project {
  version: 3;
  name: string;
  unit: Unit;
  currency: string;
  /** Budget sheet header fields. */
  client: string;
  site: string;
  proposalNumber: string;
  estimator: string;
  /** System title printed on the sheet, e.g. "SISTEMA DE PRESSURIZAÇÃO DE ESCADAS". */
  system: string;
  /** Multiplier applied to TOTAL GERAL to reach the proposal price (1.42 = 42 %). */
  bdi: number;
  /** Percentage of the items total split evenly into Diversos / Transportes / Supervisão. */
  extrasPct: number;
  /** How the exported sheet is sectioned: by location (ambiente) or by item group. */
  sectionsBy: "local" | "grupo";
  drawings: Drawing[];
  /** Drawing shown in the viewer; persisted so a project reopens where it was. */
  activeDrawingId: string | null;
  items: Item[];
  measurements: Measurement[];
  zones: Zone[];
  /** Duct take-off parameters (norma, allowances, labour); undefined = defaults. */
  duct?: DuctSettings;
  /** Unit prices of duct materials edited in this takeoff, by bill row name. */
  ductPrices?: Record<string, number>;
}

export const ZONE_COLORS = ["#38bdf8", "#fb923c", "#a78bfa", "#4ade80", "#f472b6", "#fde047"];

/** Disciplines RLP budgets usually have; each becomes a worksheet. Custom names are allowed. */
export const DISCIPLINE_SUGGESTIONS = [
  "Exaustão",
  "TAE (Tomada de Ar Externo)",
  "Pressurização de Escadas",
  "Detecção de Incêndio",
  "Infra AC",
  "AC Áreas Comuns",
];

export const DEFAULT_GROUP = "Geral";
export const GROUP_SUGGESTIONS = [
  "Equipamentos",
  "Rede de Dutos",
  "Bocas de Ar",
  "Elétrica",
  "Tubulações",
  "Isolamento",
  "Geral",
];

export const ITEM_COLORS = [
  "#f97316",
  "#22d3ee",
  "#a3e635",
  "#e879f9",
  "#facc15",
  "#60a5fa",
  "#f87171",
  "#34d399",
  "#c084fc",
  "#fb7185",
];

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export const UNTITLED = "Takeoff sem nome";

export function emptyProject(): Project {
  return {
    version: 3,
    name: UNTITLED,
    unit: "m",
    currency: "BRL",
    client: "",
    site: "",
    proposalNumber: "",
    estimator: "",
    system: "",
    bdi: 1.42,
    extrasPct: 5,
    sectionsBy: "local",
    drawings: [],
    activeDrawingId: null,
    items: [],
    measurements: [],
    zones: [],
  };
}

export const drawingOf = (project: Project, id: string | null | undefined): Drawing | undefined =>
  id ? project.drawings.find((d) => d.id === id) : undefined;

export const activeDrawing = (project: Project): Drawing | undefined =>
  drawingOf(project, project.activeDrawingId);

/** Load a project file of any supported version into the current shape. */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object") throw new Error("Not a takeoff project");
  const r = raw as Record<string, unknown>;
  const base = emptyProject();
  if (r.version === 3) return { ...base, ...(r as Partial<Project>), version: 3 };
  if (r.version !== 1 && r.version !== 2) {
    throw new Error(`Unsupported project version ${String(r.version)}`);
  }
  // v1/v2: a single PDF (pdfPath / pdfName / pages) with page-keyed measurements and zones
  const drawingId = newId();
  const pdfPath = (r.pdfPath as string | null) ?? null;
  const drawing: Drawing = {
    id: drawingId,
    path: pdfPath,
    name: String(r.pdfName ?? (pdfPath ? pdfPath.split(/[\\/]/).pop() : "Planta")),
    pages: (r.pages as PageMeta[]) ?? [],
  };
  const items = ((r.items as Record<string, unknown>[]) ?? []).map((i) => ({
    id: String(i.id),
    name: String(i.name ?? ""),
    kind: i.kind as Kind,
    color: String(i.color ?? ITEM_COLORS[0]),
    group: String(i.group ?? DEFAULT_GROUP),
    materialPrice: Number(i.materialPrice ?? i.unitPrice ?? 0),
    laborPrice: Number(i.laborPrice ?? 0),
    wastePct: Number(i.wastePct ?? 0),
    system: typeof i.system === "string" ? i.system : undefined,
    symbol: typeof i.symbol === "string" ? i.symbol : undefined,
  }));
  const measurements = ((r.measurements as Omit<Measurement, "drawingId">[]) ?? []).map((m) => ({
    ...m,
    drawingId,
  }));
  const zones = ((r.zones as Omit<Zone, "drawingId">[]) ?? []).map((z) => ({ ...z, drawingId }));
  const markup = Number(r.markupPct ?? 0);
  return {
    ...base,
    name: String(r.name ?? base.name),
    unit: (r.unit as Unit) ?? "m",
    currency: String(r.currency ?? "BRL"),
    client: String(r.client ?? ""),
    site: String(r.site ?? ""),
    proposalNumber: String(r.proposalNumber ?? ""),
    estimator: String(r.estimator ?? ""),
    system: String(r.system ?? ""),
    bdi: typeof r.bdi === "number" ? r.bdi : markup ? 1 + markup / 100 : base.bdi,
    extrasPct: typeof r.extrasPct === "number" ? r.extrasPct : base.extrasPct,
    sectionsBy: r.sectionsBy === "grupo" ? "grupo" : "local",
    drawings: pdfPath || measurements.length || zones.length ? [drawing] : [],
    activeDrawingId: pdfPath || measurements.length || zones.length ? drawingId : null,
    items,
    measurements,
    zones,
  };
}
