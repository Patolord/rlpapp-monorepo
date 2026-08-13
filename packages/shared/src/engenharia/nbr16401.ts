/** Levantamento de dutos conforme NBR 16401 (planilha RLP v. 2.0). */

export type NormaId = 1 | 2 | 3;

export type ExternalInsulation =
  | "none"
  | "manta"
  | "isopor"
  | "placa"
  | "pintura";

export type InternalInsulation = "none" | "bidim" | "flexiliner";

export type FlangeType = "none" | "powermatic" | "cantoneira";

export type SheetGauge = "26" | "24" | "22" | "20" | "18";

export type BomPriceKey =
  | "sheet26"
  | "sheet24"
  | "sheet22"
  | "sheet20"
  | "sheet18"
  | "sheet26Reclad"
  | "sheet26Angle"
  | "isopor"
  | "manta"
  | "placa"
  | "bidim"
  | "flexiliner"
  | "glue"
  | "coldAsphalt"
  | "nylonTape"
  | "nylonClip"
  | "alumTape"
  | "primerPaint"
  | "finishPaint"
  | "brush"
  | "thinner"
  | "supports"
  | "spliters"
  | "captors"
  | "pw2Light"
  | "pw2"
  | "pwCorners"
  | "pwClamps"
  | "rivets"
  | "pwTape"
  | "angleFlange";

export type BomSectionId =
  | "sheets"
  | "insulation"
  | "paint"
  | "supports"
  | "accessories"
  | "flanges";

export const MAX_DUCT_LINES = 500;

export const NORMA_LABELS: Record<NormaId, string> = {
  1: "ABNT",
  2: "ABNT v.2008",
  3: "ABNT (c/ reforço TR)",
};

export const EXTERNAL_INSULATION_LABELS: Record<ExternalInsulation, string> = {
  none: "S = sem isolamento",
  manta: "L = Manta lã vidro",
  isopor: "I = Isopor",
  placa: "P = Placa lã vidro",
  pintura: "T = Pintura",
};

export const INTERNAL_INSULATION_LABELS: Record<InternalInsulation, string> = {
  none: "S = sem isol.",
  bidim: "B = Bidim",
  flexiliner: "F = Flexiliner",
};

export const FLANGE_LABELS: Record<FlangeType, string> = {
  none: "S = sem flange",
  powermatic: "P = Powermatic",
  cantoneira: "C = Cantoneira",
};

/** Densidade kg/m² das chapas (Calculos C3:C7). */
const SHEET_DENSITY: Record<SheetGauge, number> = {
  "26": 4.5,
  "24": 5.7,
  "22": 6.8,
  "20": 8.1,
  "18": 10.5,
};

/**
 * Limite do lado maior (cm) para cada bitola, por norma.
 * #18 aplica-se acima do limite de #20.
 */
const GAUGE_LIMITS: Record<
  NormaId,
  { g26: number; g24: number; g22: number; g20: number }
> = {
  1: { g26: 30, g24: 75, g22: 140, g20: 210 },
  2: { g26: 70, g24: 90, g22: 120, g20: 150 },
  3: { g26: 90, g24: 120, g22: 150, g20: 180 },
};

export const DEFAULT_PRICES: Record<BomPriceKey, number> = {
  sheet26: 17,
  sheet24: 17,
  sheet22: 17,
  sheet20: 17,
  sheet18: 17,
  sheet26Reclad: 17,
  sheet26Angle: 17,
  isopor: 6.6,
  manta: 15,
  placa: 130,
  bidim: 6,
  flexiliner: 17.53,
  glue: 15.5,
  coldAsphalt: 62.66,
  nylonTape: 0.03,
  nylonClip: 0.1,
  alumTape: 0.1,
  primerPaint: 95,
  finishPaint: 150,
  brush: 6,
  thinner: 12,
  supports: 2,
  spliters: 14,
  captors: 9.6,
  pw2Light: 5,
  pw2: 6,
  pwCorners: 0.84,
  pwClamps: 1,
  rivets: 0.1,
  pwTape: 2,
  angleFlange: 2.5,
};

export const BOM_ITEM_DEFS: readonly {
  key: BomPriceKey;
  section: BomSectionId;
  label: string;
  unit: string;
}[] = [
  { key: "sheet26", section: "sheets", label: "# 26", unit: "kg" },
  { key: "sheet24", section: "sheets", label: "# 24", unit: "kg" },
  { key: "sheet22", section: "sheets", label: "# 22", unit: "kg" },
  { key: "sheet20", section: "sheets", label: "# 20", unit: "kg" },
  { key: "sheet18", section: "sheets", label: "# 18", unit: "kg" },
  {
    key: "sheet26Reclad",
    section: "sheets",
    label: "# 26 (rechapeamento)",
    unit: "kg",
  },
  {
    key: "sheet26Angle",
    section: "sheets",
    label: "# 26 (cantoneira)",
    unit: "kg",
  },
  { key: "isopor", section: "insulation", label: "Isopor F1", unit: "m²" },
  {
    key: "manta",
    section: "insulation",
    label: "Manta lã de vidro",
    unit: "m²",
  },
  {
    key: "placa",
    section: "insulation",
    label: "Placa lã de vidro",
    unit: "m²",
  },
  { key: "bidim", section: "insulation", label: "Bidim OP-60", unit: "m²" },
  { key: "flexiliner", section: "insulation", label: "Flexiliner", unit: "m²" },
  {
    key: "glue",
    section: "insulation",
    label: "Cola HI-17 ou Over-cola",
    unit: "gl",
  },
  { key: "coldAsphalt", section: "insulation", label: "Frio Asfalto", unit: "bd" },
  {
    key: "nylonTape",
    section: "insulation",
    label: 'Fita de Nylon ½"',
    unit: "m",
  },
  {
    key: "nylonClip",
    section: "insulation",
    label: 'Fecho p/ fita de nylon ½"',
    unit: "pç",
  },
  {
    key: "alumTape",
    section: "insulation",
    label: "Fita aluminizada",
    unit: "m",
  },
  {
    key: "primerPaint",
    section: "paint",
    label: "Tinta de fundo - Zarcão",
    unit: "gl",
  },
  { key: "finishPaint", section: "paint", label: "Tinta Acabamento", unit: "gl" },
  { key: "brush", section: "paint", label: "Trincha / rolinho", unit: "pç" },
  { key: "thinner", section: "paint", label: "Tinner", unit: "l" },
  { key: "supports", section: "supports", label: "Suportes", unit: "kg" },
  { key: "spliters", section: "accessories", label: "Spliters", unit: "pç" },
  {
    key: "captors",
    section: "accessories",
    label: "Captor c/ Haste Articulada",
    unit: "pç",
  },
  {
    key: "pw2Light",
    section: "flanges",
    label: "Powermatic (PW2 leve)",
    unit: "m",
  },
  { key: "pw2", section: "flanges", label: "Powermatic (PW2)", unit: "m" },
  {
    key: "pwCorners",
    section: "flanges",
    label: "Cantos Powermatic",
    unit: "pç",
  },
  {
    key: "pwClamps",
    section: "flanges",
    label: "Grampo Powermatic",
    unit: "pç",
  },
  { key: "rivets", section: "flanges", label: "Rebite", unit: "pç" },
  {
    key: "pwTape",
    section: "flanges",
    label: "Fita Adesiva Powermatic",
    unit: "m",
  },
  {
    key: "angleFlange",
    section: "flanges",
    label: "Flange em Fº Cantoneira",
    unit: "kg",
  },
];

export const BOM_SECTION_LABELS: Record<BomSectionId, string> = {
  sheets: "Chapas Galvanizadas",
  insulation: "Isolamento",
  paint: "Pintura",
  supports: "Suportes",
  accessories: "Acessórios",
  flanges: "Flanges",
};

export type DuctLineInput = {
  tag?: string;
  largerSideCm: number;
  smallerSideCm: number;
  lengthM: number;
  externalInsulation: ExternalInsulation;
  internalInsulation: InternalInsulation;
  flange: FlangeType;
  reclad: boolean;
  paintReclad: boolean;
};

export type DuctEstimateInput = {
  norma: NormaId;
  laborRatePerKg: number;
  insulationAllowancePct: number;
  supportAllowancePct: number;
  insulationThicknessMm: number;
  flangeSpacingM: number;
  recladThicknessMm: number;
  splitersQty: number;
  captorsQty: number;
  prices: Record<BomPriceKey, number>;
  lines: DuctLineInput[];
};

export type DuctLineResult = {
  gauge: SheetGauge | null;
  areaM2: number;
  perimeterM: number;
};

export type BomRow = {
  key: BomPriceKey;
  section: BomSectionId;
  label: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type DuctEstimateResult = {
  lines: DuctLineResult[];
  sheetAllowancePct: number;
  rawSheetKg: number;
  sheetKg: number;
  bom: BomRow[];
  sectionTotals: Record<BomSectionId, number>;
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
  materialPerKg: number;
  laborPerKg: number;
  totalPerKg: number;
};

export function emptyDuctLine(): DuctLineInput {
  return {
    tag: "",
    largerSideCm: 0,
    smallerSideCm: 0,
    lengthM: 0,
    externalInsulation: "none",
    internalInsulation: "none",
    flange: "powermatic",
    reclad: false,
    paintReclad: false,
  };
}

export function defaultDuctPrices(): Record<BomPriceKey, number> {
  return { ...DEFAULT_PRICES };
}

export function defaultDuctEstimateInput(): Omit<DuctEstimateInput, "lines"> {
  return {
    norma: 1,
    laborRatePerKg: 18,
    insulationAllowancePct: 15,
    supportAllowancePct: 30,
    insulationThicknessMm: 25,
    flangeSpacingM: 1,
    recladThicknessMm: 25,
    splitersQty: 0,
    captorsQty: 0,
    prices: defaultDuctPrices(),
  };
}

export function isFilledDuctLine(line: DuctLineInput): boolean {
  return (
    Boolean(line.tag?.trim()) ||
    line.largerSideCm > 0 ||
    line.smallerSideCm > 0 ||
    line.lengthM > 0
  );
}

export function mergeDuctPrices(
  prices: Partial<Record<BomPriceKey, number>> | undefined
): Record<BomPriceKey, number> {
  const merged = defaultDuctPrices();
  if (!prices) return merged;
  for (const key of Object.keys(DEFAULT_PRICES) as BomPriceKey[]) {
    const value = prices[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      merged[key] = value;
    }
  }
  return merged;
}

/** Excel ROUND (half away from zero) for the non-negative quantities here. */
function excelRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function sheetAreaM2(line: DuctLineInput): number {
  return (
    ((line.largerSideCm / 100 + line.smallerSideCm / 100) * 2) * line.lengthM
  );
}

function perimeterM(line: DuctLineInput): number {
  return ((line.largerSideCm + line.smallerSideCm) / 100) * 2;
}

export function selectGauge(
  largerSideCm: number,
  norma: NormaId
): SheetGauge | null {
  if (!(largerSideCm > 0)) return null;
  const limits = GAUGE_LIMITS[norma];
  if (largerSideCm <= limits.g26) return "26";
  if (largerSideCm <= limits.g24) return "24";
  if (largerSideCm <= limits.g22) return "22";
  if (largerSideCm <= limits.g20) return "20";
  return "18";
}

type RawLine = {
  sheetArea: Record<SheetGauge, number>;
  perimeter: number;
  manta: number;
  isopor: number;
  placa: number;
  bidim: number;
  flexiliner: number;
  paint: number;
  pw1: number;
  pw2: number;
  angleFlangeM: number;
  recladArea: number;
  paintReclad: number;
  nylonManta: number;
  nylonIsopor: number;
  nylonPlaca: number;
  clipManta: number;
  clipIsopor: number;
  clipPlaca: number;
  alumTape: number;
  pwCorners: number;
  pwClamps: number;
  angleOver220: number;
  angleIsopor: number;
  anglePlaca: number;
};

function zeroSheetArea(): Record<SheetGauge, number> {
  return { "26": 0, "24": 0, "22": 0, "20": 0, "18": 0 };
}

function computeRawLine(
  line: DuctLineInput,
  input: DuctEstimateInput
): { raw: RawLine; result: DuctLineResult } {
  const area = sheetAreaM2(line);
  const peri = perimeterM(line);
  const gauge = selectGauge(line.largerSideCm, input.norma);
  const sheetArea = zeroSheetArea();
  if (gauge) sheetArea[gauge] = area;

  const spacing = input.flangeSpacingM > 0 ? input.flangeSpacingM : 0;
  const joints = spacing > 0 ? line.lengthM / spacing : 0;
  const flangeLen = joints * peri * 2;

  const recladArea = line.reclad
    ? ((line.largerSideCm / 100 + input.recladThicknessMm / 1000) +
        (line.smallerSideCm / 100 + input.recladThicknessMm / 1000)) *
      2 *
      line.lengthM
    : 0;

  const nylon = excelRound((line.lengthM / 0.5) * (peri + 0.2) * 1.2);
  const clips = (line.lengthM / 0.5) * 1.5;
  const alum =
    line.externalInsulation === "manta"
      ? excelRound(line.lengthM + line.lengthM * peri * 2 * 1.1)
      : 0;
  const angleSheet =
    ((input.insulationThicknessMm / 1000 + 0.02) * line.lengthM) * 4 * 1.3;

  const raw: RawLine = {
    sheetArea,
    perimeter: peri,
    manta: line.externalInsulation === "manta" ? area : 0,
    isopor: line.externalInsulation === "isopor" ? area : 0,
    placa: line.externalInsulation === "placa" ? area : 0,
    bidim: line.internalInsulation === "bidim" ? area : 0,
    flexiliner: line.internalInsulation === "flexiliner" ? area : 0,
    paint: line.externalInsulation === "pintura" ? area : 0,
    pw1:
      line.flange === "powermatic" && line.largerSideCm <= 200 ? flangeLen : 0,
    pw2:
      line.flange === "powermatic" && line.largerSideCm > 200 ? flangeLen : 0,
    angleFlangeM: line.flange === "cantoneira" ? flangeLen : 0,
    recladArea,
    paintReclad: line.paintReclad ? recladArea : 0,
    nylonManta: line.externalInsulation === "manta" ? nylon : 0,
    nylonIsopor: line.externalInsulation === "isopor" ? nylon : 0,
    nylonPlaca: line.externalInsulation === "placa" ? nylon : 0,
    clipManta: line.externalInsulation === "manta" ? clips : 0,
    clipIsopor: line.externalInsulation === "isopor" ? clips : 0,
    clipPlaca: line.externalInsulation === "placa" ? clips : 0,
    alumTape: alum,
    pwCorners: line.flange === "powermatic" ? joints * 8 : 0,
    pwClamps:
      line.flange === "powermatic" && line.largerSideCm > 30 ? joints * 4 : 0,
    angleOver220: line.largerSideCm > 220 ? flangeLen : 0,
    angleIsopor: line.externalInsulation === "isopor" ? angleSheet : 0,
    anglePlaca: line.externalInsulation === "placa" ? angleSheet : 0,
  };

  return {
    raw,
    result: { gauge, areaM2: area, perimeterM: peri },
  };
}

function sumRaw(lines: RawLine[]): RawLine {
  const total: RawLine = {
    sheetArea: zeroSheetArea(),
    perimeter: 0,
    manta: 0,
    isopor: 0,
    placa: 0,
    bidim: 0,
    flexiliner: 0,
    paint: 0,
    pw1: 0,
    pw2: 0,
    angleFlangeM: 0,
    recladArea: 0,
    paintReclad: 0,
    nylonManta: 0,
    nylonIsopor: 0,
    nylonPlaca: 0,
    clipManta: 0,
    clipIsopor: 0,
    clipPlaca: 0,
    alumTape: 0,
    pwCorners: 0,
    pwClamps: 0,
    angleOver220: 0,
    angleIsopor: 0,
    anglePlaca: 0,
  };
  for (const line of lines) {
    for (const gauge of Object.keys(SHEET_DENSITY) as SheetGauge[]) {
      total.sheetArea[gauge] += line.sheetArea[gauge];
    }
    total.perimeter += line.perimeter;
    total.manta += line.manta;
    total.isopor += line.isopor;
    total.placa += line.placa;
    total.bidim += line.bidim;
    total.flexiliner += line.flexiliner;
    total.paint += line.paint;
    total.pw1 += line.pw1;
    total.pw2 += line.pw2;
    total.angleFlangeM += line.angleFlangeM;
    total.recladArea += line.recladArea;
    total.paintReclad += line.paintReclad;
    total.nylonManta += line.nylonManta;
    total.nylonIsopor += line.nylonIsopor;
    total.nylonPlaca += line.nylonPlaca;
    total.clipManta += line.clipManta;
    total.clipIsopor += line.clipIsopor;
    total.clipPlaca += line.clipPlaca;
    total.alumTape += line.alumTape;
    total.pwCorners += line.pwCorners;
    total.pwClamps += line.pwClamps;
    total.angleOver220 += line.angleOver220;
    total.angleIsopor += line.angleIsopor;
    total.anglePlaca += line.anglePlaca;
  }
  return total;
}

function withAllowance(value: number, pct: number): number {
  return value * (pct / 100 + 1);
}

export function computeDuctEstimate(
  input: DuctEstimateInput
): DuctEstimateResult {
  const prices = mergeDuctPrices(input.prices);
  const computedLines: DuctLineResult[] = [];
  const rawLines: RawLine[] = [];

  for (const line of input.lines) {
    const { raw, result } = computeRawLine(line, input);
    rawLines.push(raw);
    computedLines.push(result);
  }

  const summed = sumRaw(rawLines);

  const sheetKgRaw: Record<SheetGauge, number> = {
    "26": summed.sheetArea["26"] * SHEET_DENSITY["26"],
    "24": summed.sheetArea["24"] * SHEET_DENSITY["24"],
    "22": summed.sheetArea["22"] * SHEET_DENSITY["22"],
    "20": summed.sheetArea["20"] * SHEET_DENSITY["20"],
    "18": summed.sheetArea["18"] * SHEET_DENSITY["18"],
  };
  const recladKg = summed.recladArea * SHEET_DENSITY["26"];
  const rawSheetKg =
    sheetKgRaw["26"] +
    sheetKgRaw["24"] +
    sheetKgRaw["22"] +
    sheetKgRaw["20"] +
    sheetKgRaw["18"] +
    recladKg;
  const sheetAllowancePct = rawSheetKg > 10000 ? 15 : 20;
  const insPct = input.insulationAllowancePct;

  const qty: Record<BomPriceKey, number> = {
    sheet26: excelRound(withAllowance(sheetKgRaw["26"], sheetAllowancePct)),
    sheet24: excelRound(withAllowance(sheetKgRaw["24"], sheetAllowancePct)),
    sheet22: excelRound(withAllowance(sheetKgRaw["22"], sheetAllowancePct)),
    sheet20: excelRound(withAllowance(sheetKgRaw["20"], sheetAllowancePct)),
    sheet18: excelRound(withAllowance(sheetKgRaw["18"], sheetAllowancePct)),
    sheet26Reclad: excelRound(recladKg),
    sheet26Angle: excelRound(
      summed.angleIsopor * SHEET_DENSITY["26"] +
        summed.anglePlaca * SHEET_DENSITY["26"]
    ),
    isopor: excelRound(withAllowance(summed.isopor, insPct)),
    manta: excelRound(withAllowance(summed.manta, insPct)),
    placa: excelRound(withAllowance(summed.placa, insPct)),
    bidim: excelRound(withAllowance(summed.bidim, insPct)),
    flexiliner: excelRound(withAllowance(summed.flexiliner, insPct)),
    glue: 0,
    coldAsphalt: 0,
    nylonTape:
      summed.nylonManta + summed.nylonIsopor + summed.nylonPlaca,
    nylonClip: summed.clipManta + summed.clipIsopor + summed.clipPlaca,
    alumTape: summed.alumTape,
    primerPaint: 0,
    finishPaint: 0,
    brush: 0,
    thinner: 0,
    supports: 0,
    spliters: input.splitersQty,
    captors: input.captorsQty,
    pw2Light: excelRound(withAllowance(summed.pw1, insPct)),
    pw2: excelRound(withAllowance(summed.pw2, insPct)),
    pwCorners: summed.pwCorners,
    pwClamps: summed.pwClamps,
    rivets: 0,
    pwTape: 0,
    angleFlange: excelRound(
      (summed.angleFlangeM + summed.angleOver220) * 2.66 * 1.3
    ),
  };

  qty.glue = excelRound(
    ((qty.isopor + qty.manta + qty.placa + qty.bidim) * 0.45) / 3.6
  );
  qty.coldAsphalt = excelRound(qty.isopor / 80);

  const paintArea = excelRound(
    withAllowance(summed.paint, insPct) +
      withAllowance(summed.paintReclad, insPct)
  );
  qty.primerPaint = excelRound(paintArea / 25);
  qty.finishPaint = excelRound((paintArea / 20) * 2);
  qty.brush = excelRound((qty.primerPaint + qty.finishPaint) / 10);
  qty.thinner = excelRound((qty.primerPaint + qty.finishPaint) / 0.5);

  const sheetKg =
    qty.sheet26 +
    qty.sheet24 +
    qty.sheet22 +
    qty.sheet20 +
    qty.sheet18 +
    qty.sheet26Reclad +
    qty.sheet26Angle;
  qty.supports = excelRound((sheetKg * input.supportAllowancePct) / 100);

  qty.rivets = excelRound((qty.pw2Light + qty.pw2) / 2 / 0.2);
  qty.pwTape = excelRound((qty.pw2Light + qty.pw2) / 2);

  const bom: BomRow[] = BOM_ITEM_DEFS.map((def) => {
    const quantity = qty[def.key];
    const unitPrice = prices[def.key];
    return {
      ...def,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };
  });

  const sectionTotals: Record<BomSectionId, number> = {
    sheets: 0,
    insulation: 0,
    paint: 0,
    supports: 0,
    accessories: 0,
    flanges: 0,
  };
  for (const row of bom) {
    sectionTotals[row.section] += row.total;
  }

  const materialTotal = excelRound(
    sectionTotals.sheets +
      sectionTotals.insulation +
      sectionTotals.paint +
      sectionTotals.supports +
      sectionTotals.accessories +
      sectionTotals.flanges
  );
  const laborTotal =
    sheetKg < 500
      ? sheetKg * input.laborRatePerKg * 2
      : sheetKg * input.laborRatePerKg;
  const grandTotal = materialTotal + laborTotal;
  const materialPerKg = sheetKg > 0 ? materialTotal / sheetKg : 0;
  const laborPerKg = sheetKg > 0 ? laborTotal / sheetKg : 0;

  return {
    lines: computedLines,
    sheetAllowancePct,
    rawSheetKg,
    sheetKg,
    bom,
    sectionTotals,
    materialTotal,
    laborTotal,
    grandTotal,
    materialPerKg,
    laborPerKg,
    totalPerKg: materialPerKg + laborPerKg,
  };
}
