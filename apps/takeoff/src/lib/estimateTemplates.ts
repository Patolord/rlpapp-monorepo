import { type EstimateLine, kitLines, type LinePrice, mergeLines } from "./estimate";
import { type Kit, kitMode, SEED_KITS } from "./kits";

/**
 * Service calculators of the estimate dialog: a few parameters ("10 machines, 12.000 Inverter,
 * 20 m each, labour R$ 450 per machine") become the budget lines of the whole service. Material
 * names follow the purchasing catalog, so the lines take its prices; what the catalog lacks is
 * priced by the values typed here (or in the dialog's preview).
 */

/** One row of a table parameter (a machine of the split calculator): a value per column. */
export type TableRow = Record<string, number | string>;
export type ParamValue = number | string | boolean | TableRow[];
export type TemplateValues = Record<string, ParamValue>;

interface ParamBase {
  key: string;
  label: string;
  hint?: string;
  /** Shown only when this holds for the current values. */
  when?: (v: TemplateValues) => boolean;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

/** A number, an amount of money or a pick from a list: a parameter or a table column. */
export type ScalarParam =
  | (ParamBase & { type: "number"; unit?: string; default: number; step?: number })
  | (ParamBase & { type: "money"; default: number })
  | (ParamBase & {
      type: "choice";
      default: string;
      /** The options, from the kits in use (the company's line sets) when they depend on them. */
      options: (kits: readonly Kit[]) => ChoiceOption[];
    });

export type TemplateParam =
  | ScalarParam
  | (ParamBase & { type: "toggle"; default: boolean })
  | (ParamBase & {
      type: "table";
      /** The columns; a column's `when` reads the template's values, not the row's. */
      columns: ScalarParam[];
      /** Text of the button that adds a row (a copy of the last one). */
      addLabel: string;
    });

export interface EstimateTemplate {
  id: string;
  name: string;
  description: string;
  /** What one unit is called in the summary ("máquina", "banheiro"). */
  unitName: string;
  params: TemplateParam[];
  lines(v: TemplateValues, kits: readonly Kit[]): EstimateLine[];
}

const num = (v: TemplateValues, key: string): number => {
  const n = Number(v[key]);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const str = (v: TemplateValues, key: string): string => String(v[key] ?? "");
const on = (v: TemplateValues, key: string): boolean => v[key] === true;

/** A price typed as a parameter: 0 or blank leaves the catalog's. */
const typed = (v: TemplateValues, key: string, field: keyof LinePrice): LinePrice | undefined => {
  const n = num(v, key);
  return n > 0 ? { [field]: n } : undefined;
};

const count = (
  name: string,
  group: string,
  system: string,
  qty: number,
  price?: LinePrice,
): EstimateLine => ({ name, group, system, kind: "count", qty, price });

const linear = (
  name: string,
  group: string,
  system: string,
  qty: number,
  price?: LinePrice,
): EstimateLine => ({ name, group, system, kind: "linear", qty, price });

// ---------------------------------------------------------------------------
// Split air conditioning installation
// ---------------------------------------------------------------------------

/** Line-set kits (run kits) in use, falling back to the factory ones. */
const lineSetKits = (kits: readonly Kit[]): readonly Kit[] => {
  const own = kits.filter((k) => kitMode(k) === "linear");
  return own.length > 0 ? own : SEED_KITS.filter((k) => kitMode(k) === "linear");
};

const lineSetOf = (kits: readonly Kit[], id: string): Kit | undefined =>
  lineSetKits(kits).find((k) => k.id === id) ??
  SEED_KITS.find((k) => k.id === id && kitMode(k) === "linear");

/** "12.000" of a "12.000 Inverter" line set; undefined for a kit not named by capacity. */
export const capacityOf = (kit: Pick<Kit, "name">): string | undefined =>
  /^(\d{1,3}(?:\.\d{3})+)/.exec(kit.name.trim())?.[1];

const AC_INFRA = "Infra AC";
const AC_EQUIP = "AC com Equip";

/** Evaporator types: they name the machine line ("Split Cassete 18.000 Btu/h"). */
const MACHINE_TYPES = ["Hi Wall", "Cassete", "Piso-teto", "Duto"];

const cellNum = (r: TableRow, key: string): number => {
  const n = Number(r[key]);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const SPLIT_TEMPLATE: EstimateTemplate = {
  id: "split",
  name: "Instalação de ar-condicionado (split)",
  description:
    "Uma linha por tipo de máquina: a linha frigorígena (cobre, isolamento e cabo de interligação) sai da bitola da capacidade; a mão de obra é por evaporadora, qualquer que seja a distância.",
  unitName: "máquina",
  params: [
    {
      key: "machines",
      label: "Máquinas",
      type: "table",
      addLabel: "Adicionar máquina",
      columns: [
        {
          key: "type",
          label: "Tipo",
          type: "choice",
          default: MACHINE_TYPES[0],
          options: () => MACHINE_TYPES.map((t) => ({ value: t, label: t })),
        },
        {
          key: "lineSet",
          label: "Capacidade / bitolas",
          type: "choice",
          default: "kit-12-000-inverter",
          options: (kits) =>
            lineSetKits(kits).map((k) => ({
              value: k.id,
              label: k.label ? `${k.name} · ${k.label}` : k.name,
            })),
        },
        { key: "qty", label: "Qtd.", type: "number", unit: "un", default: 1, step: 1 },
        {
          key: "meters",
          label: "Linha por máquina",
          type: "number",
          unit: "m",
          default: 8,
          hint: "Distância entre condensadora e evaporadora; o cabo de interligação vai e volta (×2).",
        },
        {
          key: "price",
          label: "Valor un. da máquina",
          type: "money",
          default: 0,
          hint: "Deixe 0 para usar o preço do catálogo.",
          when: (v) => on(v, "machine"),
        },
      ],
    },
    { key: "machine", label: "Incluir as máquinas", type: "toggle", default: true },
    {
      key: "labor",
      label: "Mão de obra por evaporadora",
      type: "money",
      default: 0,
      hint: "Uma linha de M.O. pelo total de evaporadoras.",
    },
    {
      key: "mobilization",
      label: "Mobilização e deslocamento (por obra)",
      type: "money",
      default: 0,
      hint: "Deixe 0 se já está no BDI.",
    },
  ],
  lines(v, kits) {
    const rows = Array.isArray(v.machines) ? v.machines : [];
    // line materials of every machine first, then the machines, then labour
    const out: EstimateLine[] = [];
    const equipment: EstimateLine[] = [];
    let evaporators = 0;
    for (const r of rows) {
      const n = cellNum(r, "qty");
      const kit = lineSetOf(kits, String(r.lineSet ?? "")) ?? lineSetKits(kits)[0];
      if (!kit || n === 0) continue;
      evaporators += n;
      const btu = capacityOf(kit);
      const type = MACHINE_TYPES.includes(String(r.type)) ? String(r.type) : MACHINE_TYPES[0];
      // the line set only: drain, brackets and electrical points are other trades' scope
      out.push(...kitLines(kit, n, cellNum(r, "meters")));
      if (on(v, "machine")) {
        const price = cellNum(r, "price");
        equipment.push(
          count(
            btu ? `Split ${type} ${btu} Btu/h` : `Split ${type} ${kit.name}`,
            "Equipamentos",
            AC_EQUIP,
            n,
            price > 0 ? { material: price } : undefined,
          ),
        );
      }
    }
    if (evaporators === 0) return [];
    out.push(...equipment);
    const labor = typed(v, "labor", "labor");
    if (labor) {
      out.push(
        count("Mão de obra instalação de evaporadora", "Mão de Obra", AC_INFRA, evaporators, {
          material: 0,
          ...labor,
        }),
      );
    }
    const mobilization = typed(v, "mobilization", "labor");
    if (mobilization) {
      out.push(
        count("Mobilização e deslocamento", "Mão de Obra", AC_INFRA, 1, {
          material: 0,
          ...mobilization,
        }),
      );
    }
    return mergeLines(out);
  },
};

// ---------------------------------------------------------------------------
// Bathroom exhaust
// ---------------------------------------------------------------------------

const EXHAUST = "Exaustão";
const DIAMETERS = ["100", "125", "150"];

export const BATHROOM_EXHAUST_TEMPLATE: EstimateTemplate = {
  id: "exaustao-banheiro",
  name: "Ventilação de banheiro (exaustor)",
  description:
    "Exaustor, duto flexível, grelha, terminal externo e abraçadeiras por banheiro, pelo diâmetro do duto, com a mão de obra por banheiro.",
  unitName: "banheiro",
  params: [
    { key: "units", label: "Banheiros", type: "number", unit: "un", default: 1, step: 1 },
    {
      key: "diameter",
      label: "Diâmetro do duto",
      type: "choice",
      default: "100",
      options: () => DIAMETERS.map((d) => ({ value: d, label: `Ø ${d} mm` })),
    },
    {
      key: "meters",
      label: "Duto flexível por banheiro",
      type: "number",
      unit: "m",
      default: 3,
    },
    {
      key: "fanPrice",
      label: "Valor do exaustor",
      type: "money",
      default: 0,
      hint: "Deixe 0 para usar o preço do catálogo.",
    },
    { key: "grille", label: "Grelha no forro", type: "toggle", default: true },
    { key: "cap", label: "Terminal externo (chapéu)", type: "toggle", default: true },
    {
      key: "clamps",
      label: "Abraçadeiras por banheiro",
      type: "number",
      unit: "un",
      default: 2,
      step: 1,
    },
    {
      key: "labor",
      label: "Mão de obra por banheiro",
      type: "money",
      default: 0,
    },
  ],
  lines(v) {
    const n = num(v, "units");
    if (n === 0) return [];
    const d = DIAMETERS.includes(str(v, "diameter")) ? str(v, "diameter") : DIAMETERS[0];
    const out: EstimateLine[] = [
      count(
        `Exaustor para banheiro Ø${d} mm`,
        "Equipamentos",
        EXHAUST,
        n,
        typed(v, "fanPrice", "material"),
      ),
      linear(`Duto flexível de alumínio Ø${d} mm`, "Rede de Dutos", EXHAUST, n * num(v, "meters")),
      count(`Abraçadeira Ø${d} mm`, "Rede de Dutos", EXHAUST, n * num(v, "clamps")),
    ];
    if (on(v, "grille")) out.push(count(`Grelha de exaustão Ø${d} mm`, "Bocas de Ar", EXHAUST, n));
    if (on(v, "cap")) {
      out.push(count(`Terminal de exaustão (chapéu) Ø${d} mm`, "Bocas de Ar", EXHAUST, n));
    }
    const labor = typed(v, "labor", "labor");
    if (labor) {
      out.push(
        count("Mão de obra instalação de exaustor", "Mão de Obra", EXHAUST, n, {
          material: 0,
          ...labor,
        }),
      );
    }
    return mergeLines(out);
  },
};

/** The service calculators, in the order the dialog lists them. */
export const ESTIMATE_TEMPLATES: readonly EstimateTemplate[] = [
  SPLIT_TEMPLATE,
  BATHROOM_EXHAUST_TEMPLATE,
];

/**
 * The values of a template: the ones saved for it where they are still valid (right type, an
 * option that still exists), the defaults otherwise.
 */
export function templateValues(
  t: EstimateTemplate,
  saved: TemplateValues | undefined,
  kits: readonly Kit[],
): TemplateValues {
  const out: TemplateValues = {};
  for (const p of t.params) {
    const s = saved?.[p.key];
    if (p.type === "toggle") out[p.key] = typeof s === "boolean" ? s : p.default;
    else if (p.type === "table") {
      const rows = Array.isArray(s) ? s : [];
      const read = (r: TableRow | undefined): TableRow =>
        Object.fromEntries(p.columns.map((c) => [c.key, scalarValue(c, r?.[c.key], kits)]));
      // a table always has a row to fill in
      out[p.key] = rows.length > 0 ? rows.map(read) : [read(undefined)];
    } else out[p.key] = scalarValue(p, s, kits);
  }
  return out;
}

/** A saved number or option when still valid (a non-negative number, an option on the list). */
function scalarValue(p: ScalarParam, saved: unknown, kits: readonly Kit[]): number | string {
  if (p.type !== "choice") {
    return typeof saved === "number" && Number.isFinite(saved) && saved >= 0 ? saved : p.default;
  }
  const options = p.options(kits);
  const valid = (x: unknown) => options.some((o) => o.value === x);
  if (typeof saved === "string" && valid(saved)) return saved;
  return valid(p.default) ? p.default : (options[0]?.value ?? p.default);
}

/** A fresh table row: a copy of the last one (the next machine is often like it), else defaults. */
export function newTableRow(
  p: Extract<TemplateParam, { type: "table" }>,
  rows: readonly TableRow[],
  kits: readonly Kit[],
): TableRow {
  const last = rows[rows.length - 1];
  return Object.fromEntries(p.columns.map((c) => [c.key, scalarValue(c, last?.[c.key], kits)]));
}
