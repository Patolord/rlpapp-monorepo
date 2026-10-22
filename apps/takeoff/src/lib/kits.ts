import type { Kind } from "./units";

/** One material of a kit: measured once, quantified `factor` times the run. */
export interface KitComponent {
  /** Catalog name; prices and discipline are pulled from the catalog when the item is created. */
  name: string;
  group: string;
  system?: string;
  /** "linear" follows the drawn run; "count" is added once per run (e.g. a drain kit). */
  kind: Kind;
  /** Multiplier on the measured quantity (2 for a cable that runs both ways). */
  factor: number;
}

/** A preset ("9.000 Inverter"): one drawn run creates every component at once. */
export interface Kit {
  id: string;
  name: string;
  components: KitComponent[];
}

const linear = (name: string, group: string, factor = 1, system = "Infra AC"): KitComponent => ({
  name,
  group,
  system,
  kind: "linear",
  factor,
});

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
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Starting presets, one per capacity and type; the user edits them in the kits dialog. */
export const SEED_KITS: Kit[] = TABLE.flatMap((row) => {
  const types = row.type === "Inverter / Conv." ? ["Inverter", "Convencional"] : [row.type];
  return types.map((t) => {
    const name = `${row.btu} ${t}`;
    return { id: `kit-${slug(name)}`, name, components: lineSet(row.liquid, row.gas) };
  });
});

/** Short description of a kit for lists: "Cobre de 1/4" · Cobre de 3/8" · Cabo PP 5 x 1,5 mm² ×2". */
export function kitSummary(kit: Kit): string {
  return kit.components
    .map((c) => (c.factor !== 1 ? `${c.name} ×${c.factor}` : c.name))
    .join(" · ");
}
