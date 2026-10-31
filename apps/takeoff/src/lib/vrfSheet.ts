import ExcelJS from "exceljs";
import type { Project } from "./types";
import { LABOR_ROW, ROLE_LABELS, type VrfBrand } from "./vrf";
import { type VrfBillForSystem, type VrfPricing, vrfBillFor, vrfSystems } from "./vrfItems";

/**
 * The reference workbook "Levantamento VRF Completo", rebuilt for the systems of a takeoff:
 * a Cálculos sheet with one block per system (one row per measured run, diameters derived from
 * the brand's rules) and a Resultados sheet with each system's bill, unit prices and totals.
 * Built from scratch with ExcelJS (the original's formulas are tied to fixed row positions).
 */
export async function buildVrfWorkbook(
  project: Project,
  pricing: VrfPricing,
  brands: readonly VrfBrand[],
  systemIds?: string[],
): Promise<Uint8Array> {
  const systems = vrfSystems(project).filter((s) => !systemIds || systemIds.includes(s.id));
  const bills = systems.map((s) => vrfBillFor(project, pricing, brands, s));
  const wb = new ExcelJS.Workbook();
  wb.creator = "RLP Takeoff";
  fillCalculos(wb.addWorksheet("Cálculos"), bills);
  fillResultados(wb.addWorksheet("Resultados"), bills, project.currency);
  fillRegras(wb.addWorksheet("Regras"), brands);
  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}

const bold = { bold: true } as const;
const head = (ws: ExcelJS.Worksheet, r: number, values: (string | number)[]) => {
  const row = ws.getRow(r);
  values.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    c.font = bold;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
};

function fillCalculos(ws: ExcelJS.Worksheet, bills: VrfBillForSystem[]) {
  ws.columns = [
    { width: 28 },
    { width: 24 },
    { width: 30 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];
  let r = 1;
  for (const b of bills) {
    ws.getCell(r, 1).value = `${b.item.name} · ${b.brand.name} · ${b.hp} HP`;
    ws.getCell(r, 1).font = { bold: true, size: 12 };
    ws.getCell(r, 4).value = "Sistemas iguais";
    ws.getCell(r, 5).value = b.item.manualQty ?? 1;
    r++;
    head(ws, r, [
      "Sistema",
      "Local",
      "Trecho",
      "Capacidade (HP)",
      "L (m)",
      "Vertical (m)",
      "Curvas (pç)",
      "Bitola gás",
      "Bitola líquido",
      "L total (m)",
    ]);
    r++;
    for (const run of b.sized) {
      const row = ws.getRow(r);
      row.getCell(1).value = b.item.name;
      row.getCell(2).value = run.tag ?? "";
      row.getCell(3).value = ROLE_LABELS[run.spec.role];
      row.getCell(4).value = run.hp;
      row.getCell(5).value = round2(run.length - (run.vertical ?? 0));
      row.getCell(6).value = run.vertical ?? 0;
      row.getCell(7).value = run.spec.curves;
      row.getCell(8).value = `${run.gas}"`;
      row.getCell(9).value = `${run.liquid}"`;
      row.getCell(10).value = round2(run.length);
      r++;
    }
    ws.getCell(r, 3).value = "Evaporadoras";
    ws.getCell(r, 4).value = b.summary.evaporators;
    ws.getCell(r, 5).value = "Comprimento da linha (m)";
    ws.getCell(r, 7).value = round2(b.summary.lineLength);
    r += 2;
  }
}

function fillResultados(ws: ExcelJS.Worksheet, bills: VrfBillForSystem[], currency: string) {
  ws.columns = [
    { width: 8 },
    { width: 46 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  const money = `"${currency === "BRL" ? "R$" : currency}" #,##0.00`;
  let r = 1;
  bills.forEach((b, bi) => {
    ws.getCell(r, 1).value = bi + 1;
    ws.getCell(r, 2).value = `${b.item.name} · ${b.brand.name} · ${b.hp} HP`;
    ws.getCell(r, 1).font = bold;
    ws.getCell(r, 2).font = bold;
    r++;
    head(ws, r, [
      "Item",
      "Descrição",
      "Unid.",
      "Quant.",
      "Material",
      "M. de obra",
      "Total material",
      "Total M.O.",
      "Total",
    ]);
    r++;
    const first = r;
    b.rows.forEach((row, i) => {
      const x = ws.getRow(r);
      const unitMaterial = row.name === LABOR_ROW ? 0 : b.price(row);
      const unitLabor = row.name === LABOR_ROW ? row.labor : 0;
      x.getCell(1).value = `${bi + 1}.${i + 1}`;
      x.getCell(2).value = row.name;
      x.getCell(3).value = row.unit;
      x.getCell(4).value = row.qty;
      x.getCell(5).value = unitMaterial;
      x.getCell(6).value = unitLabor;
      x.getCell(7).value = {
        formula: `ROUND(D${r}*E${r},2)`,
        result: round2(row.qty * unitMaterial),
      };
      x.getCell(8).value = { formula: `ROUND(D${r}*F${r},2)`, result: round2(row.qty * unitLabor) };
      x.getCell(9).value = {
        formula: `G${r}+H${r}`,
        result: round2(row.qty * (unitMaterial + unitLabor)),
      };
      for (const c of [5, 6, 7, 8, 9]) x.getCell(c).numFmt = money;
      r++;
    });
    const last = r - 1;
    ws.getCell(r, 2).value = `Total por sistema (${b.item.manualQty ?? 1} ×)`;
    ws.getCell(r, 2).font = bold;
    if (last >= first) {
      ws.getCell(r, 7).value = { formula: `SUM(G${first}:G${last})`, result: b.totals.material };
      ws.getCell(r, 8).value = { formula: `SUM(H${first}:H${last})`, result: b.totals.labor };
      ws.getCell(r, 9).value = {
        formula: `SUM(I${first}:I${last})`,
        result: round2(b.totals.material + b.totals.labor),
      };
      for (const c of [7, 8, 9]) {
        ws.getCell(r, c).numFmt = money;
        ws.getCell(r, c).font = bold;
      }
    }
    r += 2;
  });
}

function fillRegras(ws: ExcelJS.Worksheet, brands: readonly VrfBrand[]) {
  ws.columns = [{ width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];
  let r = 1;
  for (const b of brands) {
    ws.getCell(r, 1).value = b.name;
    ws.getCell(r, 1).font = { bold: true, size: 12 };
    r++;
    for (const key of ["main", "trunk", "branch"] as const) {
      head(ws, r, [ROLE_LABELS[key], "HP mín.", "Gás", "Líquido"]);
      r++;
      for (const row of [...b[key]].sort((a, c) => a.hp - c.hp)) {
        ws.getCell(r, 2).value = row.hp;
        ws.getCell(r, 3).value = `${row.gas}"`;
        ws.getCell(r, 4).value = `${row.liquid}"`;
        r++;
      }
    }
    head(ws, r, ["Y-kit", "HP mín.", "Modelo"]);
    r++;
    for (const row of [...b.ykit].sort((a, c) => a.hp - c.hp)) {
      ws.getCell(r, 2).value = row.hp;
      ws.getCell(r, 3).value = row.model;
      r++;
    }
    r++;
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
