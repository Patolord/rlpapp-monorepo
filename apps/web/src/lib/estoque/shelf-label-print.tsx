import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ShelfLabelRow, ShelfLabelSheet } from "./shelf-labels";

/**
 * Folha de etiquetas de prateleira para imprimir: QR com o SKU (o cadastro em
 * campo do app lê e abre o item), SKU, nome + variação e endereço. Abre numa
 * janela própria e chama a impressão, como as etiquetas de QR das obras.
 * Na impressão, use escala 100% / "tamanho real" para bater com a folha adesiva.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function ShelfLabel({ row }: { row: ShelfLabelRow }) {
  const title = row.variantLabel ? `${row.name} — ${row.variantLabel}` : row.name;
  return (
    <div className="label">
      <QRCodeSVG value={row.sku ?? ""} level="M" marginSize={0} />
      <div className="text">
        <p className="sku">{row.sku}</p>
        <p className="name">{title}</p>
        <div className="bottom">
          {row.physicalAddress ? <p className="address">{row.physicalAddress}</p> : null}
          {row.unit ? <p className="unit">{row.unit}</p> : null}
        </div>
      </div>
    </div>
  );
}

function buildSheetsMarkup(labels: readonly ShelfLabelRow[], perSheet: number) {
  const sheets: ShelfLabelRow[][] = [];
  for (let i = 0; i < labels.length; i += perSheet) sheets.push(labels.slice(i, i + perSheet));
  return renderToStaticMarkup(
    <>
      {sheets.map((sheet, index) => (
        <div className="sheet" key={index}>
          {sheet.map((row, i) => (
            <ShelfLabel key={`${row.balanceId}-${i}`} row={row} />
          ))}
        </div>
      ))}
    </>
  );
}

export function buildShelfLabelDocument(labels: readonly ShelfLabelRow[], sheet: ShelfLabelSheet): string {
  const gridWidth = sheet.columns * sheet.widthMm + (sheet.columns - 1) * sheet.gapMm;
  const gridHeight = sheet.rows * sheet.heightMm + (sheet.rows - 1) * sheet.gapMm;
  const marginX = Math.max((A4_WIDTH_MM - gridWidth) / 2, 0);
  const marginY = Math.max((A4_HEIGHT_MM - gridHeight) / 2, 0);
  const large = sheet.size === "large";
  const qrMm = Math.min(sheet.heightMm - (large ? 14 : 8), sheet.widthMm * 0.45);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`Etiquetas de prateleira (${labels.length})`)}</title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
      .sheet {
        width: ${A4_WIDTH_MM}mm;
        height: ${A4_HEIGHT_MM}mm;
        padding: ${marginY}mm ${marginX}mm;
        display: grid;
        grid-template-columns: repeat(${sheet.columns}, ${sheet.widthMm}mm);
        grid-auto-rows: ${sheet.heightMm}mm;
        gap: ${sheet.gapMm}mm;
        align-content: start;
        break-after: page;
        page-break-after: always;
        overflow: hidden;
      }
      .sheet:last-child { break-after: auto; page-break-after: auto; }
      .label {
        display: flex;
        align-items: center;
        gap: ${large ? 5 : 2.5}mm;
        padding: ${large ? 6 : 3}mm;
        overflow: hidden;
        ${sheet.cutBorder ? "border: 0.3mm dashed #9ca3af;" : ""}
      }
      svg { flex: none; width: ${qrMm}mm; height: ${qrMm}mm; }
      .text { min-width: 0; flex: 1; display: flex; flex-direction: column; height: 100%; justify-content: space-between; }
      p { margin: 0; }
      .sku { font-family: ui-monospace, Menlo, Consolas, "Courier New", monospace; font-weight: 700; font-size: ${large ? 15 : 9.5}pt; letter-spacing: 0.02em; }
      .name {
        font-size: ${large ? 13 : 7.5}pt;
        line-height: 1.2;
        display: -webkit-box;
        -webkit-line-clamp: ${large ? 4 : 3};
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
      .address { font-weight: 700; font-size: ${large ? 20 : 11}pt; }
      .unit { margin-left: auto; color: #4b5563; font-size: ${large ? 11 : 7}pt; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    ${buildSheetsMarkup(labels, sheet.columns * sheet.rows)}
    <script>
      window.addEventListener("load", () => { window.focus(); window.print(); });
    </script>
  </body>
</html>`;
}

/** Abre a janela de impressão; devolve false se o navegador bloqueou o pop-up. */
export function printShelfLabels(labels: readonly ShelfLabelRow[], sheet: ShelfLabelSheet): boolean {
  if (labels.length === 0) return true;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildShelfLabelDocument(labels, sheet));
  printWindow.document.close();
  return true;
}
