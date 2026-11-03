import { foldName } from "./text";
import type { Measurement } from "./types";
import type { Kind, Unit } from "./units";

/** One material of a kit: measured once, quantified `factor` times the run. */
export interface KitComponent {
  /** Catalog name; prices and discipline are pulled from the catalog when the item is created. */
  name: string;
  group: string;
  system?: string;
  /**
   * Linear kits: "linear" follows the drawn run; "count" is added once per run (e.g. a drain kit).
   * Count kits: "count" places `factor` units per click; "linear" adds `factor` of length per click.
   */
  kind: Kind;
  /**
   * Multiplier on the measured quantity (2 for a cable that runs both ways); in a count kit, the
   * units (count) or the length in project units (linear) each click adds.
   */
  factor: number;
}

/** A preset ("9.000 Inverter"): one drawn run creates every component at once. */
export interface Kit {
  id: string;
  name: string;
  /** "linear" is drawn as a run; "count" is placed with one click (default linear). */
  mode?: "linear" | "count";
  /**
   * Prefix of the run's label on the drawing ('1/4" · 3/8"', "VE-01 · 1.200 m³/h").
   * Undefined = never set (a seed-derived kit takes the seed's on load); "" = cleared, no label.
   */
  label?: string;
  components: KitComponent[];
}

export const kitMode = (kit: Kit): "linear" | "count" => kit.mode ?? "linear";

const linear = (name: string, group: string, factor = 1, system = "Infra AC"): KitComponent => ({
  name,
  group,
  system,
  kind: "linear",
  factor,
});

/** One click places `qty` of a material (equipment, bracket, box, detector…). */
const count = (name: string, group: string, qty = 1, system = "AC com Equip"): KitComponent => ({
  name,
  group,
  system,
  kind: "count",
  factor: qty,
});

/** Count presets: everything a single click should place. */
const COUNT_KITS: Kit[] = [
  {
    id: "kit-split-12000-equip",
    name: "Split Hi Wall 12.000 · equipamento + suportes",
    mode: "count",
    components: [
      count("Split Hi Wall 12.000 Btu/h", "Equipamentos"),
      count("Suporte da Condensadora - 12.000 BTU/h", "Equipamentos"),
      count("Suporte da Evaporadora", "Equipamentos"),
      count("Caixa de espera da Condensadora", "Equipamentos", 1, "Infra AC"),
      count("Caixa de espera da Evaporadora", "Equipamentos", 1, "Infra AC"),
    ],
  },
  {
    id: "kit-split-18000-equip",
    name: "Split Hi Wall 18.000 · equipamento + suportes",
    mode: "count",
    components: [
      count("Split hi Wall 18.000 Btu/h", "Equipamentos"),
      count("Suporte da Condensadora - 18.000 BTU/h", "Equipamentos"),
      count("Suporte da Evaporadora", "Equipamentos"),
      count("Caixa de espera da Condensadora", "Equipamentos", 1, "Infra AC"),
      count("Caixa de espera da Evaporadora", "Equipamentos", 1, "Infra AC"),
    ],
  },
  {
    id: "kit-detector-fumaca",
    name: "Detector de fumaça · com instalação",
    mode: "count",
    components: [
      count("Detector de Fumaça Enderaçável", "Detecção", 1, "Detecção de Incêndio"),
      count("Mão de obra detectores", "Detecção", 1, "Detecção de Incêndio"),
    ],
  },
];

/** Copper line set of a split: liquid and gas tubes, their insulation and the interconnect cable (both ways). */
function lineSet(liquid: string, gas: string): KitComponent[] {
  return [
    linear(`Cobre de ${liquid}"`, "Tubulações"),
    linear(`Cobre de ${gas}"`, "Tubulações"),
    linear(`Isolamento de ${liquid}" - Espessura 09 mm`, "Isolamento"),
    linear(`Isolamento de ${gas}" - Espessura 09 mm`, "Isolamento"),
    linear("Cabo PP 5 x 1,5 mm²", "Elétrica", 2),
  ];
}

/**
 * Copper diameters per capacity (BTU/h) for split systems common in Brazil: [liquid, gas].
 * Reference table supplied by RLP (preliminary; depends on maker, model and run length).
 */
const TABLE: {
  btu: string;
  type: "Inverter" | "Convencional" | "Inverter / Conv.";
  liquid: string;
  gas: string;
}[] = [
  { btu: "9.000", type: "Inverter / Conv.", liquid: "1/4", gas: "3/8" },
  { btu: "12.000", type: "Inverter", liquid: "1/4", gas: "3/8" },
  { btu: "12.000", type: "Convencional", liquid: "1/4", gas: "1/2" },
  { btu: "18.000", type: "Inverter", liquid: "1/4", gas: "1/2" },
  { btu: "18.000", type: "Convencional", liquid: "1/4", gas: "5/8" },
  // the table allows 1/4" or 3/8" liquid for 24.000 inverter; 3/8" is the common choice
  { btu: "24.000", type: "Inverter", liquid: "3/8", gas: "5/8" },
  { btu: "24.000", type: "Convencional", liquid: "3/8", gas: "5/8" },
  { btu: "30.000", type: "Inverter / Conv.", liquid: "3/8", gas: "5/8" },
  { btu: "36.000", type: "Inverter / Conv.", liquid: "3/8", gas: "3/4" },
  { btu: "48.000", type: "Inverter / Conv.", liquid: "3/8", gas: "3/4" },
  { btu: "60.000", type: "Inverter / Conv.", liquid: "3/8", gas: "7/8" },
];

const slug = (s: string) =>
  foldName(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Starting presets, one per capacity and type; the user edits them in the kits dialog. */
export const SEED_KITS: Kit[] = [
  ...TABLE.flatMap((row) => {
    const types = row.type === "Inverter / Conv." ? ["Inverter", "Convencional"] : [row.type];
    return types.map((t) => {
      const name = `${row.btu} ${t}`;
      return {
        id: `kit-${slug(name)}`,
        name,
        mode: "linear" as const,
        label: `${row.liquid}" · ${row.gas}"`,
        components: lineSet(row.liquid, row.gas),
      };
    });
  }),
  ...COUNT_KITS,
];

/** Short description of a kit for lists: "Cobre de 1/4" · Cobre de 3/8" · Cabo PP 5 x 1,5 mm² ×2". */
export function kitSummary(kit: Kit, unit: Unit = "m"): string {
  return kit.components
    .map((c) =>
      kitMode(kit) === "count" && c.kind === "linear"
        ? `${c.name} ${c.factor} ${unit}`
        : c.factor !== 1
          ? `${c.name} ×${c.factor}`
          : c.name,
    )
    .join(" · ");
}

/**
 * Kits saved before kits had a drawing label: one that came from a seed (same id) and has no
 * `label` field takes the seed's. A label the user cleared ("") stays cleared. Returns the same
 * array when nothing changes.
 */
export function migrateKitLabels(kits: Kit[]): Kit[] {
  const seeds = new Map(SEED_KITS.map((k) => [k.id, k]));
  let changed = false;
  const out = kits.map((k) => {
    const label = seeds.get(k.id)?.label;
    if (k.label !== undefined || label === undefined) return k;
    changed = true;
    return { ...k, label };
  });
  return changed ? out : kits;
}

type KitLookup = readonly Kit[] | ReadonlyMap<string, Kit>;

const findKit = (kits: KitLookup, id: string): Kit | undefined =>
  "get" in kits ? kits.get(id) : kits.find((k) => k.id === id);

/**
 * The label a marking shows on the drawing, before its quantity: its own override, else the
 * label of its kit in the current catalog (so editing a kit relabels the runs already drawn),
 * else the label saved with the run when the catalog lacks the kit. Blank = no label.
 */
export function runLabel(
  m: Pick<Measurement, "label" | "kitId" | "kitLabel">,
  kits: KitLookup = [],
): string | undefined {
  const own = m.label?.trim();
  if (own) return own;
  if (!m.kitId) return undefined;
  const kit = findKit(kits, m.kitId);
  const text = (kit ? kit.label : m.kitLabel)?.trim();
  return text || undefined;
}

/** A kit's label as saved with the runs it draws (blank = none). */
export const kitLabelSnapshot = (kit: Kit): string | undefined => kit.label?.trim() || undefined;

/**
 * After the kits were edited: runs of a kit whose label changed save the new label, so a project
 * opened with another catalog shows it too. Returns the same array when nothing changes.
 */
export function refreshKitLabels(
  measurements: Measurement[],
  before: readonly Kit[],
  after: readonly Kit[],
): Measurement[] {
  const old = new Map(before.map((k) => [k.id, kitLabelSnapshot(k)]));
  const relabelled = new Map<string, string | undefined>();
  for (const k of after) {
    const label = kitLabelSnapshot(k);
    if (old.has(k.id) && old.get(k.id) !== label) relabelled.set(k.id, label);
  }
  if (relabelled.size === 0) return measurements;
  let changed = false;
  const out = measurements.map((m) => {
    if (!m.kitId || !relabelled.has(m.kitId)) return m;
    const kitLabel = relabelled.get(m.kitId);
    if (m.kitLabel === kitLabel) return m;
    changed = true;
    const next = { ...m, kitLabel };
    if (kitLabel === undefined) delete next.kitLabel;
    return next;
  });
  return changed ? out : measurements;
}
