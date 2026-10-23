import type { DuctSettings, DuctSpec } from "./ducts";
import type { Pt } from "./geom";
import type { Kind, PageScale, Unit } from "./units";
import type { VrfSettings, VrfSpec } from "./vrf";

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
   * labour are recomputed from the duct runs drawn on it; "vrf" is a VRF system (condenser +
   * evaporators), N cj priced from the refrigerant runs drawn on it.
   */
  derived?: "duct" | "vrf";
  /** VRF systems: the maker whose rules size the tubes and the condenser capacity, HP. */
  vrf?: { brand: string; hp: number };
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
  /** VRF refrigerant run: role, capacity and elbows, feeding the VRF take-off. */
  vrf?: VrfSpec;
}

/**
 * A named location (ambiente, pavimento, zona). Measurements are grouped by it in the budget.
 * It is drawn as one or more regions (Zone), possibly on different drawings: a condenser on the
 * roof sheet and its evaporator on the floor sheet are one location.
 */
export interface Location {
  id: string;
  name: string;
  color: string;
}

/** One region of a location drawn on a page; measurements inside it belong to the location. */
export interface Zone {
  id: string;
  locationId: string;
  drawingId: string;
  page: number;
  points: Pt[];
  /** Hidden on the drawing (still groups measurements). */
  hidden?: boolean;
  /** Times this region repeats (20 identical apartments): multiplies the quantities inside it. */
  repeat?: number;
}

export interface Project {
  version: 4;
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
  locations: Location[];
  /** Regions of the locations, each on one page of one drawing. */
  zones: Zone[];
  /** Duct take-off parameters (norma, allowances, labour); undefined = defaults. */
  duct?: DuctSettings;
  /** Unit prices of duct materials edited in this takeoff, by bill row name. */
  ductPrices?: Record<string, number>;
  /** VRF take-off parameters (allowance, elbows, labour per evaporator); undefined = defaults. */
  vrfSettings?: VrfSettings;
  /** Unit prices of VRF materials edited in this takeoff, by bill row name. */
  vrfPrices?: Record<string, number>;
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
  "Sistema VRF",
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
    version: 4,
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
    locations: [],
    zones: [],
  };
}

export const drawingOf = (project: Project, id: string | null | undefined): Drawing | undefined =>
  id ? project.drawings.find((d) => d.id === id) : undefined;

export const activeDrawing = (project: Project): Drawing | undefined =>
  drawingOf(project, project.activeDrawingId);

export const locationOf = (
  project: Project,
  id: string | null | undefined,
): Location | undefined => (id ? project.locations.find((l) => l.id === id) : undefined);

/** Key two location names share when they mean the same place ("Térreo " = "térreo"). */
export const locationKey = (name: string): string => name.trim().toLocaleLowerCase("pt-BR");

/** The location whose name matches, ignoring case and surrounding spaces. */
export const locationByName = (project: Project, name: string): Location | undefined => {
  const key = locationKey(name);
  return key ? project.locations.find((l) => locationKey(l.name) === key) : undefined;
};

/** Regions of a location, in drawing order. */
export const regionsOf = (project: Project, locationId: string): Zone[] =>
  project.zones.filter((z) => z.locationId === locationId);

/** Drops locations left without any region (a location only exists through what is drawn). */
export function pruneLocations<P extends Pick<Project, "locations" | "zones">>(p: P): P {
  const used = new Set(p.zones.map((z) => z.locationId));
  const locations = p.locations.filter((l) => used.has(l.id));
  return locations.length === p.locations.length ? p : { ...p, locations };
}

/** Zone of project files up to version 3: name and colour lived on each polygon. */
interface ZoneV3 {
  id: string;
  name: string;
  drawingId: string;
  page: number;
  points: Pt[];
  color: string;
  hidden?: boolean;
  repeat?: number;
}

/**
 * v3 → v4: polygons become regions of named locations. Polygons that share a name (the same
 * room drawn on two sheets) merge into one location, keeping the first one's colour.
 */
function locationsFromZonesV3(zones: ZoneV3[]): { locations: Location[]; zones: Zone[] } {
  const locations: Location[] = [];
  const byKey = new Map<string, Location>();
  const out: Zone[] = [];
  for (const z of zones) {
    const key = locationKey(z.name) || z.id;
    let loc = byKey.get(key);
    if (!loc) {
      loc = { id: newId(), name: z.name, color: z.color };
      byKey.set(key, loc);
      locations.push(loc);
    }
    const { name: _n, color: _c, ...rest } = z;
    out.push({ ...rest, locationId: loc.id });
  }
  return { locations, zones: out };
}

/** Load a project file of any supported version into the current shape. */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object") throw new Error("Not a takeoff project");
  const r = raw as Record<string, unknown>;
  const base = emptyProject();
  if (r.version === 4) return { ...base, ...(r as Partial<Project>), version: 4 };
  if (r.version === 3) {
    const { zones: _z, ...rest } = r as Partial<Project> & { zones?: ZoneV3[] };
    return {
      ...base,
      ...rest,
      ...locationsFromZonesV3((r.zones as ZoneV3[]) ?? []),
      version: 4,
    };
  }
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
  const { locations, zones } = locationsFromZonesV3(
    ((r.zones as Omit<ZoneV3, "drawingId">[]) ?? []).map((z) => ({ ...z, drawingId })),
  );
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
    locations,
    zones,
  };
}
