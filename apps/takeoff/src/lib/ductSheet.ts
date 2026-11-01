import ExcelJS from "exceljs";
import type { CatalogEntry } from "./catalog";
import { ductBillFor, ductNetworks } from "./ductItems";
import {
  DEFAULT_DUCT_SETTINGS,
  type DuctFlange,
  type DuctInner,
  type DuctInsulation,
  type DuctRun,
  type DuctSettings,
  GAUGES,
  type GaugeWeights,
  gaugeKgm2,
} from "./ducts";
import { foldName } from "./text";
import type { Project } from "./types";

/** Where the bundled copy of RLP's "Levantamento Dutos Conforme Norma NBR 16401" workbook lives. */
export const DUCT_TEMPLATE_URL = "/templates/levantamento-dutos.xlsx";

/** First data row of the "Levantamento dutos" sheet and how many it has. */
const FIRST_ROW = 13;
const MAX_ROWS = 289;

export interface DuctSheetInput {
  client: string;
  site: string;
  system: string;
  proposalNumber: string;
  settings: DuctSettings;
  runs: DuctRun[];
  /** Unit prices by bill row name (the app's derived items / catalog); missing ones keep the template's. */
  prices: Record<string, number>;
  /** Sheet weight (kg/m²) per gauge, in GAUGES order; absent = the template's own table. */
  gaugeKgm2?: number[];
}

const INSULATION_TEXT: Record<DuctInsulation, string> = {
  S: "S = sem isolamento",
  L: "L = Manta lã vidro",
  I: "I = Isopor",
  P: "P = Placa lã vidro",
  T: "T = Pintura",
};
const INNER_TEXT: Record<DuctInner, string> = {
  S: "S = sem isol.",
  B: "B = Bidim",
  F: "F = Flexiliner",
};
const FLANGE_TEXT: Record<DuctFlange, string> = {
  P: "P = Powermatic",
  C: "C = Cantoneira",
  S: "S = sem flange",
};
const yesNo = (v: boolean) => (v ? "S = sim" : "N = não");

/** Tab_Precos cells ↔ the app's bill row names. */
export const PRICE_CELLS: [string, string][] = [
  ["E4", "Chapa galvanizada # 26"],
  ["E5", "Chapa galvanizada # 24"],
  ["E6", "Chapa galvanizada # 22"],
  ["E7", "Chapa galvanizada # 20"],
  ["E8", "Chapa galvanizada # 18"],
  ["E9", "Chapa galvanizada # 26 (rechapeamento)"],
  ["E10", "Chapa galvanizada # 26 (cantoneira)"],
  ["E14", "Isopor F1"],
  ["E15", "Manta lã de vidro"],
  ["E16", "Placa lã de vidro"],
  ["E17", "Bidim OP-60"],
  ["E18", "Flexiliner"],
  ["E19", "Cola HI-17 ou Over-cola"],
  ["E20", "Frio Asfalto"],
  ["E21", 'Fita de Nylon ½"'],
  ["E22", 'Fecho p/ fita de nylon ½"'],
  ["E23", "Fita aluminizada"],
  ["E29", "Tinta de fundo - Zarcão"],
  ["E30", "Tinta Acabamento"],
  ["E31", "Trincha / rolinho"],
  ["E32", "Tinner"],
  ["E36", "Suportes de dutos"],
  ["E46", "Powermatic (PW2 leve)"],
  ["E47", "Powermatic (PW2)"],
  ["E48", "Cantos Powermatic"],
  ["E49", "Grampo Powermatic"],
  ["E50", "Rebite"],
  ["E51", "Fita Adesiva Powermatic"],
  ["E54", "Flange em Fº Cantoneira"],
];

/** Everything the workbook needs for one duct network (by its item id). */
export function ductSheetInput(
  project: Project,
  catalog: readonly CatalogEntry[],
  networkId: string,
  gaugeWeights?: GaugeWeights,
): DuctSheetInput {
  const network = ductNetworks(project).find((n) => n.id === networkId);
  if (!network) throw new Error("rede de dutos não encontrada");
  const bill = ductBillFor(project, catalog, network, undefined, gaugeWeights);
  const prices: Record<string, number> = {};
  for (const [, name] of PRICE_CELLS) {
    const row = bill.rows.find((r) => r.name === name);
    if (row) prices[name] = bill.price(row);
    else {
      const own = project.ductPrices?.[name];
      const cat = catalog.find((e) => foldName(e.name) === foldName(name));
      const p = own ?? cat?.materialPrice;
      if (p !== undefined) prices[name] = p;
    }
  }
  return {
    client: project.client,
    site: project.site,
    system: network.system || project.system,
    proposalNumber: project.proposalNumber,
    settings: project.duct ?? DEFAULT_DUCT_SETTINGS,
    runs: bill.runs,
    prices,
    gaugeKgm2: gaugeKgm2(gaugeWeights),
  };
}

/** Calculos columns of the area per gauge (# 26 … # 18). */
const GAUGE_COLUMNS = ["B", "C", "D", "E", "F"];

/**
 * The template hardcodes its own sheet weights (4,5 / 5,7 / 6,8 / 8,1 / 10,5 kg/m²): in the gauge
 * table, in the kg formulas of row 303 and as the # 26 weight of rechapeamento and cantoneira.
 * Put the app's weights in all of them so the workbook's kg match the app's bill.
 */
function writeGaugeWeights(calc: ExcelJS.Worksheet, kgm2: number[]) {
  const label = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg/m²`;
  GAUGES.forEach((_, i) => {
    const kg = kgm2[i];
    const col = GAUGE_COLUMNS[i];
    calc.getCell(`C${3 + i}`).value = kg;
    calc.getCell(`${col}11`).value = label(kg);
    calc.getCell(`${col}303`).value = { formula: `${col}302*${kg}` };
  });
  for (const col of ["Q", "AD", "AE"]) calc.getCell(`${col}303`).value = kgm2[0];
}

/**
 * Fill a copy of the reference workbook: header, parameters, one "Levantamento dutos" row per
 * run and the price table. Formulas are untouched; Excel recalculates on open.
 */
export async function fillDuctWorkbook(
  template: ArrayBuffer | Uint8Array,
  input: DuctSheetInput,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ArrayBuffer);
  const principal = wb.getWorksheet("Principal");
  const lev = wb.getWorksheet("Levantamento dutos");
  const precos = wb.getWorksheet("Tab_Precos");
  const calc = wb.getWorksheet("Calculos");
  if (!principal || !lev || !precos || !calc) throw new Error("modelo de planilha inesperado");

  const s = input.settings;
  principal.getCell("D6").value = input.client;
  principal.getCell("D7").value = input.site;
  principal.getCell("D8").value = input.system;
  principal.getCell("D9").value = input.proposalNumber;
  principal.getCell("G12").value = s.norma;
  principal.getCell("G14").value = s.laborPerKg;
  if (s.sheetSlackPct !== null) principal.getCell("G16").value = s.sheetSlackPct;
  principal.getCell("G20").value = s.insulSlackPct;
  principal.getCell("G24").value = s.supportsPct;

  lev.getCell("E12").value = s.insulThickness;
  lev.getCell("G12").value = s.flangeSpacing;
  lev.getCell("H12").value = s.rechapThickness;

  const runs = input.runs.slice(0, MAX_ROWS);
  runs.forEach((r, i) => {
    const row = lev.getRow(FIRST_ROW + i);
    row.getCell(1).value = r.tag ?? "";
    row.getCell(2).value = r.spec.a;
    row.getCell(3).value = r.spec.b;
    row.getCell(4).value = Math.round(r.length * 100) / 100;
    row.getCell(5).value = INSULATION_TEXT[r.spec.insulation];
    row.getCell(6).value = INNER_TEXT[r.spec.inner];
    row.getCell(7).value = FLANGE_TEXT[r.spec.flange];
    row.getCell(8).value = yesNo(r.spec.rechapeado);
    row.getCell(9).value = yesNo(r.spec.rechapeado && r.spec.paintRechap);
  });
  // rows the template pre-fills with zeros/defaults after our runs stay harmless (length 0)
  for (const [cell, name] of PRICE_CELLS) {
    const p = input.prices[name];
    if (p !== undefined) precos.getCell(cell).value = p;
  }
  if (input.gaugeKgm2) writeGaugeWeights(calc, input.gaugeKgm2);
  wb.calcProperties.fullCalcOnLoad = true;
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}
