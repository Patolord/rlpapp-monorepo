/**
 * VRF refrigerant line take-off, replicating RLP's "Levantamento VRF Completo" workbook
 * (Cálculos / Preços / Resultados sheets). A system is one condenser and its evaporators; the
 * copper network starts at the condenser outlet with the largest pair of tubes and branches
 * (Y-kits) into thinner pairs as the capacity downstream decreases. Each measured run has a
 * role, the capacity (HP) that sizes it, a length (plan + vertical) and a number of elbows; the
 * brand's rule tables turn the HP into a gas/liquid pair and a Y-kit model, and the bill adds
 * insulation, elbows, cables, boxes, supports and labour exactly as the Resultados sheet does.
 */

/** Saída da condensadora · trecho intermediário (between Y-kits) · ramal de uma evaporadora. */
export type VrfRole = "main" | "trunk" | "branch";

export const ROLE_LABELS: Record<VrfRole, string> = {
  main: "Saída da condensadora",
  trunk: "Trecho intermediário",
  branch: "Ramal da evaporadora",
};
export const ROLE_SHORT: Record<VrfRole, string> = {
  main: "Cond.",
  trunk: "Interm.",
  branch: "Evap.",
};

export interface VrfSpec {
  role: VrfRole;
  /**
   * Capacity, HP, that sizes the run: the evaporator's (branch), the sum of the evaporators
   * downstream (trunk). Main runs take the system's HP; the value here is ignored for them.
   */
  hp: number;
  /** Elbows (curvas) on the run; each one is an elbow on the gas and on the liquid tube. */
  curves: number;
}

export const DEFAULT_VRF_SPEC: VrfSpec = { role: "branch", hp: 1.5, curves: 0 };

/** Tube sizes as the catalog names them (Cobre de 1.1/8"), smallest first. */
export const DIAMETERS = [
  "1/4",
  "3/8",
  "1/2",
  "5/8",
  "3/4",
  "7/8",
  "1",
  "1.1/8",
  "1.1/4",
  "1.3/8",
  "1.1/2",
  "1.5/8",
  "1.3/4",
  "1.7/8",
] as const;
export type Diameter = (typeof DIAMETERS)[number];

export const diameterIndex = (d: string): number => DIAMETERS.indexOf(d as Diameter);

/** A row of a sizing table: from `hp` (inclusive) up to the next row, this gas/liquid pair. */
export interface HpRow {
  hp: number;
  gas: Diameter;
  liquid: Diameter;
}

/** From `hp` (inclusive) up to the next row, this Y-kit (refnet) model. */
export interface YkitRow {
  hp: number;
  model: string;
}

/** One maker's rules: three sizing tables (by role) and the Y-kit models by downstream HP. */
export interface VrfBrand {
  id: string;
  name: string;
  main: HpRow[];
  trunk: HpRow[];
  branch: HpRow[];
  ykit: YkitRow[];
}

const row = (hp: number, gas: Diameter, liquid: Diameter): HpRow => ({ hp, gas, liquid });

/**
 * The workbook's Cálculos tables (INTERNA / interm / SAIDA). The 6 HP evaporator row reads
 * 3/8" gas in the workbook, below the 2.5 HP row; that is a typo and 3/4" is used here.
 */
const WORKBOOK_BRANCH: HpRow[] = [
  row(0, "1/2", "1/4"),
  row(2, "5/8", "1/4"),
  row(2.5, "5/8", "3/8"),
  row(6, "3/4", "3/8"),
  row(10, "7/8", "3/8"),
  row(16, "1.1/8", "1/2"),
];
const WORKBOOK_TRUNK: HpRow[] = [
  row(0, "5/8", "3/8"),
  row(6, "3/4", "3/8"),
  row(9, "7/8", "3/8"),
  row(12, "1", "1/2"),
  row(16, "1.1/8", "1/2"),
  row(18, "1.1/8", "5/8"),
  row(26, "1.1/4", "3/4"),
  row(36, "1.1/2", "3/4"),
];
const WORKBOOK_MAIN: HpRow[] = [
  row(0, "3/4", "3/8"),
  row(10, "7/8", "3/8"),
  row(12, "1", "1/2"),
  row(16, "1.1/8", "1/2"),
  row(18, "1.1/8", "5/8"),
  row(26, "1.1/4", "3/4"),
  row(36, "1.1/2", "3/4"),
];

const clone = (rows: HpRow[]) => rows.map((r) => ({ ...r }));

/**
 * Starting rule sets. Both brands carry the workbook's tube tables (the sheet has one set);
 * the Y-kit models follow each maker's refnet selection by downstream capacity. Confirm the
 * Hitachi tubes and kits against the maker's catalog; everything is editable in the app.
 */
export const SEED_BRANDS: VrfBrand[] = [
  {
    id: "daikin",
    name: "Daikin",
    main: clone(WORKBOOK_MAIN),
    trunk: clone(WORKBOOK_TRUNK),
    branch: clone(WORKBOOK_BRANCH),
    ykit: [
      { hp: 0, model: "KHRP26A22T" },
      { hp: 8, model: "KHRP26A33T" },
      { hp: 11.6, model: "KHRP26A72T" },
      { hp: 25.6, model: "KHRP26A73T" },
    ],
  },
  {
    id: "hitachi",
    name: "Hitachi",
    main: clone(WORKBOOK_MAIN),
    trunk: clone(WORKBOOK_TRUNK),
    branch: clone(WORKBOOK_BRANCH),
    ykit: [
      { hp: 0, model: "E-102SN4" },
      { hp: 8, model: "E-162SN4" },
      { hp: 18, model: "E-242SN4" },
      { hp: 26, model: "E-302SN4" },
      { hp: 54, model: "E-52XN4" },
    ],
  },
];

export const cloneBrand = (b: VrfBrand): VrfBrand => ({
  ...b,
  main: clone(b.main),
  trunk: clone(b.trunk),
  branch: clone(b.branch),
  ykit: b.ykit.map((r) => ({ ...r })),
});

export const cloneBrands = (brands: readonly VrfBrand[]): VrfBrand[] => brands.map(cloneBrand);

/** The brand with that id, else the first one available (seeds when the list is empty). */
export function brandOf(brands: readonly VrfBrand[], id: string | undefined): VrfBrand {
  const list = brands.length > 0 ? brands : SEED_BRANDS;
  return list.find((b) => b.id === id) ?? list[0];
}

/** The row whose threshold is the largest one not above `hp` (Excel's approximate VLOOKUP). */
export function lookupRow<T extends { hp: number }>(rows: readonly T[], hp: number): T | undefined {
  const sorted = [...rows].sort((a, b) => a.hp - b.hp);
  let hit: T | undefined;
  for (const r of sorted) {
    if (r.hp <= hp) hit = r;
    else break;
  }
  return hit ?? sorted[0];
}

export interface TubePair {
  gas: Diameter;
  liquid: Diameter;
}

/** Gas and liquid diameters for a run of `role` sized by `hp` under a brand's rules. */
export function sizeRun(brand: VrfBrand, role: VrfRole, hp: number): TubePair {
  const r = lookupRow(brand[role], hp);
  return r ? { gas: r.gas, liquid: r.liquid } : { gas: "1/2", liquid: "1/4" };
}

export const ykitModel = (brand: VrfBrand, hp: number): string =>
  lookupRow(brand.ykit, hp)?.model ?? "";

export interface VrfSettings {
  /** Allowance added to tube lengths and elbow counts, % (the workbook's 10 %). */
  slackPct: number;
  /** Smallest diameter that gets elbows; thinner tubes are bent on site (workbook: 3/8"). */
  elbowsFrom: Diameter;
  /** Insulation thickness used on every tube, mm (13 mm for VRF). */
  insulationMm: number;
  /** Installation labour per evaporator, project currency. */
  laborPerEvap: number;
}

export const DEFAULT_VRF_SETTINGS: VrfSettings = {
  slackPct: 10,
  elbowsFrom: "3/8",
  insulationMm: 13,
  laborPerEvap: 700,
};

export interface VrfRun {
  /** Measurement id, when the run comes from the drawing. */
  id?: string;
  /** Id of the system item the run belongs to. */
  system?: string;
  spec: VrfSpec;
  /** Length in metres (plan + vertical, with repeats applied). */
  length: number;
  vertical?: number;
  /** Where the run is (planta · local), for the exported sheet. */
  tag?: string;
}

/** A run with the diameters its brand rules give it. */
export interface SizedRun extends VrfRun {
  /** HP that sized the run (the system's for main runs). */
  hp: number;
  gas: Diameter;
  liquid: Diameter;
}

export function sizeRuns(runs: VrfRun[], brand: VrfBrand, systemHp: number): SizedRun[] {
  return runs.map((r) => {
    const hp = r.spec.role === "main" ? systemHp : r.spec.hp;
    return { ...r, hp, ...sizeRun(brand, r.spec.role, hp) };
  });
}

export interface VrfBillRow {
  /** Stable name, also the catalog name the price is looked up by. */
  name: string;
  group: string;
  unit: string;
  qty: number;
  /** Price from the workbook's Preços sheet, used when nothing else prices the row. */
  material: number;
  labor: number;
  /** Diameter the row refers to, for weight-based copper pricing. */
  diameter?: Diameter;
  /** Copper tube rows: priced by weight when a price per kg is known. */
  copper?: boolean;
}

export const LABOR_ROW = "Mão de obra de instalação VRF";
export const COPPER_GROUP = "Tubulações";

/** Preços sheet: elbows and 13 mm insulation per diameter, R$/pç and R$/m. */
const ELBOW_PRICE: Partial<Record<Diameter, number>> = {
  "3/8": 1,
  "1/2": 1.7,
  "5/8": 2.7,
  "3/4": 3.9,
  "7/8": 5.2,
  "1": 6.9,
  "1.1/8": 9.1,
  "1.1/4": 10.6,
  "1.3/8": 13.5,
  "1.1/2": 18,
  "1.5/8": 20.5,
  "1.3/4": 20.5,
  "1.7/8": 20.5,
};
const INSULATION_PRICE: Record<Diameter, number> = {
  "1/4": 3.2,
  "3/8": 3.6,
  "1/2": 3.8,
  "5/8": 4.1,
  "3/4": 1.2,
  "7/8": 1.5,
  "1": 1.8,
  "1.1/8": 1.9,
  "1.1/4": 5.3,
  "1.3/8": 5.7,
  "1.1/2": 6.6,
  "1.5/8": 6.8,
  "1.3/4": 6.8,
  "1.7/8": 6.8,
};

export const copperName = (d: Diameter) => `Cobre de ${d}"`;
export const elbowName = (d: Diameter) => `Joelho de Cobre de ${d}"`;
export const insulationName = (d: Diameter, mm: number) =>
  `Isolamento de ${d}" - Espessura ${String(mm).padStart(2, "0")} mm`;
export const ykitName = (model: string) => `Kit de derivação (Y-kit) ${model}`;
export const CABLE_PP = "Cabo PP 3 x 2,5mm²";
export const CABLE_SHIELD = "Cabo Shield 2 x 1,5mm²";
export const BOX_EVAP = "Caixa Polar de Evaporadora";
export const SUPPORT_EVAP = "Suporte da Evaporadora";
export const SUPPORT_COND = "Suporte da Condensadora VRF";

export interface VrfSummary {
  evaporators: number;
  condensers: number;
  /** Σ run lengths (plan + vertical), m, before allowance. */
  lineLength: number;
  /** Y-kits, by model. */
  ykits: { model: string; hp: number; qty: number }[];
}

const roundUp = (v: number) => Math.ceil(v - 1e-9);

/**
 * The Y-kits of a system: one less than its evaporators, each sized by the capacity downstream
 * of it: the whole system at the first joint, then each intermediate run's HP (largest first);
 * joints left without an intermediate run take the smallest one.
 */
export function ykitsOf(brand: VrfBrand, systemHp: number, sized: SizedRun[]): VrfSummary["ykits"] {
  const evaps = sized.filter((r) => r.spec.role === "branch").length;
  const joints = Math.max(0, evaps - 1);
  if (joints === 0) return [];
  const trunks = sized
    .filter((r) => r.spec.role === "trunk")
    .map((r) => r.hp)
    .sort((a, b) => b - a);
  const hps: number[] = [systemHp];
  for (let i = 1; i < joints; i++) {
    hps.push(trunks[i - 1] ?? trunks[trunks.length - 1] ?? systemHp);
  }
  const byModel = new Map<string, { model: string; hp: number; qty: number }>();
  for (const hp of hps) {
    const model = ykitModel(brand, hp);
    const cur = byModel.get(model);
    if (cur) {
      cur.qty++;
      cur.hp = Math.min(cur.hp, hp);
    } else byModel.set(model, { model, hp, qty: 1 });
  }
  return [...byModel.values()].sort((a, b) => b.hp - a.hp);
}

export interface VrfBillResult {
  rows: VrfBillRow[];
  summary: VrfSummary;
  sized: SizedRun[];
}

/**
 * Bill of one system (Resultados sheet), rows with zero quantity omitted: copper, elbows and
 * insulation per diameter, Y-kits, cables, boxes, supports and labour per evaporator.
 */
export function vrfBill(
  runs: VrfRun[],
  brand: VrfBrand,
  systemHp: number,
  settings: VrfSettings = DEFAULT_VRF_SETTINGS,
): VrfBillResult {
  const sized = sizeRuns(runs, brand, systemHp);
  const length = new Map<Diameter, number>();
  const curves = new Map<Diameter, number>();
  let lineLength = 0;
  let evaporators = 0;
  for (const r of sized) {
    lineLength += Math.max(0, r.length);
    if (r.spec.role === "branch") evaporators += 1;
    for (const d of [r.gas, r.liquid]) {
      length.set(d, (length.get(d) ?? 0) + Math.max(0, r.length));
      curves.set(d, (curves.get(d) ?? 0) + Math.max(0, r.spec.curves));
    }
  }
  const slack = 1 + settings.slackPct / 100;
  const rows: VrfBillRow[] = [];
  const add = (
    name: string,
    group: string,
    unit: string,
    qty: number,
    material = 0,
    labor = 0,
    diameter?: Diameter,
    copper = false,
  ) => {
    if (qty > 0) rows.push({ name, group, unit, qty, material, labor, diameter, copper });
  };

  let copperTotal = 0;
  for (const d of DIAMETERS) {
    const m = roundUp((length.get(d) ?? 0) * slack);
    copperTotal += m;
    add(copperName(d), COPPER_GROUP, "m", m, 0, 0, d, true);
  }
  for (const d of DIAMETERS) {
    if (diameterIndex(d) < diameterIndex(settings.elbowsFrom)) continue;
    const n = roundUp((curves.get(d) ?? 0) * slack);
    add(elbowName(d), COPPER_GROUP, "pç", n, ELBOW_PRICE[d] ?? 0, 0, d);
  }
  for (const d of DIAMETERS) {
    const m = roundUp((length.get(d) ?? 0) * slack);
    add(insulationName(d, settings.insulationMm), "Isolamento", "m", m, INSULATION_PRICE[d], 0, d);
  }
  const ykits = ykitsOf(brand, systemHp, sized);
  for (const k of ykits) add(ykitName(k.model), COPPER_GROUP, "pç", k.qty);
  // the cables follow the whole line: half the copper (two tubes per run), as the workbook
  const cable = roundUp(copperTotal / 2);
  add(CABLE_PP, "Elétrica", "m", cable, 3.2);
  add(CABLE_SHIELD, "Elétrica", "m", cable, 2);
  add(BOX_EVAP, "Equipamentos", "pç", evaporators, 26);
  add(SUPPORT_EVAP, "Equipamentos", "pç", evaporators, 50);
  const condensers = sized.length > 0 ? 1 : 0;
  add(SUPPORT_COND, "Equipamentos", "pç", condensers, 70);
  add(LABOR_ROW, "Equipamentos", "pç", evaporators, 0, settings.laborPerEvap);
  return { rows, sized, summary: { evaporators, condensers, lineLength, ykits } };
}

export interface VrfTotals {
  material: number;
  labor: number;
}

export function vrfTotals(rows: VrfBillRow[], price: (row: VrfBillRow) => number): VrfTotals {
  let material = 0;
  let labor = 0;
  for (const r of rows) {
    if (r.name === LABOR_ROW) labor += r.qty * r.labor;
    else material += r.qty * price(r);
  }
  return { material: Math.round(material * 100) / 100, labor: Math.round(labor * 100) / 100 };
}

export const formatHp = (hp: number): string =>
  `${hp.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} HP`;

/** "Evap. 1,5 HP" · "Cond. 22 HP": the label drawn on the run. */
export const vrfTag = (spec: VrfSpec, systemHp: number): string =>
  `${ROLE_SHORT[spec.role]} ${formatHp(spec.role === "main" ? systemHp : spec.hp)}`;

/** Capacities evaporators and condensers usually come in, for quick picking. */
export const HP_SUGGESTIONS = [
  0.8, 1, 1.25, 1.5, 1.6, 2, 2.3, 2.5, 3, 3.2, 3.6, 4, 4.5, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24,
  26, 28, 30, 32, 36,
];
