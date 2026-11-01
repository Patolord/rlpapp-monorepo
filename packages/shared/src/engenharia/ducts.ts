/**
 * Rectangular sheet-metal duct take-off, replicating RLP's "Levantamento Dutos conforme NBR 16401"
 * workbook: each measured run has a section (lado maior × lado menor), an external insulation,
 * an internal lining, a flange type and optional rechapeamento; the bill of materials (sheet
 * metal per gauge, insulation, tapes, flanges, paint, supports, labour) is computed for the
 * whole set of runs, exactly as the Calculos and Resumo sheets do.
 *
 * This is the single duct calculator of the monorepo: the takeoff desktop app uses it (and fills
 * the official .xlsx with it); framework-free so any app or the backend can import it.
 */

export type DuctInsulation = "S" | "L" | "I" | "P" | "T";
export type DuctInner = "S" | "B" | "F";
export type DuctFlange = "S" | "P" | "C";

export interface DuctSpec {
  /** Lado maior, cm. */
  a: number;
  /** Lado menor, cm. */
  b: number;
  /** External: S sem, L manta lã de vidro, I isopor, P placa lã de vidro, T pintura. */
  insulation: DuctInsulation;
  /** Internal lining: S sem, B bidim, F flexiliner. */
  inner: DuctInner;
  /** S sem flange, P Powermatic, C cantoneira. */
  flange: DuctFlange;
  rechapeado: boolean;
  paintRechap: boolean;
}

export interface DuctSettings {
  /** 1 ABNT, 2 ABNT v.2008, 3 ABNT c/ reforço TR. */
  norma: 1 | 2 | 3;
  /** External insulation thickness, mm. */
  insulThickness: number;
  /** Flange spacing (duct section length), m. */
  flangeSpacing: number;
  /** Rechapeamento thickness, mm. */
  rechapThickness: number;
  /** Sheet-metal allowance %, or null for the workbook rule (20 %, 15 % above 10 000 kg). */
  sheetSlackPct: number | null;
  insulSlackPct: number;
  supportsPct: number;
  /** Labour, R$ per kg of sheet metal (doubled below 500 kg, as in the workbook). */
  laborPerKg: number;
}

export const DEFAULT_DUCT_SETTINGS: DuctSettings = {
  norma: 2,
  insulThickness: 25,
  flangeSpacing: 1,
  rechapThickness: 25,
  sheetSlackPct: null,
  insulSlackPct: 15,
  supportsPct: 30,
  laborPerKg: 18,
};

export const DEFAULT_DUCT_SPEC: DuctSpec = {
  a: 40,
  b: 25,
  insulation: "S",
  inner: "S",
  flange: "P",
  rechapeado: false,
  paintRechap: false,
};

export const INSULATION_LABELS: Record<DuctInsulation, string> = {
  S: "Sem isolamento",
  L: "Manta lã de vidro",
  I: "Isopor",
  P: "Placa lã de vidro",
  T: "Pintura",
};
export const INNER_LABELS: Record<DuctInner, string> = {
  S: "Sem revestimento",
  B: "Bidim",
  F: "Flexiliner",
};
export const FLANGE_LABELS: Record<DuctFlange, string> = {
  S: "Sem flange",
  P: "Powermatic",
  C: "Cantoneira",
};
export const NORMA_LABELS: Record<DuctSettings["norma"], string> = {
  1: "ABNT",
  2: "ABNT v.2008",
  3: "ABNT (c/ reforço TR)",
};

/** Gauges in order, with the default sheet weight, kg/m² (supplier table, Salviaco). */
export const GAUGES = [
  { name: "# 26", kgm2: 4.38 },
  { name: "# 24", kgm2: 4.82 },
  { name: "# 22", kgm2: 6.82 },
  { name: "# 20", kgm2: 8.03 },
  { name: "# 18", kgm2: 10.6 },
] as const;

/** Sheet weight (kg/m²) by gauge name, as edited with the catalog; a missing one = the default. */
export type GaugeWeights = Record<string, number>;

export const defaultGaugeWeights = (): GaugeWeights =>
  Object.fromEntries(GAUGES.map((g) => [g.name, g.kgm2]));

/** Position in GAUGES: 0 = # 26 … 4 = # 18. */
export type GaugeIndex = 0 | 1 | 2 | 3 | 4;

/** One value per gauge, in GAUGES order. */
export type PerGauge = [number, number, number, number, number];

const GAUGE_INDEXES: readonly GaugeIndex[] = [0, 1, 2, 3, 4];

/** Sheet weight of each gauge, in GAUGES order: the setting when valid, else the default. */
export function gaugeKgm2(weights?: GaugeWeights): PerGauge {
  const weight = (g: (typeof GAUGES)[number]) => {
    const w = weights?.[g.name];
    return w !== undefined && w > 0 ? w : g.kgm2;
  };
  const [g26, g24, g22, g20, g18] = GAUGES;
  return [weight(g26), weight(g24), weight(g22), weight(g20), weight(g18)];
}

/** Largest lado maior (cm) each gauge covers, per norma; beyond the last is # 18. */
const LIMITS: Record<DuctSettings["norma"], [number, number, number, number]> = {
  1: [30, 75, 140, 210],
  2: [70, 90, 120, 150],
  3: [90, 120, 150, 180],
};

/** Index into GAUGES for a duct whose larger side is `aCm`. */
export function gaugeIndex(aCm: number, norma: DuctSettings["norma"]): GaugeIndex {
  const [l26, l24, l22, l20] = LIMITS[norma];
  if (aCm <= l26) return 0;
  if (aCm <= l24) return 1;
  if (aCm <= l22) return 2;
  if (aCm <= l20) return 3;
  return 4;
}

export const gaugeName = (aCm: number, norma: DuctSettings["norma"]): string =>
  GAUGES[gaugeIndex(aCm, norma)].name;

export const ductLabel = (s: DuctSpec): string => `Duto ${s.a}×${s.b} cm`;

export interface DuctRun {
  /** Measurement id, when the run comes from the drawing. */
  id?: string;
  /** Id of the "Rede de dutos" item the run belongs to (absent in pure calculations). */
  network?: string;
  /** Vertical part of the length, metres (already included in `length`). */
  vertical?: number;
  spec: DuctSpec;
  /** Where the run is (planta · local), for the TAG column of the exported workbook. */
  tag?: string;
  /** Discipline of the run's item (pressurização, tomada de ar…); networks are per discipline. */
  system?: string;
  /** Length in metres (already including vertical, factor and multipliers). */
  length: number;
}

export interface DuctBillRow {
  /** Stable id (name) used to upsert the derived item. */
  name: string;
  group: string;
  unit: string;
  qty: number;
  /** Prices from the workbook's Tab_Precos, used when the catalog has no entry of that name. */
  material: number;
  labor: number;
}

const round0 = (v: number) => Math.round(v);

/** Name of the labour row of the bill (kg of sheet metal × R$/kg). */
export const LABOR_ROW = "Mão de obra - rede de dutos";

export interface DuctTotals {
  /** Σ qty × unit price of every material row. */
  material: number;
  /** Labour: kg × R$/kg (doubled below 500 kg). */
  labor: number;
  kg: number;
  laborRate: number;
}

export function billTotals(rows: DuctBillRow[], price: (row: DuctBillRow) => number): DuctTotals {
  let material = 0;
  let labor = 0;
  let kg = 0;
  let laborRate = 0;
  for (const r of rows) {
    if (r.name === LABOR_ROW) {
      kg = r.qty;
      laborRate = r.labor;
      labor += r.qty * r.labor;
    } else {
      material += r.qty * price(r);
    }
  }
  return {
    material: Math.round(material * 100) / 100,
    labor: Math.round(labor * 100) / 100,
    kg,
    laborRate,
  };
}

/** Bill of materials for a set of duct runs (Resumo sheet), rows with zero quantity omitted. */
export function ductBill(
  runs: DuctRun[],
  settings: DuctSettings = DEFAULT_DUCT_SETTINGS,
  weights?: GaugeWeights,
): DuctBillRow[] {
  const s = settings;
  const kgm2 = gaugeKgm2(weights);
  const areaByGauge: PerGauge = [0, 0, 0, 0, 0];
  let manta = 0;
  let isopor = 0;
  let placa = 0;
  let pintura = 0;
  let bidim = 0;
  let flexiliner = 0;
  let pw1 = 0;
  let pw2 = 0;
  let flangeCant = 0;
  let reinforce = 0;
  let cantos = 0;
  let grampos = 0;
  let rechap = 0;
  let paintRechap = 0;
  let fitaNylon = 0;
  let fechos = 0;
  let fitaAlum = 0;
  let cantoneiraArea = 0;

  for (const { spec, length: D } of runs) {
    if (D <= 0 || spec.a <= 0 || spec.b <= 0) continue;
    const per = ((spec.a + spec.b) / 100) * 2;
    const area = per * D;
    areaByGauge[gaugeIndex(spec.a, s.norma)] += area;
    switch (spec.insulation) {
      case "L":
        manta += area;
        break;
      case "I":
        isopor += area;
        break;
      case "P":
        placa += area;
        break;
      case "T":
        pintura += area;
        break;
      default:
        break;
    }
    if (spec.inner === "B") bidim += area;
    if (spec.inner === "F") flexiliner += area;
    const sections = D / s.flangeSpacing;
    if (spec.flange === "P") {
      if (spec.a <= 200) pw1 += sections * per * 2;
      else pw2 += sections * per * 2;
      cantos += sections * 8;
      if (spec.a > 30) grampos += sections * 4;
    } else if (spec.flange === "C") {
      flangeCant += sections * per * 2;
    }
    if (spec.a > 220) reinforce += sections * per * 2;
    if (spec.rechapeado) {
      const t = s.rechapThickness / 1000;
      const q = (spec.a / 100 + t + (spec.b / 100 + t)) * 2 * D;
      rechap += q;
      if (spec.paintRechap) paintRechap += q;
    }
    if (spec.insulation === "L" || spec.insulation === "I" || spec.insulation === "P") {
      fitaNylon += round0((D / 0.5) * (per + 0.2) * 1.2);
      fechos += (D / 0.5) * 1.5;
    }
    if (spec.insulation === "L") fitaAlum += round0(D + D * per * 2 * 1.1);
    if (spec.insulation === "I" || spec.insulation === "P") {
      cantoneiraArea += (s.insulThickness / 1000 + 0.02) * D * 4 * 1.3;
    }
  }

  // rechapeamento and cantoneira are # 26 sheet: same weight as the first gauge of the table
  const rechapKg = rechap * kgm2[0];
  const rawKg = GAUGE_INDEXES.reduce<number>((t, i) => t + areaByGauge[i] * kgm2[i], 0) + rechapKg;
  const sheetSlack = (s.sheetSlackPct ?? (rawKg > 10000 ? 15 : 20)) / 100 + 1;
  const insulSlack = s.insulSlackPct / 100 + 1;

  const rows: DuctBillRow[] = [];
  const add = (name: string, group: string, unit: string, qty: number, material = 0, labor = 0) => {
    if (qty > 0) rows.push({ name, group, unit, qty, material, labor });
  };

  const sheetGroup = "Rede de Dutos";
  let sheetKg = 0;
  for (const i of GAUGE_INDEXES) {
    const kg = round0(areaByGauge[i] * kgm2[i] * sheetSlack);
    sheetKg += kg;
    add(`Chapa galvanizada ${GAUGES[i].name}`, sheetGroup, "kg", kg, 17);
  }
  const rechapRounded = round0(rechapKg);
  const cantoneiraKg = round0(cantoneiraArea * kgm2[0]);
  sheetKg += rechapRounded + cantoneiraKg;
  add("Chapa galvanizada # 26 (rechapeamento)", sheetGroup, "kg", rechapRounded, 17);
  add("Chapa galvanizada # 26 (cantoneira)", sheetGroup, "kg", cantoneiraKg, 17);

  const iso = "Isolamento";
  const isoporQ = round0(isopor * insulSlack);
  const mantaQ = round0(manta * insulSlack);
  const placaQ = round0(placa * insulSlack);
  const bidimQ = round0(bidim * insulSlack);
  const flexQ = round0(flexiliner * insulSlack);
  add("Isopor F1", iso, "m²", isoporQ, 6.6);
  add("Manta lã de vidro", iso, "m²", mantaQ, 15);
  add("Placa lã de vidro", iso, "m²", placaQ, 130);
  add("Bidim OP-60", iso, "m²", bidimQ, 6);
  add("Flexiliner", iso, "m²", flexQ, 17.53);
  add(
    "Cola HI-17 ou Over-cola",
    iso,
    "gl",
    round0(((isoporQ + mantaQ + placaQ + bidimQ) * 0.45) / 3.6),
    15.5,
  );
  add("Frio Asfalto", iso, "bd", round0(isoporQ / 80), 62.66);
  add('Fita de Nylon ½"', iso, "m", fitaNylon, 0.03);
  add('Fecho p/ fita de nylon ½"', iso, "pç", round0(fechos), 0.1);
  add("Fita aluminizada", iso, "m", fitaAlum, 0.1);

  const paintM2 = round0(pintura * insulSlack + paintRechap * insulSlack);
  if (paintM2 > 0) {
    const fundo = round0(paintM2 / 25);
    const acab = round0((paintM2 / 20) * 2);
    add("Tinta de fundo - Zarcão", "Pintura", "gl", fundo, 95);
    add("Tinta Acabamento", "Pintura", "gl", acab, 150);
    add("Trincha / rolinho", "Pintura", "pç", round0((fundo + acab) / 10), 6);
    add("Tinner", "Pintura", "l", round0((fundo + acab) / 0.5), 12);
  }

  add("Suportes de dutos", "Suportes", "kg", round0((sheetKg * s.supportsPct) / 100), 2);

  const pw1Q = round0(pw1 * insulSlack);
  const pw2Q = round0(pw2 * insulSlack);
  add("Powermatic (PW2 leve)", sheetGroup, "m", pw1Q, 5);
  add("Powermatic (PW2)", sheetGroup, "m", pw2Q, 6);
  add("Cantos Powermatic", sheetGroup, "pç", round0(cantos), 0.84);
  add("Grampo Powermatic", sheetGroup, "pç", round0(grampos), 1);
  add("Rebite", sheetGroup, "pç", round0((pw1Q + pw2Q) / 2 / 0.2), 0.1);
  add("Fita Adesiva Powermatic", sheetGroup, "m", round0((pw1Q + pw2Q) / 2), 2);
  add(
    "Flange em Fº Cantoneira",
    sheetGroup,
    "kg",
    round0((flangeCant + reinforce) * 2.66 * 1.3),
    2.5,
  );

  if (sheetKg > 0) {
    const perKg = sheetKg < 500 ? s.laborPerKg * 2 : s.laborPerKg;
    add(LABOR_ROW, sheetGroup, "kg", sheetKg, 0, perKg);
  }
  return rows;
}
