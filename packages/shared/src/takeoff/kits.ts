/**
 * Kit presets of the RLP Takeoff desktop app: one drawn run (or one click) measures every
 * material of a preset at once. The types and the factory presets live here because they are
 * shared by the app (bundled fallback, local overrides), the backend (company defaults stored
 * in `takeoffKits`, published with the catalog) and the dashboard (where the defaults are
 * edited). The app's own helpers (labels on the drawing, override logic) stay in
 * apps/takeoff/src/lib/kits.ts.
 */

/** How a kit component is measured: pieces, a length or an area. */
export type KitComponentKind = "count" | "linear" | "area";

/** "linear" is drawn as a run; "count" is placed with one click. */
export type KitMode = "linear" | "count";

export const KIT_COMPONENT_KINDS: readonly KitComponentKind[] = ["count", "linear", "area"];
export const KIT_MODES: readonly KitMode[] = ["linear", "count"];

/** One material of a kit: measured once, quantified `factor` times the run. */
export interface KitComponent {
  /** Catalog name; prices and discipline are pulled from the catalog when the item is created. */
  name: string;
  /**
   * Code of the material in the purchasing catalog ("MAT-000123"). When set, the app links the
   * item to that material (price, quote date, proposals) whatever its name; unset for a custom
   * item the catalog does not carry, which is then looked up by name.
   */
  sku?: string;
  group: string;
  system?: string;
  /**
   * Linear kits: "linear" follows the drawn run; "count" is added once per run (e.g. a drain kit).
   * Count kits: "count" places `factor` units per click; "linear" adds `factor` of length per click.
   */
  kind: KitComponentKind;
  /**
   * Multiplier on the measured quantity (2 for a cable that runs both ways); in a count kit, the
   * units (count) or the length in project units (linear) each click adds.
   */
  factor: number;
}

/** A preset ("9.000 Inverter"): one drawn run creates every component at once. */
export interface Kit {
  /** Stable id: runs saved in a project remember it, and it pairs a local copy with the company's. */
  id: string;
  name: string;
  /** Default linear. */
  mode?: KitMode;
  /**
   * Prefix of the run's label on the drawing ('1/4" · 3/8"', "VE-01 · 1.200 m³/h").
   * Undefined = never set (a seed-derived kit takes the seed's on load); "" = cleared, no label.
   */
  label?: string;
  components: KitComponent[];
}

export const kitMode = (kit: Pick<Kit, "mode">): KitMode => kit.mode ?? "linear";

/** Accent- and case-insensitive key of a name (same as the app's foldName). */
const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "kit-" plus the folded name as a slug: the id of a factory preset. */
export const kitSlugId = (name: string): string =>
  `kit-${fold(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

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

/**
 * Copper line set of a split: liquid and gas tubes, their insulation and the interconnect cable
 * (both ways), in the order of the budget: copper, insulation, cable, each by ascending size.
 * The names follow the purchasing catalog; the company kits carry its codes (`sku`).
 */
function lineSet(liquid: string, gas: string): KitComponent[] {
  return [
    linear(`Tubulação de Cobre ${liquid}"`, "Tubulações"),
    linear(`Tubulação de Cobre ${gas}"`, "Tubulações"),
    linear(`Isolamento Polipex ${liquid}"`, "Isolamento"),
    linear(`Isolamento Polipex ${gas}"`, "Isolamento"),
    linear("Cabo PP 5x1,5 mm²", "Elétrica", 2),
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

/** The line-set presets of the reference table, plus the count kits, with the given line set. */
const seedKits = (set: (liquid: string, gas: string) => KitComponent[]): Kit[] => [
  ...TABLE.flatMap((row) => {
    const types = row.type === "Inverter / Conv." ? ["Inverter", "Convencional"] : [row.type];
    return types.map((t) => {
      const name = `${row.btu} ${t}`;
      return {
        id: kitSlugId(name),
        name,
        mode: "linear" as const,
        label: `${row.liquid}" · ${row.gas}"`,
        components: set(row.liquid, row.gas),
      };
    });
  }),
  ...COUNT_KITS,
];

/**
 * Factory presets, one per capacity and type plus the count kits. The app ships them as the
 * fallback when the company has published no kits; the dashboard loads them into the company
 * defaults ("Carregar kits de fábrica").
 */
export const SEED_KITS: Kit[] = seedKits(lineSet);

/**
 * The factory presets before their components took the catalog names ("Cobre de 1/4"",
 * "Isolamento de 1/4" - Espessura 09 mm", "Cabo PP 5 x 1,5 mm²"). Only to recognise an
 * untouched preset saved by an older app, which is not a local edit.
 */
export const SEED_KITS_V1: Kit[] = seedKits((liquid, gas) => [
  linear(`Cobre de ${liquid}"`, "Tubulações"),
  linear(`Cobre de ${gas}"`, "Tubulações"),
  linear(`Isolamento de ${liquid}" - Espessura 09 mm`, "Isolamento"),
  linear(`Isolamento de ${gas}" - Espessura 09 mm`, "Isolamento"),
  linear("Cabo PP 5 x 1,5 mm²", "Elétrica", 2),
]);

/** A deep copy, so a caller may edit it without touching the seed. */
export const cloneKit = (kit: Kit): Kit => ({
  ...kit,
  components: kit.components.map((c) => ({ ...c })),
});

/**
 * The form in which two kits are compared: trimmed strings, an unset system and an unset label
 * read the same as missing, the mode spelled out. Field order is fixed so JSON compares.
 */
export function normalizeKit(kit: Kit): Kit {
  const label = kit.label?.trim();
  return {
    id: kit.id,
    name: kit.name.trim(),
    mode: kitMode(kit),
    ...(label ? { label } : {}),
    components: kit.components.map((c) => {
      const system = c.system?.trim();
      const sku = normalizeKitSku(c.sku);
      return {
        name: c.name.trim(),
        ...(sku ? { sku } : {}),
        group: c.group.trim(),
        ...(system ? { system } : {}),
        kind: c.kind,
        factor: c.factor,
      };
    }),
  };
}

/** A material code as stored: trimmed and upper case ("mat-000123 " → "MAT-000123"); blank = none. */
export function normalizeKitSku(sku: string | null | undefined): string | undefined {
  const s = sku?.trim().toUpperCase();
  return s || undefined;
}

/** Same preset, ignoring whitespace and the spelling of defaults. */
export const sameKit = (a: Kit, b: Kit): boolean =>
  JSON.stringify(normalizeKit(a)) === JSON.stringify(normalizeKit(b));
