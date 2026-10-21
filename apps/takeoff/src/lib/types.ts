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
}

export interface Measurement {
  id: string;
  itemId: string;
  page: number;
  /** Page-space points (PDF points, origin top-left of the displayed page). */
  points: Pt[];
}

export interface PageMeta {
  scale: PageScale | null;
}

export interface Project {
  version: 2;
  name: string;
  pdfPath: string | null;
  pdfName: string;
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
  pages: PageMeta[];
  items: Item[];
  measurements: Measurement[];
}

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

export function emptyProject(): Project {
  return {
    version: 2,
    name: "Untitled takeoff",
    pdfPath: null,
    pdfName: "",
    unit: "m",
    currency: "BRL",
    client: "",
    site: "",
    proposalNumber: "",
    estimator: "",
    system: "",
    bdi: 1.42,
    extrasPct: 5,
    pages: [],
    items: [],
    measurements: [],
  };
}

/** Load a project file of any supported version into the current shape. */
export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object") throw new Error("Not a takeoff project");
  const r = raw as Record<string, unknown>;
  const base = emptyProject();
  if (r.version === 2) return { ...base, ...(r as Partial<Project>), version: 2 };
  if (r.version === 1) {
    const items = ((r.items as Record<string, unknown>[]) ?? []).map((i) => ({
      id: String(i.id),
      name: String(i.name ?? ""),
      kind: i.kind as Kind,
      color: String(i.color ?? ITEM_COLORS[0]),
      group: DEFAULT_GROUP,
      materialPrice: Number(i.unitPrice ?? 0),
      laborPrice: 0,
      wastePct: Number(i.wastePct ?? 0),
    }));
    const markup = Number(r.markupPct ?? 0);
    return {
      ...base,
      name: String(r.name ?? base.name),
      pdfPath: (r.pdfPath as string | null) ?? null,
      pdfName: String(r.pdfName ?? ""),
      unit: (r.unit as Unit) ?? "m",
      currency: String(r.currency ?? "BRL"),
      bdi: markup ? 1 + markup / 100 : base.bdi,
      pages: (r.pages as PageMeta[]) ?? [],
      items,
      measurements: (r.measurements as Measurement[]) ?? [],
    };
  }
  throw new Error(`Unsupported project version ${String(r.version)}`);
}
